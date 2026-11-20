'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Database,
  Globe,
  Loader2,
  Play,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import AdminMenu from '@/components/AdminMenu';

interface Subdomain {
  source: string;
  label: string;
  baseUrl: string;
  pathPrefix: string | null;
  chunks: number;
  pages: number;
  lastSaved: string | null;
  lastAttemptAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  queued: boolean;
  crawlStartedAt: string | null;
  crawlPages: number;
}

interface Run {
  id: number;
  status: string;
  stale: boolean;
  trigger: string;
  triggeredBy: string | null;
  sitesScraped: number;
  pagesIngested: number;
  chunksWritten: number;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
}

interface ScrapeStatus {
  inProgress: boolean;
  lastSuccessAt: string | null;
  nextScheduledAt: string | null;
  totalChunks: number;
  queuedCount: number;
  subdomains: Subdomain[];
  recentRuns: Run[];
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  if (Number.isNaN(diff)) return 'never';
  const abs = Math.abs(diff);
  const future = diff < 0;
  const mins = Math.round(abs / 60000);
  const fmt = (v: number, unit: string) =>
    future ? `in ${v} ${unit}${v === 1 ? '' : 's'}` : `${v} ${unit}${v === 1 ? '' : 's'} ago`;
  if (mins < 1) return future ? 'in <1 min' : 'just now';
  if (mins < 60) return fmt(mins, 'min');
  const hours = Math.round(mins / 60);
  if (hours < 24) return fmt(hours, 'hour');
  const days = Math.round(hours / 24);
  return fmt(days, 'day');
}

function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}

const TRIGGER_LABEL: Record<string, string> = {
  cron: 'Nightly batch',
  manual: 'Manual',
  cli: 'CLI',
};

function StatTile({
  label,
  value,
  sub,
  icon,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  accent?: string;
}) {
  return (
    <div className="bg-white rounded-xl border shadow-sm px-4 py-3.5" style={{ borderColor: '#e6e6e6' }}>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#999' }}>
        {icon}
        {label}
      </div>
      <div className="mt-1 text-[20px] font-bold leading-tight" style={{ color: accent ?? '#141414' }}>
        {value}
      </div>
      {sub && (
        <div className="mt-1 text-[11px]" style={{ color: '#888' }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ run }: { run: Run }) {
  let color = '#946f0a';
  let bg = 'rgba(148,111,10,0.08)';
  let label = 'Running';
  let Icon = Loader2;
  let spin = true;
  if (run.status === 'success') {
    color = '#1f7a1f';
    bg = 'rgba(31,122,31,0.08)';
    label = 'Success';
    Icon = CheckCircle2;
    spin = false;
  } else if (run.status === 'error') {
    color = '#ba0c2f';
    bg = 'rgba(186,12,47,0.08)';
    label = 'Failed';
    Icon = XCircle;
    spin = false;
  } else if (run.stale) {
    color = '#888';
    bg = 'rgba(136,136,136,0.1)';
    label = 'Interrupted';
    Icon = AlertTriangle;
    spin = false;
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full"
      style={{ color, background: bg }}
    >
      <Icon size={11} className={spin ? 'animate-spin' : ''} />
      {label}
    </span>
  );
}

export default function ScrapingPage() {
  const [data, setData] = useState<ScrapeStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [refreshingSource, setRefreshingSource] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const pollRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/scrape', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to load status: ${res.status}`);
      const json: ScrapeStatus = await res.json();
      setData(json);
      setError(null);
      return json;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load status');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Poll while a run is in progress (either one we started, or the cron/CLI).
  useEffect(() => {
    const running = triggering || data?.inProgress;
    if (running && pollRef.current === null) {
      pollRef.current = window.setInterval(() => {
        load();
      }, 4000);
    } else if (!running) {
      stopPolling();
    }
    return () => {
      // Cleared on unmount; the effect re-establishes it while still running.
    };
  }, [triggering, data?.inProgress, load, stopPolling]);

  useEffect(() => stopPolling, [stopPolling]);

  // A full refresh takes hours — far longer than one server request may run —
  // so the server does it in batches of a few subdomains and this loop keeps
  // asking for the next batch until none are left. A batch that fails (a site
  // is down or refusing us, or the request timed out) doesn't stop the loop:
  // those sites leave the queue when attempted, so it always moves forward.
  // Only a problem that would fail every site (bad OpenAI key, signed
  // out) stops it. With `sources`, only those subdomains are queued (the
  // checked rows). Everything is queued on the server, so if the page is
  // closed the queue cron (every 30 minutes) finishes the rest.
  async function runNow(sources?: string[]) {
    setTriggering(true);
    setNotice(null);
    setError(null);
    setProgress('Starting…');
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    let action: 'start' | 'continue' = 'start';
    let pages = 0;
    let chunks = 0;
    let sites = 0;
    let busyWaitMs = 0;
    let failuresInARow = 0;
    const failedSites = new Set<string>();
    let finished = false;
    try {
      while (!finished) {
        let res: Response | null = null;
        let json: {
          error?: string;
          fatal?: boolean;
          remainingQueued?: number;
          stats?: { pagesIngested?: number; chunksWritten?: number; sitesScraped?: number } | null;
          sites?: { label: string; status: string }[];
        } = {};
        try {
          res = await fetch('/api/admin/scrape', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(action === 'start' && sources ? { action, sources } : { action }),
          });
          json = await res.json().catch(() => ({}));
        } catch {
          res = null; // network blip, laptop slept, etc.
        }

        if (res?.status === 409) {
          // Another batch (the nightly one, or one whose request we lost) is
          // still running. A killed batch blocks for up to 10 minutes.
          busyWaitMs += 15000;
          if (busyWaitMs > 20 * 60 * 1000) {
            setError('Another scrape has been running for over 20 minutes. Try again later.');
            break;
          }
          setProgress('Waiting for a scrape that is already running…');
          await sleep(15000);
          continue;
        }
        busyWaitMs = 0;

        if (res && [400, 401, 403].includes(res.status)) {
          setError(json.error ?? `Scrape failed: ${res.status}`);
          break;
        }
        if (json.fatal) {
          setError(json.error ?? 'Scrape stopped.');
          break;
        }

        action = 'continue';
        pages += json.stats?.pagesIngested ?? 0;
        chunks += json.stats?.chunksWritten ?? 0;
        sites += json.stats?.sitesScraped ?? 0;
        for (const site of json.sites ?? []) {
          if (['error', 'empty', 'incomplete'].includes(site.status)) failedSites.add(site.label);
        }

        const left = res?.ok || json.remainingQueued !== undefined ? Number(json.remainingQueued ?? 0) : null;
        if (left === 0) {
          finished = true;
          break;
        }

        let waitMs = 5000;
        if (!res?.ok) {
          // Back off harder the more batches fail in a row, in case the
          // sites are rate-limiting us: 30s, 1m, 2m … up to 10 minutes.
          failuresInARow += 1;
          if (failuresInARow > 12) {
            setError(
              `The last ${failuresInARow - 1} batches all failed${json.error ? `: ${json.error}` : ''}. ` +
                'Stopped for now. Anything still queued will be scraped in the nightly batches.'
            );
            break;
          }
          waitMs = Math.min(30000 * 2 ** (failuresInARow - 1), 10 * 60 * 1000);
        } else {
          failuresInARow = 0;
        }
        const leftText = left === null ? '' : `, ${left} to go`;
        const failText = failedSites.size ? ` (${failedSites.size} failed)` : '';
        setProgress(
          `${sites} subdomains done${leftText}${failText}. ` +
            (waitMs > 5000 ? `Last batch failed, pausing ${Math.round(waitMs / 1000)}s. ` : '') +
            'You can close this page — the server keeps going.'
        );
        load();
        await sleep(waitMs);
      }
      if (finished) {
        if (sources) setSelected(new Set());
        const failed = failedSites.size
          ? ` ${failedSites.size} could not be read: ${[...failedSites].join(', ')}.`
          : '';
        setNotice(
          `Refreshed ${pages.toLocaleString()} pages across ${sites} subdomains — ${chunks.toLocaleString()} chunks saved.${failed}`
        );
      }
    } finally {
      setProgress(null);
      setTriggering(false);
      load();
    }
  }

  function toggleSelected(source: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  }

  async function refreshOne(s: Subdomain) {
    setRefreshingSource(s.source);
    setTriggering(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch('/api/admin/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: s.source }),
      });
      const json = await res.json().catch(() => ({}));
      const status = json?.sites?.[0]?.status;
      if (status === 'partial') {
        setNotice(
          `${s.label}: saved ${json.stats?.pagesIngested ?? 0} pages but ran out of time. ` +
            'It carries on automatically in the next batch (within about 5 minutes).'
        );
      } else if (!res.ok) {
        setError(json?.error ?? `Failed to scrape ${s.label}: ${res.status}`);
      } else if (json?.stats) {
        setNotice(
          `${s.label}: refreshed ${json.stats.pagesIngested} pages — ${json.stats.chunksWritten} chunks saved.`
        );
      }
    } catch {
      setNotice(`${s.label}: scrape started. Status will update automatically.`);
    } finally {
      setRefreshingSource(null);
      setTriggering(false);
      load();
    }
  }

  const busy = triggering || data?.inProgress;
  const queuedCount = data?.queuedCount ?? 0;
  const selectedCount = selected.size;
  const allSources = data?.subdomains.map((s) => s.source) ?? [];
  const allSelected = allSources.length > 0 && allSources.every((src) => selected.has(src));

  return (
    <div className="min-h-dvh" style={{ background: '#f6f6f8' }}>
      <header className="px-4 sm:px-6 py-4 shadow-sm" style={{ background: '#ba0c2f' }}>
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <Image
            src="/logo.png"
            alt="BYU–Hawaii"
            width={140}
            height={36}
            className="h-8 w-auto brightness-0 invert"
            priority
          />
          <div className="flex-1 min-w-0">
            <h1 className="text-[17px] sm:text-lg font-semibold text-white tracking-wide leading-tight">
              Data and scraping
            </h1>
            <p className="text-[11px] sm:text-xs text-white/70 mt-0.5">
              Knowledge-base freshness — when each subdomain was last scraped and saved
            </p>
          </div>
          <button
            onClick={() => load()}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium text-white/90 hover:text-white border border-white/20 hover:bg-white/10 transition-colors cursor-pointer"
            title="Refresh"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <AdminMenu />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}
        {notice && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-800 rounded-lg px-4 py-3 text-sm">
            {notice}
          </div>
        )}

        {/* Manual trigger */}
        <div
          className="bg-white rounded-xl border shadow-sm p-4 sm:p-5 mb-5 flex flex-col sm:flex-row sm:items-center gap-4"
          style={{ borderColor: '#e6e6e6' }}
        >
          <div className="flex-1">
            <h2 className="text-[15px] font-semibold" style={{ color: '#141414' }}>
              Run a scrape now
            </h2>
            <p className="text-[12px] mt-0.5" style={{ color: '#777' }}>
              Re-crawls every subdomain (or just the ones ticked below), re-embeds the content, and
              replaces what&apos;s stored in the database. A full run takes about an hour and works
              through the list a few subdomains at a time. The list is queued on the server, so you can
              close this page and it keeps going in the background (one batch every 30 minutes, so it finishes much sooner with the page open). To update
              one site right away, use its Refresh button.
            </p>
            {progress && (
              <p className="text-[12px] mt-1.5 font-medium" style={{ color: '#946f0a' }}>
                {progress}
              </p>
            )}
            {!busy && queuedCount > 0 && (
              <p className="text-[12px] mt-1.5 font-medium" style={{ color: '#946f0a' }}>
                {queuedCount} subdomains are queued — the server works through them one batch every 30 minutes.
              </p>
            )}
          </div>
          {selectedCount > 0 && !busy && (
            <button
              onClick={() => setSelected(new Set())}
              className="shrink-0 text-[12px] font-medium hover:underline cursor-pointer"
              style={{ color: '#777' }}
            >
              Clear selection
            </button>
          )}
          <button
            onClick={() => runNow(selectedCount > 0 ? [...selected] : undefined)}
            disabled={!!busy}
            className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-[14px] font-semibold text-white transition-colors cursor-pointer disabled:cursor-not-allowed"
            style={{ background: busy ? '#c98' : '#ba0c2f', opacity: busy ? 0.85 : 1 }}
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            {busy
              ? 'Scraping…'
              : selectedCount > 0
                ? `Scrape ${selectedCount} selected`
                : queuedCount > 0
                  ? `Continue scrape (${queuedCount} left)`
                  : 'Run scrape now'}
          </button>
        </div>

        {/* Status tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <StatTile
            icon={<CheckCircle2 size={11} />}
            label="Last saved"
            value={data ? relativeTime(data.lastSuccessAt) : '…'}
            sub={data?.lastSuccessAt ? formatDate(data.lastSuccessAt) : 'No successful run yet'}
            accent="#1f7a1f"
          />
          <StatTile
            icon={<CalendarClock size={11} />}
            label="Next scheduled"
            value={data ? relativeTime(data.nextScheduledAt) : '…'}
            sub={data?.nextScheduledAt ? formatDate(data.nextScheduledAt) : undefined}
          />
          <StatTile
            icon={<Database size={11} />}
            label="Chunks stored"
            value={data ? data.totalChunks.toLocaleString() : '…'}
            sub={data ? `across ${data.subdomains.length} subdomains` : undefined}
          />
          <StatTile
            icon={<RefreshCw size={11} />}
            label="Schedule"
            value="Nightly batches"
            sub="9:00 UTC — each subdomain about every 2 weeks"
          />
        </div>

        {/* Subdomains */}
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden mb-5" style={{ borderColor: '#e6e6e6' }}>
          <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: '#f0f0f0' }}>
            <Globe size={14} style={{ color: '#ba0c2f' }} />
            <h2 className="text-[14px] font-semibold" style={{ color: '#141414' }}>
              Subdomains scraped
            </h2>
            <span className="text-[11px]" style={{ color: '#999' }}>
              ({data?.subdomains.length ?? 0})
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left" style={{ color: '#999' }}>
                  <th className="pl-4 py-2 w-8">
                    <input
                      type="checkbox"
                      aria-label="Select all subdomains"
                      checked={allSelected}
                      disabled={!!busy || allSources.length === 0}
                      onChange={() => setSelected(allSelected ? new Set() : new Set(allSources))}
                      className="cursor-pointer disabled:cursor-not-allowed"
                      style={{ accentColor: '#ba0c2f' }}
                    />
                  </th>
                  <th className="font-semibold uppercase text-[10px] tracking-wider px-4 py-2">Source</th>
                  <th className="font-semibold uppercase text-[10px] tracking-wider px-4 py-2">URL</th>
                  <th className="font-semibold uppercase text-[10px] tracking-wider px-4 py-2 text-right">Pages</th>
                  <th className="font-semibold uppercase text-[10px] tracking-wider px-4 py-2 text-right">Chunks</th>
                  <th className="font-semibold uppercase text-[10px] tracking-wider px-4 py-2">Last saved</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: '#f5f5f5' }}>
                {data?.subdomains.map((s) => (
                  <tr
                    key={s.source}
                    className="align-top"
                    style={selected.has(s.source) ? { background: 'rgba(186,12,47,0.04)' } : undefined}
                  >
                    <td className="pl-4 py-2.5 w-8">
                      <input
                        type="checkbox"
                        aria-label={`Select ${s.label}`}
                        checked={selected.has(s.source)}
                        disabled={!!busy}
                        onChange={() => toggleSelected(s.source)}
                        className="mt-1 cursor-pointer disabled:cursor-not-allowed"
                        style={{ accentColor: '#ba0c2f' }}
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium" style={{ color: '#141414' }}>
                        {s.label}
                      </div>
                      <div className="text-[11px]" style={{ color: '#aaa' }}>
                        {s.source}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <a
                        href={s.baseUrl + (s.pathPrefix ?? '')}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                        style={{ color: '#2b6cb0' }}
                      >
                        {s.baseUrl.replace(/^https?:\/\//, '')}
                        {s.pathPrefix ?? ''}
                      </a>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: '#555' }}>
                      {s.pages.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: '#555' }}>
                      {s.chunks.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5">
                      {s.lastSaved ? (
                        <span title={formatDate(s.lastSaved)} style={{ color: '#555' }}>
                          {relativeTime(s.lastSaved)}
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 text-[11px] font-medium"
                          style={{ color: '#ba0c2f' }}
                        >
                          <AlertTriangle size={12} /> never saved
                        </span>
                      )}
                      {s.queued && s.lastStatus === 'partial' && s.crawlStartedAt ? (
                        <div
                          className="text-[11px] font-medium"
                          style={{ color: '#946f0a' }}
                          title={s.lastError ?? undefined}
                        >
                          cut off by the time limit after {s.crawlPages} pages; resumes in the next batch
                        </div>
                      ) : (
                        s.queued && (
                          <div className="text-[11px] font-medium" style={{ color: '#946f0a' }}>
                            queued
                          </div>
                        )
                      )}
                      {s.lastStatus === 'incomplete' && (
                        <div
                          className="flex items-center gap-1 text-[11px] font-medium"
                          style={{ color: '#ba0c2f' }}
                          title={s.lastError ?? undefined}
                        >
                          <AlertTriangle size={12} /> incomplete {relativeTime(s.lastAttemptAt)}: site refused
                          requests, needs a re-scrape
                        </div>
                      )}
                      {s.lastStatus === 'success' && s.lastError && (
                        <div
                          className="flex items-center gap-1 text-[11px] font-medium"
                          style={{ color: '#946f0a' }}
                          title={s.lastError}
                        >
                          <AlertTriangle size={12} /> stale-page cleanup skipped
                        </div>
                      )}
                      {(s.lastStatus === 'empty' || s.lastStatus === 'error') && (
                        <div
                          className="flex items-center gap-1 text-[11px] font-medium"
                          style={{ color: '#ba0c2f' }}
                          title={s.lastError ?? undefined}
                        >
                          <AlertTriangle size={12} /> last attempt failed {relativeTime(s.lastAttemptAt)}
                        </div>
                      )}
                      {s.lastStatus === 'partial' && !s.queued && (
                        <div className="text-[11px]" style={{ color: '#946f0a' }} title={s.lastError ?? undefined}>
                          last attempt ran out of time
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => refreshOne(s)}
                        disabled={!!busy}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[12px] font-medium border transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 hover:bg-gray-50"
                        style={{ borderColor: '#e0e0e0', color: '#555' }}
                        title={`Scrape ${s.label} now`}
                      >
                        <RefreshCw size={12} className={refreshingSource === s.source ? 'animate-spin' : ''} />
                        Refresh
                      </button>
                    </td>
                  </tr>
                ))}
                {(!data || data.subdomains.length === 0) && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-[13px]" style={{ color: '#999' }}>
                      {loading ? 'Loading…' : 'No subdomains configured.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent runs */}
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden" style={{ borderColor: '#e6e6e6' }}>
          <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: '#f0f0f0' }}>
            <RefreshCw size={14} style={{ color: '#ba0c2f' }} />
            <h2 className="text-[14px] font-semibold" style={{ color: '#141414' }}>
              Scrape history
            </h2>
            <span className="text-[11px]" style={{ color: '#999' }}>
              (last {data?.recentRuns.length ?? 0})
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left" style={{ color: '#999' }}>
                  <th className="font-semibold uppercase text-[10px] tracking-wider px-4 py-2">Status</th>
                  <th className="font-semibold uppercase text-[10px] tracking-wider px-4 py-2">Started</th>
                  <th className="font-semibold uppercase text-[10px] tracking-wider px-4 py-2">Trigger</th>
                  <th className="font-semibold uppercase text-[10px] tracking-wider px-4 py-2 text-right">Pages</th>
                  <th className="font-semibold uppercase text-[10px] tracking-wider px-4 py-2 text-right">Chunks</th>
                  <th className="font-semibold uppercase text-[10px] tracking-wider px-4 py-2 text-right">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: '#f5f5f5' }}>
                {data?.recentRuns.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="px-4 py-2.5">
                      <StatusBadge run={r} />
                      {r.error && (
                        <div className="mt-1 text-[11px] leading-snug max-w-[260px]" style={{ color: '#ba0c2f' }}>
                          {r.error}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div style={{ color: '#141414' }}>{relativeTime(r.startedAt)}</div>
                      <div className="text-[11px]" style={{ color: '#aaa' }}>
                        {formatDate(r.startedAt)}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div style={{ color: '#555' }}>{TRIGGER_LABEL[r.trigger] ?? r.trigger}</div>
                      {r.triggeredBy && (
                        <div className="text-[11px] truncate max-w-[160px]" style={{ color: '#aaa' }}>
                          {r.triggeredBy}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: '#555' }}>
                      {r.status === 'success' ? r.pagesIngested.toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: '#555' }}>
                      {r.status === 'success' ? r.chunksWritten.toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: '#555' }}>
                      {formatDuration(r.durationMs)}
                    </td>
                  </tr>
                ))}
                {(!data || data.recentRuns.length === 0) && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-[13px]" style={{ color: '#999' }}>
                      {loading ? 'Loading…' : 'No scrape runs recorded yet.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
