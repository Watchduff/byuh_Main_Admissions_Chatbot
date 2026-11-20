import { embeddingModel, isAuthError } from './ai';
import { embed } from 'ai';
import pLimit from 'p-limit';
import { db } from '../db/index';
import { byuhChunks, scrapeRuns, scrapeSiteState } from '../db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  crawlSite,
  MAX_PAGES_PER_SITE,
  newCrawlState,
  SITE_CONFIGS,
  type CrawlState,
  type ScrapedPage,
  type SiteConfig,
} from './scraper';
import { chunkText } from './chunker';

const EMBED_CONCURRENCY = 8;

/**
 * How long one batch may run. The Vercel functions that call `runIngestBatch`
 * are capped at `maxDuration = 300`, so we stop starting new work at 270s and
 * leave the rest for bookkeeping (reindex + writing the run row).
 */
export const BATCH_BUDGET_MS = 270_000;
/**
 * Stop starting new pages this long before the batch deadline: enough for one
 * slow page (15s fetch timeout + embedding) to finish saving.
 */
const PAGE_RESERVE_MS = 30_000;
/** Save crawl progress every this many pages, in case the function is killed. */
const CHECKPOINT_EVERY = 10;
/**
 * When a completed pass would delete more than this share of a site's stored
 * pages (and more than STALE_GUARD_MIN of them), skip the cleanup and flag it:
 * that looks more like a broken page or menu than a real site change.
 */
const STALE_GUARD_SHARE = 0.5;
const STALE_GUARD_MIN = 10;
/** Rough cost of one page (fetch + politeness delay + embed), used to pack a batch. */
const SECONDS_PER_PAGE = 2.1;
const SITE_OVERHEAD_SECONDS = 15;

/** The scheduled job leaves a subdomain alone until its last scrape is this old. */
export const MIN_REFRESH_DAYS = 14;
/**
 * A run still marked 'running' after this long is treated as dead (the
 * function was killed). Batches finish in under 5 minutes, so 10 is generous.
 */
export const ACTIVE_RUN_MINUTES = 10;

/**
 * A problem that will fail every subdomain the same way (today: OpenAI
 * rejecting our API key). Scraping more sites would just burn through the
 * queue without saving anything, so the batch stops and the site is put back
 * in the queue.
 */
export class FatalIngestError extends Error {}

function fatalFrom(err: unknown): FatalIngestError | null {
  if (err instanceof FatalIngestError) return err;
  if (isAuthError(err)) {
    return new FatalIngestError(
      'OpenAI rejected the API key, so no pages can be embedded or saved. ' +
        'Update OPENAI_API_KEY in the environment, then run the scrape again.'
    );
  }
  return null;
}

/**
 * - success: the crawl pass finished; stale pages were removed.
 * - partial: ran out of time; the pass resumes in the next batch.
 * - incomplete: the site started refusing us, so the pass was abandoned.
 *   Pages saved so far are kept, nothing was deleted, and it needs another
 *   scrape.
 * - empty: the pass finished without reading a single page.
 * - error: something else went wrong.
 */
export type SiteStatus = 'success' | 'partial' | 'incomplete' | 'empty' | 'error';

export interface SiteResult {
  source: string;
  label: string;
  status: SiteStatus;
  pages: number;
  chunks: number;
  error: string | null;
}

export interface IngestStats {
  runId: number;
  sitesScraped: number;
  pagesIngested: number;
  chunksWritten: number;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}

export interface IngestOptions {
  /** Restrict the crawl to specific `source` identifiers. */
  sourceFilter?: string[];
  /** Where the run was kicked off from — recorded in `scrape_runs`. */
  trigger?: 'cron' | 'manual' | 'cli';
  /** Admin email for manual runs; null/undefined for cron and CLI. */
  triggeredBy?: string | null;
}

// ---------------------------------------------------------------------------
// Per-subdomain state (scrape_site_state)
// ---------------------------------------------------------------------------

let stateTableReady: Promise<unknown> | null = null;

/**
 * Create `scrape_site_state` if it isn't there yet. `npm run db:migrate`
 * creates it too; doing it here as well means a deploy can't break the
 * scheduled scrape just because the migration wasn't run.
 */
export function ensureStateTable(): Promise<unknown> {
  stateTableReady ??= db
    .execute(sql`
      CREATE TABLE IF NOT EXISTS scrape_site_state (
        source TEXT PRIMARY KEY,
        last_started_at TIMESTAMPTZ,
        last_finished_at TIMESTAMPTZ,
        last_status TEXT,
        last_pages INTEGER NOT NULL DEFAULT 0,
        last_chunks INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        requested_at TIMESTAMPTZ
      )
    `)
    .then(() =>
      db.execute(sql`
        ALTER TABLE scrape_site_state
          ADD COLUMN IF NOT EXISTS crawl_started_at TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS crawl_state JSONB,
          ADD COLUMN IF NOT EXISTS crawl_pages INTEGER NOT NULL DEFAULT 0
      `)
    )
    .catch((err) => {
      stateTableReady = null;
      throw err;
    });
  return stateTableReady;
}

export async function getSiteStates() {
  await ensureStateTable();
  const rows = await db.select().from(scrapeSiteState);
  return new Map(rows.map((r) => [r.source, r]));
}

/**
 * Mark the given subdomains (default: every configured one) as "refresh
 * requested". Requested sites jump the queue: manual batches work through
 * them, and if the admin closes the page the queue cron (every few minutes)
 * carries on with whatever is left. Sites already queued keep their place.
 */
export async function queueRefresh(sources?: string[]): Promise<void> {
  await ensureStateTable();
  const now = new Date();
  const sites = sources ? SITE_CONFIGS.filter((s) => sources.includes(s.source)) : SITE_CONFIGS;
  if (sites.length === 0) return;
  await db
    .insert(scrapeSiteState)
    .values(sites.map((s) => ({ source: s.source, requestedAt: now })))
    .onConflictDoUpdate({
      target: scrapeSiteState.source,
      set: { requestedAt: sql`COALESCE(scrape_site_state.requested_at, EXCLUDED.requested_at)` },
    });
}

type SiteState = typeof scrapeSiteState.$inferSelect;

/**
 * Waiting to be worked on by the queue: an admin asked for it, or its crawl
 * ran out of time and should carry on. (A pass whose function was killed
 * mid-site is resumed too, but by the regular schedule, so one site that
 * keeps crashing can't hog the queue.)
 */
export function isPending(st: SiteState | undefined): boolean {
  return Boolean(st?.requestedAt || (st?.crawlStartedAt && st.lastStatus === 'partial'));
}

export async function countQueued(): Promise<number> {
  const states = await getSiteStates();
  return SITE_CONFIGS.filter((s) => isPending(states.get(s.source))).length;
}

// A run is alive while its heartbeat (or, before the first beat, its start)
// is recent. Long CLI runs keep beating, so they stay alive past the window.
const runIsLive = sql`COALESCE(${scrapeRuns.heartbeatAt}, ${scrapeRuns.startedAt}) > NOW() - make_interval(mins => ${ACTIVE_RUN_MINUTES})`;

export async function hasActiveRun(): Promise<boolean> {
  await ensureRunLock();
  const rows = await db
    .select({ id: scrapeRuns.id })
    .from(scrapeRuns)
    .where(sql`${scrapeRuns.status} = 'running' AND ${runIsLive}`)
    .limit(1);
  return rows.length > 0;
}

/** Thrown by startRun when another scrape is already running. */
export class ScrapeBusyError extends Error {
  constructor() {
    super('Another scrape is already running. Wait for it to finish, then try again.');
  }
}

let runLockReady: Promise<unknown> | null = null;

/**
 * Only one scrape may run at a time: two overlapping runs overwrite each
 * other's crawl_started_at and their stale-page cleanup deletes the pages the
 * other run just saved. A unique index over "running" rows lets the database
 * enforce that. Created on demand so deployments that skip migrate get it too.
 */
function ensureRunLock(): Promise<unknown> {
  runLockReady ??= db
    .execute(sql`ALTER TABLE scrape_runs ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMPTZ`)
    .then(() => expireDeadRuns())
    .then(() =>
      db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS scrape_runs_one_running
        ON scrape_runs ((true)) WHERE status = 'running'
      `)
    )
    .catch((err) => {
      runLockReady = null;
      throw err;
    });
  return runLockReady;
}

/** Close out runs that stopped heartbeating (killed process) so they don't block new ones. */
async function expireDeadRuns() {
  await db
    .update(scrapeRuns)
    .set({
      status: 'error',
      error: sql`COALESCE(${scrapeRuns.error}, 'Abandoned: the run stopped responding before it finished.')`,
      finishedAt: sql`NOW()`,
    })
    .where(sql`${scrapeRuns.status} = 'running' AND NOT (${runIsLive})`);
}

function isUniqueViolation(err: unknown): boolean {
  let e: unknown = err;
  for (let depth = 0; e && depth < 5; depth++) {
    if ((e as { code?: string }).code === '23505') return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

// ---------------------------------------------------------------------------
// One subdomain: scrape → chunk → embed → save
// ---------------------------------------------------------------------------

/**
 * Re-scrape one subdomain and replace its stored chunks page by page. Each
 * page is embedded first; only then are its old chunks swapped for the new
 * ones, so a failed embedding never leaves a page with nothing stored.
 *
 * A crawl pass can span several batches: if `deadline` hits first, progress
 * is saved and the next call resumes it. When a pass completes, pages from
 * this site that it didn't save (removed from the site, or no longer linked)
 * are deleted. Nothing is deleted after a pass that was cut short.
 *
 * Ordinary failures are returned and recorded in `scrape_site_state` so one
 * bad site can't sink a whole batch. A `FatalIngestError` is thrown instead
 * (after re-queueing the site) because every other site would fail too.
 */
async function ingestSite(site: SiteConfig, deadline?: number): Promise<SiteResult> {
  await ensureStateTable();
  const startedAt = new Date();
  const [prior] = await db.select().from(scrapeSiteState).where(eq(scrapeSiteState.source, site.source));
  const resuming = Boolean(prior?.crawlStartedAt && prior.crawlState);
  const crawl: CrawlState = resuming ? prior!.crawlState! : newCrawlState(site);
  let passPages = resuming ? prior!.crawlPages : 0;

  const starting = {
    lastStartedAt: startedAt,
    lastStatus: 'running',
    lastError: null,
    // Clear the request up front: if this function is killed mid-site, the
    // site goes to the back of the queue instead of being retried forever.
    requestedAt: null,
    // A new pass is stamped with the database's clock, the same clock that
    // stamps byuh_chunks.created_at, so the stale-page check can compare them.
    ...(resuming ? {} : { crawlStartedAt: sql`NOW()`, crawlState: crawl, crawlPages: 0 }),
  };
  await db
    .insert(scrapeSiteState)
    .values({ source: site.source, ...starting })
    .onConflictDoUpdate({ target: scrapeSiteState.source, set: starting });

  const saveProgress = () =>
    db
      .update(scrapeSiteState)
      .set({ crawlState: crawl, crawlPages: passPages })
      .where(eq(scrapeSiteState.source, site.source));

  let pages = 0;
  let chunks = 0;
  let status: SiteStatus = 'success';
  let error: string | null = null;
  let fatal: FatalIngestError | null = null;
  // Keep the pass for the next batch (only when it was cut off by time, or
  // by a problem that isn't this site's fault).
  let keepPass = false;

  try {
    const outcome = await crawlSite(site, crawl, {
      deadline: deadline ? deadline - PAGE_RESERVE_MS : undefined,
      onPage: async (page) => {
        chunks += await savePage(page);
        pages += 1;
        passPages += 1;
      },
      afterPage: async () => {
        if (crawl.visited.length % CHECKPOINT_EVERY === 0) await saveProgress();
      },
    });

    if (outcome === 'timeout') {
      status = 'partial';
      error =
        `Ran out of time after ${passPages} pages (${crawl.visited.length} URLs checked). ` +
        'It continues where it left off in the next batch.';
      keepPass = true;
    } else if (outcome === 'blocked') {
      status = 'incomplete';
      error =
        `The site started refusing requests, so the scrape stopped after ${passPages} pages. ` +
        'Pages already stored were kept and nothing was deleted. It needs to be scraped again.';
    } else if (passPages === 0) {
      status = 'empty';
      error = 'No pages could be read. The site may be down or blocking this server.';
    } else {
      error = await removeStalePages(site, crawl.kept);
    }
  } catch (err) {
    fatal = fatalFrom(err);
    status = 'error';
    error = (fatal ?? (err as Error)).message?.slice(0, 500) ?? 'Unknown error';
    keepPass = Boolean(fatal);
    console.error(`Failed to ingest ${site.label}:`, error);
  }

  await db
    .update(scrapeSiteState)
    .set({
      lastFinishedAt: new Date(),
      lastStatus: status,
      lastPages: pages,
      lastChunks: chunks,
      lastError: error,
      // Not this site's fault: keep its place in the queue for the next try.
      ...(fatal ? { requestedAt: startedAt } : {}),
      ...(keepPass
        ? { crawlState: crawl, crawlPages: passPages }
        : { crawlStartedAt: null, crawlState: null, crawlPages: 0 }),
    })
    .where(eq(scrapeSiteState.source, site.source));

  if (fatal) throw fatal;

  console.log(`✓ ${site.label}: ${status}, ${pages} pages, ${chunks} chunks`);
  return { source: site.source, label: site.label, status, pages, chunks, error };
}

/** Embed one page and swap it in for that URL's old chunks. Returns the chunk count. */
async function savePage(page: ScrapedPage): Promise<number> {
  const pageChunks = chunkText(page.content);
  console.log(`Processing ${page.url} → ${pageChunks.length} chunks [${page.source}]`);
  const limit = pLimit(EMBED_CONCURRENCY);
  const embeddings = await Promise.all(
    pageChunks.map((chunk) =>
      limit(async () => {
        const { embedding } = await embed({
          model: embeddingModel,
          value: chunk,
        });
        return embedding;
      })
    )
  );

  // Replace this URL's stale chunks in one go.
  await db.transaction(async (tx) => {
    await tx.delete(byuhChunks).where(eq(byuhChunks.url, page.url));
    if (pageChunks.length > 0) {
      await tx.insert(byuhChunks).values(
        pageChunks.map((chunk, idx) => ({
          url: page.url,
          title: page.title,
          content: chunk,
          chunkIndex: idx,
          source: page.source,
          embedding: embeddings[idx],
        }))
      );
    }
  });
  return pageChunks.length;
}

/**
 * After a complete pass: delete this site's pages that the pass didn't save,
 * except ones it couldn't read for a possibly temporary reason (`kept`).
 * Returns a warning when the cleanup was skipped, else null.
 */
async function removeStalePages(site: SiteConfig, kept: string[]): Promise<string | null> {
  // Without a pass start time every page compares as stale, so the whole
  // site would be wiped. That only happens if something else reset the pass
  // mid-crawl (e.g. an overlapping run); delete nothing.
  const [state] = await db
    .select({ crawlStartedAt: scrapeSiteState.crawlStartedAt })
    .from(scrapeSiteState)
    .where(eq(scrapeSiteState.source, site.source));
  if (!state?.crawlStartedAt) {
    const msg =
      'Cleanup skipped: this pass lost its start time (another scrape may have run at the same time), ' +
      'so no pages were removed. Scrape it again to clean up.';
    console.warn(`${site.label}: ${msg}`);
    return msg;
  }

  const keep = new Set(kept);
  // Compared in SQL so both timestamps come from the database clock.
  const rows = await db.execute<{ url: string; fresh: boolean }>(sql`
    SELECT url,
           BOOL_OR(created_at >= (SELECT crawl_started_at FROM scrape_site_state WHERE source = ${site.source})) AS fresh
      FROM byuh_chunks
     WHERE source = ${site.source}
     GROUP BY url
  `);
  const total = rows.rows.length;
  const stale = rows.rows.filter((r) => !r.fresh && !keep.has(r.url)).map((r) => r.url);
  if (stale.length === 0) return null;

  if (stale.length > STALE_GUARD_MIN && stale.length > total * STALE_GUARD_SHARE) {
    const msg =
      `Cleanup skipped: this scrape would have removed ${stale.length} of ${total} stored pages, ` +
      'which looks like a problem with the site rather than a real change. Check the site and scrape it again.';
    console.warn(`${site.label}: ${msg}`);
    return msg;
  }

  await db.delete(byuhChunks).where(and(eq(byuhChunks.source, site.source), inArray(byuhChunks.url, stale)));
  console.log(`${site.label}: removed ${stale.length} stale pages`);
  return null;
}

// Retrain the IVFFlat index on the fresh chunks. The index is created once
// (CREATE INDEX IF NOT EXISTS), so without this its cluster centroids stay
// trained on whatever the table looked like at first migrate — and
// approximate search silently misses relevant chunks.
async function reindex() {
  console.log('Reindexing byuh_chunks_embedding_idx...');
  // Building IVFFlat needs more than Postgres's default 64MB maintenance_work_mem
  // once the table grows, so raise it for this transaction only.
  await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL maintenance_work_mem = '256MB'`);
    await tx.execute(sql`REINDEX INDEX byuh_chunks_embedding_idx`);
  });
}

// ---------------------------------------------------------------------------
// Run bookkeeping (scrape_runs)
// ---------------------------------------------------------------------------

const HEARTBEAT_MS = 60 * 1000;

interface ActiveRun {
  id: number;
  stopHeartbeat: () => void;
}

/**
 * Record the run up front so an in-progress (or crashed) run is visible, and
 * claim the one "running" slot. Throws ScrapeBusyError if another run holds it.
 */
async function startRun(trigger: string, triggeredBy: string | null, startedAt: Date): Promise<ActiveRun> {
  await ensureRunLock();
  await expireDeadRuns();
  let id: number;
  try {
    const [run] = await db
      .insert(scrapeRuns)
      .values({ status: 'running', trigger, triggeredBy, startedAt, heartbeatAt: sql`NOW()` })
      .returning({ id: scrapeRuns.id });
    id = run.id;
  } catch (err) {
    if (isUniqueViolation(err)) throw new ScrapeBusyError();
    throw err;
  }

  const timer = setInterval(() => {
    db.update(scrapeRuns)
      .set({ heartbeatAt: sql`NOW()` })
      .where(eq(scrapeRuns.id, id))
      .catch((err) => console.warn('Heartbeat failed:', (err as Error).message));
  }, HEARTBEAT_MS);
  timer.unref?.();
  return { id, stopHeartbeat: () => clearInterval(timer) };
}

/**
 * A run that read nothing is a failure, not a success. (GitHub's runners get
 * 403 from every BYU–Hawaii site; those runs used to finish in seconds and be
 * recorded as successful.)
 */
function failureMessage(results: SiteResult[]): string | null {
  if (results.length === 0) return null;
  if (results.some((r) => r.pages > 0)) return null;
  const names = results.slice(0, 5).map((r) => r.label).join(', ');
  const more = results.length > 5 ? ` and ${results.length - 5} more` : '';
  const detail = results.find((r) => r.error)?.error ?? '';
  return `Scraped 0 pages from ${names}${more}. ${detail}`.trim();
}

async function finishRun(run: ActiveRun, startedAt: Date, results: SiteResult[], error: string | null) {
  run.stopHeartbeat();
  const runId = run.id;
  const finishedAt = new Date();
  const stats: IngestStats = {
    runId,
    sitesScraped: results.filter((r) => r.pages > 0).length,
    pagesIngested: results.reduce((n, r) => n + r.pages, 0),
    chunksWritten: results.reduce((n, r) => n + r.chunks, 0),
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
  };
  await db
    .update(scrapeRuns)
    .set({
      status: error ? 'error' : 'success',
      error: error?.slice(0, 2000) ?? null,
      sitesScraped: stats.sitesScraped,
      pagesIngested: stats.pagesIngested,
      chunksWritten: stats.chunksWritten,
      finishedAt,
      durationMs: stats.durationMs,
    })
    .where(eq(scrapeRuns.id, runId));
  return stats;
}

// ---------------------------------------------------------------------------
// Full, unbounded ingestion — CLI only (`npm run ingest`)
// ---------------------------------------------------------------------------

/**
 * Re-scrape every configured BYU–Hawaii subdomain (or just `sourceFilter`) in
 * one go. This takes about an hour for the full list, so it only works where
 * nothing kills long processes: a terminal. On Vercel use `runIngestBatch`.
 *
 * Throws if nothing at all could be scraped.
 */
export async function runIngestion(options: IngestOptions = {}): Promise<IngestStats> {
  const { sourceFilter, trigger = 'cli', triggeredBy = null } = options;
  const startedAt = new Date();
  console.log(`Starting ingestion pipeline at ${startedAt.toISOString()}...`);

  let sites = SITE_CONFIGS;
  if (sourceFilter && sourceFilter.length > 0) {
    sites = SITE_CONFIGS.filter((s) => sourceFilter.includes(s.source));
    if (sites.length === 0) {
      throw new Error(
        `No sites matched source filter [${sourceFilter.join(', ')}]. ` +
          `Known sources: ${SITE_CONFIGS.map((s) => s.source).join(', ')}`
      );
    }
    console.log(`Filtering to ${sites.length} source(s): ${sites.map((s) => s.source).join(', ')}`);
  }

  const run = await startRun(trigger, triggeredBy, startedAt);
  const results: SiteResult[] = [];
  try {
    for (const site of sites) results.push(await ingestSite(site));
    if (results.some((r) => r.chunks > 0)) await reindex();
  } catch (err) {
    await finishRun(run, startedAt, results, (err as Error).message ?? 'Unknown error');
    throw err;
  }

  const error = failureMessage(results);
  const stats = await finishRun(run, startedAt, results, error);
  if (error) throw new Error(error);
  console.log('\nIngestion complete!', stats);
  return stats;
}

// ---------------------------------------------------------------------------
// Time-boxed batch — the VM cron and the admin page
// ---------------------------------------------------------------------------

export interface BatchOptions {
  trigger: 'cron' | 'manual';
  triggeredBy?: string | null;
  /** Scrape exactly this subdomain, regardless of the queue. */
  only?: string;
  /** Only work on subdomains with a pending manual request. */
  requestedOnly?: boolean;
  budgetMs?: number;
}

export interface BatchResult {
  /** 'busy' = another run is in flight; 'idle' = nothing was due. */
  outcome: 'ran' | 'busy' | 'idle';
  stats: IngestStats | null;
  sites: SiteResult[];
  error: string | null;
  /** Subdomains still waiting on a manual refresh request. */
  remainingQueued: number;
  /**
   * True when the batch hit a problem that will fail every subdomain (e.g. a
   * bad OpenAI key). Callers should stop looping and surface `error`.
   */
  fatal?: boolean;
}

/**
 * Work out which subdomains to scrape next, most urgent first:
 * manual requests (oldest request first), then sites that have never been
 * scraped or were last attempted more than MIN_REFRESH_DAYS ago (oldest first).
 * Ordering by last *attempt* means a failing site rotates to the back of the
 * queue instead of blocking everything behind it.
 */
async function buildQueue(requestedOnly: boolean): Promise<SiteConfig[]> {
  const states = await getSiteStates();
  const cutoff = Date.now() - MIN_REFRESH_DAYS * 24 * 60 * 60 * 1000;
  const time = (d: Date | null | undefined) => (d ? d.getTime() : 0);

  // Crawls that ran out of time go first so a pass finishes promptly, then
  // manual requests, oldest first.
  const pending = SITE_CONFIGS.filter((s) => isPending(states.get(s.source)));
  const resumeFirst = (s: SiteConfig) => {
    const st = states.get(s.source);
    return st?.crawlStartedAt && st.lastStatus === 'partial' ? 0 : 1;
  };
  pending.sort(
    (a, b) =>
      resumeFirst(a) - resumeFirst(b) ||
      time(states.get(a.source)?.requestedAt) - time(states.get(b.source)?.requestedAt)
  );
  if (requestedOnly) return pending;

  // Then sites not scraped for a while, plus any pass whose function was
  // killed mid-site.
  const due = SITE_CONFIGS.filter((s) => {
    const st = states.get(s.source);
    return !isPending(st) && (Boolean(st?.crawlStartedAt) || time(st?.lastStartedAt) < cutoff);
  }).sort((a, b) => time(states.get(a.source)?.lastStartedAt) - time(states.get(b.source)?.lastStartedAt));

  return [...pending, ...due];
}

/** Returns a FatalIngestError if embeddings can't work at all, else null. */
async function checkEmbeddings(): Promise<FatalIngestError | null> {
  try {
    await embed({ model: embeddingModel, value: 'ping' });
    return null;
  } catch (err) {
    // Only a bad key is fatal; anything else (a blip) is left to the real run.
    return isAuthError(err) ? fatalFrom(err) : null;
  }
}

async function knownPageCounts(): Promise<Map<string, number>> {
  const rows = await db
    .select({ source: byuhChunks.source, pages: sql<number>`COUNT(DISTINCT ${byuhChunks.url})::int` })
    .from(byuhChunks)
    .groupBy(byuhChunks.source);
  return new Map(rows.map((r) => [r.source, r.pages]));
}

/**
 * Scrape as many due subdomains as fit in one serverless invocation, then
 * return. Call it repeatedly (nightly cron, or the admin page in a loop) to
 * work through the whole list.
 */
export async function runIngestBatch(options: BatchOptions): Promise<BatchResult> {
  const { trigger, triggeredBy = null, only, requestedOnly = false, budgetMs = BATCH_BUDGET_MS } = options;
  const startedAt = new Date();
  const deadline = startedAt.getTime() + budgetMs;

  await ensureStateTable();
  if (await hasActiveRun()) {
    return { outcome: 'busy', stats: null, sites: [], error: null, remainingQueued: await countQueued() };
  }

  let queue: SiteConfig[];
  if (only) {
    const site = SITE_CONFIGS.find((s) => s.source === only);
    if (!site) throw new Error(`Unknown source "${only}".`);
    queue = [site];
  } else {
    queue = await buildQueue(requestedOnly);
  }
  if (queue.length === 0) {
    return { outcome: 'idle', stats: null, sites: [], error: null, remainingQueued: 0 };
  }

  // Check the OpenAI key before crawling anything: with a bad key every
  // page would be fetched and then thrown away, and the queue cron would
  // repeat that every few minutes.
  const preflight = await checkEmbeddings();
  if (preflight) {
    console.error(`Batch skipped (${trigger}):`, preflight.message);
    return {
      outcome: 'ran',
      stats: null,
      sites: [],
      error: preflight.message,
      fatal: true,
      remainingQueued: await countQueued(),
    };
  }

  const pageCounts = await knownPageCounts();
  const estimateMs = (site: SiteConfig) => {
    const pages = Math.min(pageCounts.get(site.source) ?? MAX_PAGES_PER_SITE, MAX_PAGES_PER_SITE);
    return (pages * SECONDS_PER_PAGE + SITE_OVERHEAD_SECONDS) * 1000;
  };

  let run: ActiveRun;
  try {
    run = await startRun(trigger, triggeredBy, startedAt);
  } catch (err) {
    // Lost the race to another run that started after the hasActiveRun check.
    if (err instanceof ScrapeBusyError) {
      return { outcome: 'busy', stats: null, sites: [], error: null, remainingQueued: await countQueued() };
    }
    throw err;
  }
  const results: SiteResult[] = [];
  let error: string | null = null;
  let fatal = false;
  try {
    for (const site of queue) {
      const remaining = deadline - Date.now();
      // The first site always runs (its crawl is cut off at the deadline if it
      // is slower than expected). Later sites only start if they should fit;
      // a big one that doesn't fit waits and goes first in the next batch.
      if (results.length > 0 && estimateMs(site) > remaining) continue;
      results.push(await ingestSite(site, deadline));
    }
    error = failureMessage(results);
  } catch (err) {
    fatal = err instanceof FatalIngestError;
    error = (err as Error).message ?? 'Unknown error';
  }
  try {
    if (results.some((r) => r.chunks > 0)) await reindex();
  } catch (err) {
    error ??= `Reindex failed: ${(err as Error).message}`;
  }

  const stats = await finishRun(run, startedAt, results, error);
  console.log(`Batch complete (${trigger}):`, stats, error ?? '');
  return { outcome: 'ran', stats, sites: results, error, fatal, remainingQueued: await countQueued() };
}
