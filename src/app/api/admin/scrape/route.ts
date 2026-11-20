import { pool } from '@/db/index';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import {
  ACTIVE_RUN_MINUTES,
  countQueued,
  getSiteStates,
  isPending,
  queueRefresh,
  runIngestBatch,
} from '@/lib/ingest';
import { SITE_CONFIGS } from '@/lib/scraper';

export const runtime = 'nodejs';
// Each POST runs one time-boxed batch (budgeted at 270s) inline. A full
// refresh is many POSTs in a row, driven by the admin page.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// A run still marked 'running' after this long is treated as stale (the
// serverless function was almost certainly killed mid-run). Stale runs no
// longer block a fresh manual trigger and are flagged as such in the UI.
const STALE_RUN_MINUTES = ACTIVE_RUN_MINUTES;

// The nightly batch schedule from the VM crontab (scripts/vm/scrape-cron.sh): `0 9 * * *` (09:00 UTC every
// day). Computed here rather than parsing the crontab so the admin page can
// show "next scheduled batch" without another source of truth.
function nextScheduledRun(from: Date): string {
  const next = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 9, 0, 0));
  if (next.getTime() <= from.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}

type RunRow = {
  id: number;
  status: string;
  trigger: string;
  triggered_by: string | null;
  sites_scraped: number;
  pages_ingested: number;
  chunks_written: number;
  error: string | null;
  started_at: string;
  heartbeat_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
};

function runToClient(r: RunRow, staleBefore: number) {
  // Long CLI runs keep heartbeating, so judge liveness by the last beat.
  const lastAliveMs = new Date(r.heartbeat_at ?? r.started_at).getTime();
  const stale = r.status === 'running' && lastAliveMs < staleBefore;
  return {
    id: r.id,
    status: r.status,
    stale,
    trigger: r.trigger,
    triggeredBy: r.triggered_by,
    sitesScraped: r.sites_scraped,
    pagesIngested: r.pages_ingested,
    chunksWritten: r.chunks_written,
    error: r.error,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    durationMs: r.duration_ms,
  };
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const staleBefore = Date.now() - STALE_RUN_MINUTES * 60 * 1000;

  const states = await getSiteStates();
  const client = await pool.connect();
  try {
    const [runs, bySource, lastSuccess, activeCount] = await Promise.all([
      client.query<RunRow>(
        `SELECT id, status, trigger, triggered_by, sites_scraped, pages_ingested,
                chunks_written, error, started_at, heartbeat_at, finished_at, duration_ms
           FROM scrape_runs
          ORDER BY started_at DESC
          LIMIT 20`
      ),
      // Per-subdomain freshness straight from what's stored in byuh_chunks.
      // MAX(created_at) is the last time that source's content was saved —
      // exactly the "did my update get saved?" signal the admin wants.
      client.query<{ source: string; chunks: string; pages: string; last_saved: string | null }>(
        `SELECT source,
                COUNT(*)             AS chunks,
                COUNT(DISTINCT url)  AS pages,
                MAX(created_at)      AS last_saved
           FROM byuh_chunks
          GROUP BY source`
      ),
      client.query<{ finished_at: string | null; started_at: string }>(
        `SELECT started_at, finished_at
           FROM scrape_runs
          WHERE status = 'success'
          ORDER BY finished_at DESC NULLS LAST
          LIMIT 1`
      ),
      // A genuinely in-progress run (not a stale/abandoned one).
      client.query<{ count: string }>(
        `SELECT COUNT(*) AS count
           FROM scrape_runs
          WHERE status = 'running'
            AND COALESCE(heartbeat_at, started_at) > NOW() - INTERVAL '${STALE_RUN_MINUTES} minutes'`
      ),
    ]);

    const freshnessBySource = new Map(
      bySource.rows.map((r) => [
        r.source,
        { chunks: Number(r.chunks), pages: Number(r.pages), lastSaved: r.last_saved },
      ])
    );

    // Join the static site config with the live per-source freshness so the UI
    // can list every configured subdomain, including any that have never been
    // saved yet (freshness undefined).
    const subdomains = SITE_CONFIGS.map((s) => {
      const f = freshnessBySource.get(s.source);
      return {
        source: s.source,
        label: s.label,
        baseUrl: s.baseUrl,
        // Only present when the crawl is scoped to a section of the site.
        pathPrefix: s.pathPrefix ?? null,
        chunks: f?.chunks ?? 0,
        pages: f?.pages ?? 0,
        lastSaved: f?.lastSaved ?? null,
        // From scrape_site_state: how the most recent attempt went, and
        // whether a manual refresh is still waiting.
        lastAttemptAt: states.get(s.source)?.lastStartedAt?.toISOString() ?? null,
        lastStatus: states.get(s.source)?.lastStatus ?? null,
        lastError: states.get(s.source)?.lastError ?? null,
        queued: isPending(states.get(s.source)),
        // A crawl pass spanning several batches: when it started and how many
        // pages it has saved so far.
        crawlStartedAt: states.get(s.source)?.crawlStartedAt?.toISOString() ?? null,
        crawlPages: states.get(s.source)?.crawlPages ?? 0,
      };
    });

    const totalChunks = subdomains.reduce((sum, s) => sum + s.chunks, 0);
    const last = lastSuccess.rows[0];

    return NextResponse.json({
      inProgress: Number(activeCount.rows[0]?.count ?? 0) > 0,
      lastSuccessAt: last?.finished_at ?? null,
      nextScheduledAt: nextScheduledRun(new Date()),
      totalChunks,
      queuedCount: subdomains.filter((s) => s.queued).length,
      subdomains,
      recentRuns: runs.rows.map((r) => runToClient(r, staleBefore)),
    });
  } finally {
    client.release();
  }
}

/**
 * Run one batch.
 *
 *   { "source": "admissions" }       scrape just that subdomain
 *   { "action": "start" }            queue every subdomain (unless a refresh is
 *                                    already queued), then run the first batch
 *   { "action": "start",
 *     "sources": ["a", "b"] }        queue just those subdomains (alongside
 *                                    anything already queued), then run the
 *                                    first batch
 *   { "action": "continue" }         run the next batch of the queued refresh
 *
 * The response's `remainingQueued` tells the caller whether to POST again.
 * Whatever is still queued when the admin walks away is picked up by the
 * queue cron (`/api/cron/scrape?queued=1`, every 30 minutes), so a refresh
 * finishes even with the page closed. An empty body means "start".
 */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json().catch(() => ({}))) as { source?: unknown; action?: unknown; sources?: unknown };
  const source = typeof body.source === 'string' ? body.source : null;
  if (source && !SITE_CONFIGS.some((s) => s.source === source)) {
    return NextResponse.json({ error: `Unknown subdomain "${source}".` }, { status: 400 });
  }
  let sources: string[] | null = null;
  if (body.sources !== undefined) {
    if (!Array.isArray(body.sources) || body.sources.length === 0 || !body.sources.every((s) => typeof s === 'string')) {
      return NextResponse.json({ error: '"sources" must be a non-empty list of subdomains.' }, { status: 400 });
    }
    const unknown = body.sources.filter((s) => !SITE_CONFIGS.some((c) => c.source === s));
    if (unknown.length > 0) {
      return NextResponse.json({ error: `Unknown subdomain "${unknown[0]}".` }, { status: 400 });
    }
    sources = body.sources as string[];
  }

  try {
    if (!source && body.action !== 'continue') {
      if (sources) await queueRefresh(sources);
      else if ((await countQueued()) === 0) await queueRefresh();
    }

    const result = await runIngestBatch({
      trigger: 'manual',
      triggeredBy: auth.email,
      ...(source ? { only: source } : { requestedOnly: true }),
    });

    // Guard against overlapping scrapes (double-click, or a manual run while
    // the cron batch is mid-flight).
    if (result.outcome === 'busy') {
      return NextResponse.json(
        { error: 'A scrape is already in progress. Please wait for it to finish.', remainingQueued: result.remainingQueued },
        { status: 409 }
      );
    }
    if (result.error) {
      return NextResponse.json({ ok: false, ...result }, { status: 500 });
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('Manual ingestion failed:', err);
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
