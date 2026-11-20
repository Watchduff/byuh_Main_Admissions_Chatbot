'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { CalendarClock, GitCommitHorizontal, Hammer, Power, RefreshCw, Server } from 'lucide-react';
import AdminMenu from '@/components/AdminMenu';

const REPO_URL = 'https://github.com/innovatorsdna/byuh-admissions-bot';

interface Commit {
  sha: string;
  author: string;
  date: string | null;
  subject: string;
}

interface VersionInfo {
  host: string;
  builtAt: string | null;
  startedAt: string;
  commits: Commit[];
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function relativeTime(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return '';
  const mins = Math.round(diff / 60000);
  const fmt = (v: number, unit: string) => `${v} ${unit}${v === 1 ? '' : 's'} ago`;
  if (mins < 1) return 'just now';
  if (mins < 60) return fmt(mins, 'min');
  const hours = Math.round(mins / 60);
  if (hours < 24) return fmt(hours, 'hour');
  return fmt(Math.round(hours / 24), 'day');
}

function Tile({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border shadow-sm px-4 py-3.5" style={{ borderColor: '#e6e6e6' }}>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#999' }}>
        {icon}
        {label}
      </div>
      <div className="mt-1 text-[18px] font-bold leading-tight" style={{ color: '#141414' }}>
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

export default function VersionPage() {
  const [data, setData] = useState<VersionInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/version', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to load version: ${res.status}`);
      setData(await res.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load version');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const live = data?.commits[0];

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
            <h1 className="text-[17px] sm:text-lg font-semibold text-white tracking-wide leading-tight">Version</h1>
            <p className="text-[11px] sm:text-xs text-white/70 mt-0.5">
              Which code is running here, and when it was last updated from GitHub
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
          <div className="mb-4 bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3 text-sm">{error}</div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <Tile
            icon={<GitCommitHorizontal size={11} />}
            label="Live commit"
            value={live ? live.sha.slice(0, 7) : data ? 'unknown' : '…'}
            sub={live?.subject}
          />
          <Tile
            icon={<Hammer size={11} />}
            label="Built"
            value={data ? relativeTime(data.builtAt) || '—' : '…'}
            sub={data?.builtAt ? formatDate(data.builtAt) : undefined}
          />
          <Tile
            icon={<Power size={11} />}
            label="Running since"
            value={data ? relativeTime(data.startedAt) : '…'}
            sub={data ? formatDate(data.startedAt) : undefined}
          />
          <Tile icon={<Server size={11} />} label="Host" value={data?.host ?? '…'} />
        </div>

        <div className="bg-white rounded-xl border shadow-sm overflow-hidden" style={{ borderColor: '#e6e6e6' }}>
          <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: '#f0f0f0' }}>
            <CalendarClock size={14} style={{ color: '#ba0c2f' }} />
            <h2 className="text-[14px] font-semibold" style={{ color: '#141414' }}>
              Last {data?.commits.length || 5} commits in this version
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left" style={{ color: '#999' }}>
                  <th className="font-semibold uppercase text-[10px] tracking-wider px-4 py-2">Commit</th>
                  <th className="font-semibold uppercase text-[10px] tracking-wider px-4 py-2">Message</th>
                  <th className="font-semibold uppercase text-[10px] tracking-wider px-4 py-2">Author</th>
                  <th className="font-semibold uppercase text-[10px] tracking-wider px-4 py-2">Committed</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: '#f5f5f5' }}>
                {data?.commits.map((c, i) => (
                  <tr key={c.sha} className="align-top">
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <a
                        href={`${REPO_URL}/commit/${c.sha}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono hover:underline"
                        style={{ color: '#2b6cb0' }}
                      >
                        {c.sha.slice(0, 7)}
                      </a>
                      {i === 0 && (
                        <span
                          className="ml-2 text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-full"
                          style={{ color: '#1f7a1f', background: 'rgba(31,122,31,0.08)' }}
                        >
                          live
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5" style={{ color: '#141414' }}>
                      {c.subject}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: '#555' }}>
                      {c.author}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <div style={{ color: '#141414' }}>{relativeTime(c.date) || '—'}</div>
                      <div className="text-[11px]" style={{ color: '#aaa' }}>
                        {formatDate(c.date)}
                      </div>
                    </td>
                  </tr>
                ))}
                {(!data || data.commits.length === 0) && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-[13px]" style={{ color: '#999' }}>
                      {loading || !data ? 'Loading…' : 'This build has no commit information.'}
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
