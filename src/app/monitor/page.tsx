'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  AlertTriangle,
  LifeBuoy,
  MessagesSquare,
  MoreVertical,
  RefreshCw,
  ThumbsDown,
  Trash2,
} from 'lucide-react';
import AdminMenu from '@/components/AdminMenu';

interface Metrics {
  conversations: number;
  userMessages: number;
  assistantMessages: number;
  escalations: number;
  escalationsPending: number;
  escalationRate: number | null;
  thumbsUp: number;
  thumbsDown: number;
  rated: number;
  thumbsDownRate: number | null;
  feedbackCoverage: number | null;
}

interface DailyPoint {
  day: string;
  conversations: number;
  questions: number;
}

interface DownItem {
  id: number;
  conversationId: string;
  question: string | null;
  answer: string | null;
  comment: string | null;
  createdAt: string;
}

interface EscalationItem {
  id: string;
  conversationId: string;
  question: string | null;
  reason: string | null;
  status: string;
  createdAt: string;
}

interface MonitorResponse {
  days: number;
  metrics: Metrics;
  daily: DailyPoint[];
  recentThumbsDown: DownItem[];
  recentEscalations: EscalationItem[];
}

const WINDOWS: { label: string; days: number }[] = [
  { label: '24h', days: 1 },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: 'All time', days: 0 },
];

function pct(v: number | null): string {
  if (v === null) return '—';
  return `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function dayLabel(iso: string): string {
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

// Round the y-axis top up to a "nice" whole number and split it into ~4 even
// steps of 1, 2, or 5 × 10ⁿ, so tick labels are always clean integers.
function yTicks(max: number): number[] {
  const rough = Math.max(1, max / 4);
  const mag = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= rough) ?? rough;
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  return ticks;
}

const CHART_HEIGHT = 120;

// Questions-per-day bars with a labelled y-axis and a hover/focus tooltip.
// Each column is the full-height hit target, so thin bars (or zero days) are
// still easy to hover.
function DailyChart({ daily }: { daily: DailyPoint[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const ticks = yTicks(Math.max(0, ...daily.map((p) => p.questions)));
  const top = ticks[ticks.length - 1];

  return (
    <div className="flex gap-1.5">
      {/* Y-axis title */}
      <div className="flex items-center justify-center w-3.5" style={{ height: CHART_HEIGHT }}>
        <span
          className="text-[10px] font-medium whitespace-nowrap -rotate-90"
          style={{ color: '#888' }}
        >
          Questions
        </span>
      </div>

      {/* Tick labels */}
      <div className="relative shrink-0 w-7" style={{ height: CHART_HEIGHT }}>
        {ticks.map((t) => (
          <span
            key={t}
            className="absolute right-0 text-[10px] tabular-nums leading-none"
            style={{ bottom: `${(t / top) * CHART_HEIGHT}px`, transform: 'translateY(50%)', color: '#888' }}
          >
            {t.toLocaleString()}
          </span>
        ))}
      </div>

      <div className="flex-1 min-w-0">
        <div className="relative" style={{ height: CHART_HEIGHT }}>
          {/* Gridlines */}
          {ticks.map((t) => (
            <div
              key={t}
              className="absolute inset-x-0"
              style={{
                bottom: `${(t / top) * CHART_HEIGHT}px`,
                borderTop: `1px ${t === 0 ? 'solid #d4d4d4' : 'dashed #eee'}`,
              }}
            />
          ))}

          {/* Bars */}
          <div className="absolute inset-0 flex items-end gap-0.5 sm:gap-1">
            {daily.map((p, i) => {
              const h = p.questions > 0 ? Math.max(3, (p.questions / top) * CHART_HEIGHT) : 0;
              const isHovered = hovered === i;
              const align =
                i < 2 ? 'left-0' : i > daily.length - 3 ? 'right-0' : 'left-1/2 -translate-x-1/2';
              return (
                <div
                  key={p.day}
                  className="relative flex-1 min-w-0 h-full flex items-end justify-center outline-none"
                  tabIndex={0}
                  aria-label={`${dayLabel(p.day)}: ${p.questions} questions`}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
                  onFocus={() => setHovered(i)}
                  onBlur={() => setHovered((h) => (h === i ? null : h))}
                >
                  <div
                    className="w-full max-w-[26px] rounded-t transition-opacity"
                    style={{
                      height: `${h}px`,
                      background: '#ba0c2f',
                      opacity: hovered === null || isHovered ? 1 : 0.55,
                    }}
                  />
                  {isHovered && (
                    <div
                      className={`absolute z-10 pointer-events-none whitespace-nowrap rounded-md px-2 py-1.5 shadow-md text-[11px] leading-tight ${align}`}
                      style={{ bottom: `${h + 6}px`, background: '#141414', color: 'white' }}
                    >
                      <div className="font-semibold">
                        {p.questions.toLocaleString()} question{p.questions === 1 ? '' : 's'}
                      </div>
                      <div style={{ color: 'rgba(255,255,255,0.7)' }}>
                        {dayLabel(p.day)} · {p.conversations} conversation{p.conversations === 1 ? '' : 's'}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* X-axis day labels */}
        <div className="flex gap-0.5 sm:gap-1 mt-1">
          {daily.map((p) => (
            <span
              key={p.day}
              className="flex-1 min-w-0 text-center text-[9px] whitespace-nowrap overflow-hidden"
              style={{ color: '#aaa' }}
            >
              {dayLabel(p.day)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// Tucked-away "⋮" menu on a thumbs-down row. Deleting is deliberately two
// clicks deep plus a confirm, so it's hard to hit by accident.
function RowMenu({ onDelete }: { onDelete: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="p-1 rounded-md hover:bg-gray-100 cursor-pointer"
        style={{ color: '#aaa' }}
        title="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreVertical size={14} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-20 min-w-[170px] bg-white rounded-lg border shadow-lg py-1"
          style={{ borderColor: '#e6e6e6' }}
        >
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={async () => {
              if (!confirm('Delete this thumbs-down? This removes the rating (and its comment) permanently. The conversation itself is kept.')) {
                return;
              }
              setBusy(true);
              try {
                await onDelete();
                setOpen(false);
              } finally {
                setBusy(false);
              }
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-left hover:bg-red-50 cursor-pointer disabled:opacity-50"
            style={{ color: '#ba0c2f' }}
          >
            <Trash2 size={13} />
            {busy ? 'Deleting…' : 'Delete thumbs-down'}
          </button>
        </div>
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="bg-white rounded-xl border shadow-sm px-4 py-3.5" style={{ borderColor: '#e6e6e6' }}>
      <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#999' }}>
        {label}
      </div>
      <div className="mt-1 text-[24px] font-bold leading-none" style={{ color: accent ?? '#141414' }}>
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

export default function MonitorPage() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<MonitorResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (d: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/monitor?days=${d}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load metrics');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // load() awaits a fetch before the meaningful setState calls; the synchronous
    // setLoading(true) is the intended "request started" signal.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(days);
  }, [days, load]);

  const deleteFeedback = useCallback(
    async (id: number) => {
      const res = await fetch(`/api/admin/feedback/${id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 404) {
        alert(`Failed to delete: ${res.status}`);
        return;
      }
      // Reload so the thumbs-down tile and rates reflect the removal.
      await load(days);
    },
    [days, load]
  );

  const m = data?.metrics;

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
              Monitoring
            </h1>
            <p className="text-[11px] sm:text-xs text-white/70 mt-0.5">
              Launch health — volume, escalations, and answer feedback
            </p>
          </div>
          <button
            onClick={() => load(days)}
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
        {/* Window selector */}
        <div className="flex items-center gap-1.5 mb-5 flex-wrap">
          {WINDOWS.map((w) => {
            const active = w.days === days;
            return (
              <button
                key={w.days}
                onClick={() => setDays(w.days)}
                className="px-3 py-1.5 rounded-lg text-[13px] font-medium border transition-colors cursor-pointer"
                style={{
                  background: active ? '#ba0c2f' : 'white',
                  color: active ? 'white' : '#141414',
                  borderColor: active ? '#ba0c2f' : '#e6e6e6',
                }}
              >
                {w.label}
              </button>
            );
          })}
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {m && (
          <>
            {/* Stat tiles */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
              <StatTile
                label="Conversations"
                value={m.conversations.toLocaleString()}
                sub={`${m.userMessages.toLocaleString()} questions asked`}
              />
              <StatTile
                label="Escalation rate"
                value={pct(m.escalationRate)}
                sub={`${m.escalations} to a human${m.escalationsPending > 0 ? ` · ${m.escalationsPending} pending` : ''}`}
                accent={m.escalationsPending > 0 ? '#ba0c2f' : undefined}
              />
              <StatTile
                label="Thumbs-down rate"
                value={pct(m.thumbsDownRate)}
                sub={`${m.thumbsDown} 👎 of ${m.rated} rated`}
                accent={m.thumbsDownRate !== null && m.thumbsDownRate >= 0.25 ? '#ba0c2f' : undefined}
              />
              <StatTile
                label="Feedback coverage"
                value={pct(m.feedbackCoverage)}
                sub={`${m.rated} of ${m.assistantMessages.toLocaleString()} answers rated`}
              />
            </div>

            {/* Daily volume trend */}
            <div className="bg-white rounded-xl border shadow-sm p-4 sm:p-5 mb-5" style={{ borderColor: '#e6e6e6' }}>
              <div className="flex items-center gap-2 mb-4">
                <MessagesSquare size={15} style={{ color: '#ba0c2f' }} />
                <h2 className="text-[14px] font-semibold" style={{ color: '#141414' }}>
                  Questions per day
                </h2>
                <span className="text-[11px]" style={{ color: '#999' }}>
                  (last {data.daily.length} days)
                </span>
              </div>
              <DailyChart daily={data.daily} />
            </div>

            {/* Actionable feeds */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Recent thumbs-down */}
              <section className="bg-white rounded-xl border shadow-sm overflow-hidden" style={{ borderColor: '#e6e6e6' }}>
                <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: '#f0f0f0' }}>
                  <ThumbsDown size={14} style={{ color: '#ba0c2f' }} />
                  <h2 className="text-[14px] font-semibold" style={{ color: '#141414' }}>
                    Recent thumbs-down
                  </h2>
                </div>
                <div className="divide-y" style={{ borderColor: '#f5f5f5' }}>
                  {data.recentThumbsDown.length === 0 && (
                    <p className="px-4 py-8 text-center text-[13px]" style={{ color: '#999' }}>
                      No thumbs-down in this window. 🎉
                    </p>
                  )}
                  {data.recentThumbsDown.map((d) => (
                    <div key={d.id} className="relative hover:bg-gray-50 transition-colors">
                      <Link
                        href={`/conversations?id=${d.conversationId}`}
                        className="block pl-4 pr-10 py-3"
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-[13px] font-medium truncate" style={{ color: '#141414' }}>
                            {d.question ?? '(question unavailable)'}
                          </span>
                          <span className="shrink-0 text-[10px]" style={{ color: '#aaa' }}>
                            {formatDate(d.createdAt)}
                          </span>
                        </div>
                        {d.answer && (
                          <p className="text-[12px] leading-snug line-clamp-2" style={{ color: '#777' }}>
                            {d.answer}
                          </p>
                        )}
                        {d.comment && (
                          <p className="mt-1 text-[12px] italic leading-snug" style={{ color: '#ba0c2f' }}>
                            “{d.comment}”
                          </p>
                        )}
                      </Link>
                      <div className="absolute top-2 right-2">
                        <RowMenu onDelete={() => deleteFeedback(d.id)} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Recent escalations */}
              <section className="bg-white rounded-xl border shadow-sm overflow-hidden" style={{ borderColor: '#e6e6e6' }}>
                <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: '#f0f0f0' }}>
                  <LifeBuoy size={14} style={{ color: '#946f0a' }} />
                  <h2 className="text-[14px] font-semibold" style={{ color: '#141414' }}>
                    Recent escalations
                  </h2>
                </div>
                <div className="divide-y" style={{ borderColor: '#f5f5f5' }}>
                  {data.recentEscalations.length === 0 && (
                    <p className="px-4 py-8 text-center text-[13px]" style={{ color: '#999' }}>
                      No escalations to a human in this window.
                    </p>
                  )}
                  {data.recentEscalations.map((e) => (
                    <Link
                      key={e.id}
                      href={`/support`}
                      className="block px-4 py-3 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[13px] font-medium truncate" style={{ color: '#141414' }}>
                          {e.question ?? '(question unavailable)'}
                        </span>
                        <span
                          className="shrink-0 text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-full"
                          style={{
                            color: e.status === 'pending' ? '#ba0c2f' : '#1f7a1f',
                            background:
                              e.status === 'pending' ? 'rgba(186,12,47,0.08)' : 'rgba(31,122,31,0.08)',
                          }}
                        >
                          {e.status}
                        </span>
                      </div>
                      {e.reason && (
                        <p className="text-[12px] leading-snug line-clamp-2" style={{ color: '#777' }}>
                          {e.reason}
                        </p>
                      )}
                      <p className="mt-1 text-[10px]" style={{ color: '#aaa' }}>
                        {formatDate(e.createdAt)}
                      </p>
                    </Link>
                  ))}
                </div>
              </section>
            </div>

            {(m.conversations === 0 && m.rated === 0) && (
              <div className="mt-5 flex items-center gap-2 justify-center text-[12px]" style={{ color: '#999' }}>
                <AlertTriangle size={13} />
                No activity yet in this window.
              </div>
            )}
          </>
        )}

        {!m && loading && (
          <p className="text-center py-16 text-sm" style={{ color: '#999' }}>
            Loading metrics…
          </p>
        )}
      </main>
    </div>
  );
}
