'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { Bug, CheckCircle2, Clock, Lightbulb, Plus, RefreshCw, X } from 'lucide-react';
import AdminMenu from '@/components/AdminMenu';

interface Ticket {
  id: string;
  type: 'bug' | 'feature';
  title: string;
  description: string;
  status: 'open' | 'closed';
  createdBy: string;
  closedBy: string | null;
  closedAt: string | null;
  createdAt: string;
}

type Filter = 'open' | 'closed' | 'all';

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function TicketsPage() {
  const [filter, setFilter] = useState<Filter>('open');
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<'bug' | 'feature'>('bug');
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = filter === 'all' ? '' : `?status=${filter}`;
      const res = await fetch(`/api/admin/tickets${qs}`);
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data: Ticket[] = await res.json();
      setTickets(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tickets');
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  const stats = useMemo(() => {
    if (!tickets) return { open: 0, closed: 0 };
    return {
      open: tickets.filter((t) => t.status === 'open').length,
      closed: tickets.filter((t) => t.status === 'closed').length,
    };
  }, [tickets]);

  async function submitTicket() {
    const title = formTitle.trim();
    const description = formDescription.trim();
    if (!title || !description) {
      setFormError('Title and description are required.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch('/api/admin/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: formType, title, description }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed: ${res.status}`);
      }
      setFormTitle('');
      setFormDescription('');
      setFormType('bug');
      setShowForm(false);
      await loadTickets();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to submit ticket');
    } finally {
      setSubmitting(false);
    }
  }

  async function closeTicket(id: string) {
    setClosingId(id);
    try {
      const res = await fetch(`/api/admin/tickets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'closed' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed: ${res.status}`);
      }
      await loadTickets();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to close ticket');
    } finally {
      setClosingId(null);
    }
  }

  return (
    <div className="min-h-dvh" style={{ background: '#f6f6f8' }}>
      <header className="px-4 sm:px-6 py-4 shadow-sm" style={{ background: '#ba0c2f' }}>
        <div className="max-w-5xl mx-auto flex items-center gap-3">
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
              Support Tickets
            </h1>
            <p className="text-[11px] sm:text-xs text-white/70 mt-0.5">
              Report bugs or request features for the admin tools
            </p>
          </div>
          <button
            onClick={loadTickets}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium text-white/90 hover:text-white border border-white/20 hover:bg-white/10 transition-colors cursor-pointer"
            title="Refresh"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <AdminMenu />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Filters + new ticket */}
        <div className="bg-white rounded-xl border shadow-sm p-4" style={{ borderColor: '#e6e6e6' }}>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex gap-1 p-1 rounded-lg" style={{ background: '#eceef2' }}>
              {(['open', 'closed', 'all'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-md text-[13px] font-medium capitalize transition-colors cursor-pointer ${
                    filter === f ? 'bg-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
                  }`}
                  style={filter === f ? { color: '#ba0c2f' } : {}}
                >
                  {f}
                  {f === 'open' && stats.open > 0 ? (
                    <span
                      className="ml-1.5 inline-flex items-center justify-center text-[10px] font-semibold rounded-full px-1.5"
                      style={{ background: '#ba0c2f', color: 'white', minWidth: '1.1rem' }}
                    >
                      {stats.open}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
            <div className="flex-1" />
            <button
              onClick={() => setShowForm((v) => !v)}
              className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-white text-[13px] font-medium transition-colors cursor-pointer"
              style={{ background: '#ba0c2f' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#9e1b34'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#ba0c2f'; }}
            >
              {showForm ? <X size={14} /> : <Plus size={14} />}
              {showForm ? 'Cancel' : 'New ticket'}
            </button>
          </div>

          {showForm && (
            <div className="mt-4 pt-4 border-t space-y-3" style={{ borderColor: '#f0f0f0' }}>
              <div className="flex gap-1 p-1 rounded-lg w-fit" style={{ background: '#eceef2' }}>
                {(['bug', 'feature'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setFormType(t)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium capitalize transition-colors cursor-pointer ${
                      formType === t ? 'bg-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
                    }`}
                    style={formType === t ? { color: '#ba0c2f' } : {}}
                  >
                    {t === 'bug' ? <Bug size={13} /> : <Lightbulb size={13} />}
                    {t === 'bug' ? 'Bug report' : 'Feature request'}
                  </button>
                ))}
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: '#666' }}>
                  Title
                </label>
                <input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder={formType === 'bug' ? 'e.g. Country criteria page 500s on load' : 'e.g. Add CSV export to /monitor'}
                  className="w-full rounded-lg border px-3 py-2 text-[14px] outline-none transition-colors"
                  style={{ borderColor: '#e6e6e6', color: '#141414' }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = '#ba0c2f'; e.currentTarget.style.boxShadow = '0 0 0 1px #ba0c2f'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = '#e6e6e6'; e.currentTarget.style.boxShadow = 'none'; }}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: '#666' }}>
                  Description
                </label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={4}
                  placeholder={formType === 'bug' ? 'What happened? Steps to reproduce, expected vs. actual.' : 'What should this do, and why does it matter?'}
                  className="w-full rounded-lg border px-3 py-2 text-[14px] outline-none transition-colors resize-y"
                  style={{ borderColor: '#e6e6e6', color: '#141414' }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = '#ba0c2f'; e.currentTarget.style.boxShadow = '0 0 0 1px #ba0c2f'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = '#e6e6e6'; e.currentTarget.style.boxShadow = 'none'; }}
                />
              </div>
              {formError && <p className="text-[12px]" style={{ color: '#ba0c2f' }}>{formError}</p>}
              <div className="flex justify-end">
                <button
                  onClick={submitTicket}
                  disabled={submitting || !formTitle.trim() || !formDescription.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-[13px] font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: '#ba0c2f' }}
                  onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.background = '#9e1b34'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#ba0c2f'; }}
                >
                  {submitting ? 'Submitting...' : 'Submit ticket'}
                </button>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {tickets && tickets.length === 0 && !loading && (
          <div className="bg-white rounded-xl border shadow-sm p-10 text-center" style={{ borderColor: '#e6e6e6' }}>
            <CheckCircle2 size={32} className="mx-auto mb-3 text-gray-300" />
            <p className="text-sm font-medium" style={{ color: '#141414' }}>
              No {filter === 'all' ? '' : filter} tickets
            </p>
            <p className="text-xs mt-1" style={{ color: '#666' }}>
              Report a bug or request a feature with the button above.
            </p>
          </div>
        )}

        {tickets?.map((t) => {
          const isOpen = t.status === 'open';
          return (
            <article key={t.id} className="bg-white rounded-xl border shadow-sm overflow-hidden" style={{ borderColor: '#e6e6e6' }}>
              <div className="px-5 py-4 flex items-start gap-3">
                <div
                  className="shrink-0 mt-0.5 w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: isOpen ? 'rgba(186, 12, 47, 0.1)' : 'rgba(34, 139, 34, 0.1)' }}
                >
                  {isOpen ? (
                    t.type === 'bug' ? <Bug size={16} style={{ color: '#ba0c2f' }} /> : <Lightbulb size={16} style={{ color: '#ba0c2f' }} />
                  ) : (
                    <CheckCircle2 size={16} style={{ color: '#228b22' }} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full"
                      style={{
                        background: t.type === 'bug' ? 'rgba(186, 12, 47, 0.1)' : 'rgba(148, 111, 10, 0.1)',
                        color: t.type === 'bug' ? '#ba0c2f' : '#946f0a',
                      }}
                    >
                      {t.type === 'bug' ? 'Bug' : 'Feature'}
                    </span>
                    <span
                      className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full"
                      style={{
                        background: isOpen ? 'rgba(186, 12, 47, 0.1)' : 'rgba(34, 139, 34, 0.1)',
                        color: isOpen ? '#ba0c2f' : '#228b22',
                      }}
                    >
                      {t.status}
                    </span>
                    <span className="text-[12px] flex items-center gap-1" style={{ color: '#666' }}>
                      <Clock size={11} />
                      {formatTimestamp(t.createdAt)}
                    </span>
                    <span className="text-[12px]" style={{ color: '#999' }}>· filed by {t.createdBy}</span>
                  </div>
                  <p className="mt-2 text-[15px] font-semibold leading-snug" style={{ color: '#141414' }}>
                    {t.title}
                  </p>
                  <p className="mt-1 text-[13px] whitespace-pre-wrap" style={{ color: '#444' }}>
                    {t.description}
                  </p>
                  {!isOpen && (
                    <p className="mt-2 text-[12px]" style={{ color: '#666' }}>
                      Closed{t.closedBy ? ` by ${t.closedBy}` : ''}{t.closedAt ? ` · ${formatTimestamp(t.closedAt)}` : ''}
                    </p>
                  )}
                </div>
                {isOpen && (
                  <button
                    onClick={() => closeTicket(t.id)}
                    disabled={closingId === t.id}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ borderColor: '#e6e6e6', color: '#228b22' }}
                  >
                    <CheckCircle2 size={14} />
                    {closingId === t.id ? 'Closing...' : 'Close'}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </main>
    </div>
  );
}
