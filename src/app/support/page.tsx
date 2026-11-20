'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { Inbox, CheckCircle2, Clock, Send, RefreshCw, ChevronDown, ChevronUp, Power } from 'lucide-react';
import AdminMenu from '@/components/AdminMenu';

interface TranscriptEntry {
  role: string;
  content: string;
  created_at: string;
}

interface HelpRequest {
  id: string;
  conversationId: string;
  conversationTitle: string;
  userQuestion: string;
  reason: string | null;
  status: 'pending' | 'answered';
  answer: string | null;
  answeredBy: string | null;
  answeredAt: string | null;
  createdAt: string;
  transcript: TranscriptEntry[];
}

type Filter = 'pending' | 'answered' | 'all';

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

export default function SupportPage() {
  const [filter, setFilter] = useState<Filter>('pending');
  const [requests, setRequests] = useState<HelpRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [supportName, setSupportName] = useState('');
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [expandedTranscripts, setExpandedTranscripts] = useState<Record<string, boolean>>({});
  // null until loaded, so the switch doesn't flash the wrong state.
  const [supportEnabled, setSupportEnabled] = useState<boolean | null>(null);
  const [savingToggle, setSavingToggle] = useState(false);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = filter === 'all' ? '' : `?status=${filter}`;
      const res = await fetch(`/api/support/requests${qs}`);
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data: HelpRequest[] = await res.json();
      setRequests(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load requests');
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  useEffect(() => {
    fetch('/api/admin/settings', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { supportEnabled?: boolean } | null) => {
        if (data && typeof data.supportEnabled === 'boolean') setSupportEnabled(data.supportEnabled);
      })
      .catch(() => {});
  }, []);

  async function toggleSupport() {
    if (supportEnabled === null) return;
    const next = !supportEnabled;
    setSavingToggle(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supportEnabled: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed: ${res.status}`);
      }
      setSupportEnabled(next);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to update setting');
    } finally {
      setSavingToggle(false);
    }
  }

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('supportName') : null;
    if (saved) setSupportName(saved);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('supportName', supportName);
    }
  }, [supportName]);

  const stats = useMemo(() => {
    if (!requests) return { pending: 0, answered: 0 };
    return {
      pending: requests.filter((r) => r.status === 'pending').length,
      answered: requests.filter((r) => r.status === 'answered').length,
    };
  }, [requests]);

  async function submitAnswer(requestId: string) {
    const answer = answers[requestId]?.trim();
    if (!answer) return;
    setSubmitting(requestId);
    try {
      const res = await fetch(`/api/support/requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer, answeredBy: supportName.trim() || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed: ${res.status}`);
      }
      setAnswers((prev) => {
        const next = { ...prev };
        delete next[requestId];
        return next;
      });
      await loadRequests();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to submit answer');
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div className="min-h-dvh" style={{ background: '#f6f6f8' }}>
      <header
        className="px-4 sm:px-6 py-4 shadow-sm"
        style={{ background: '#ba0c2f' }}
      >
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
              Support Console
            </h1>
            <p className="text-[11px] sm:text-xs text-white/70 mt-0.5">
              Respond to student questions forwarded from the chatbot
            </p>
          </div>
          <button
            onClick={loadRequests}
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
        {/* Human-in-the-loop on/off switch */}
        <div className="bg-white rounded-xl border shadow-sm p-4 flex items-center gap-3" style={{ borderColor: '#e6e6e6' }}>
          <div
            className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: supportEnabled ? 'rgba(34, 139, 34, 0.1)' : '#f0f0f0' }}
          >
            <Power size={16} style={{ color: supportEnabled ? '#228b22' : '#999' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold" style={{ color: '#141414' }}>
              Human support {supportEnabled === null ? '' : supportEnabled ? 'is on' : 'is off'}
            </p>
            <p className="text-[12px] mt-0.5" style={{ color: '#666' }}>
              {supportEnabled
                ? 'The chatbot can forward questions to your team when a student asks for a real person.'
                : 'The chatbot won’t forward questions. Students who ask for a person get a link to the right office’s contact page.'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={!!supportEnabled}
            aria-label="Human support"
            onClick={toggleSupport}
            disabled={supportEnabled === null || savingToggle}
            className="shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: supportEnabled ? '#ba0c2f' : '#d4d4d4' }}
          >
            <span
              className="inline-block h-5 w-5 rounded-full bg-white shadow transition-transform"
              style={{ transform: supportEnabled ? 'translateX(22px)' : 'translateX(2px)' }}
            />
          </button>
        </div>

        {/* Support team member identity + filters */}
        <div className="bg-white rounded-xl border shadow-sm p-4" style={{ borderColor: '#e6e6e6' }}>
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1">
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: '#666' }}>
                Your name (shown to the student)
              </label>
              <input
                value={supportName}
                onChange={(e) => setSupportName(e.target.value)}
                placeholder="e.g. Alohi, Student Housing"
                className="w-full rounded-lg border px-3 py-2 text-[14px] outline-none transition-colors"
                style={{ borderColor: '#e6e6e6', color: '#141414' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#ba0c2f'; e.currentTarget.style.boxShadow = '0 0 0 1px #ba0c2f'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = '#e6e6e6'; e.currentTarget.style.boxShadow = 'none'; }}
              />
            </div>
            <div className="flex gap-1 p-1 rounded-lg" style={{ background: '#eceef2' }}>
              {(['pending', 'answered', 'all'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 rounded-md text-[13px] font-medium capitalize transition-colors cursor-pointer ${
                    filter === f ? 'bg-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
                  }`}
                  style={filter === f ? { color: '#ba0c2f' } : {}}
                >
                  {f}
                  {f === 'pending' && stats.pending > 0 ? (
                    <span
                      className="ml-1.5 inline-flex items-center justify-center text-[10px] font-semibold rounded-full px-1.5"
                      style={{ background: '#ba0c2f', color: 'white', minWidth: '1.1rem' }}
                    >
                      {stats.pending}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* Empty state */}
        {requests && requests.length === 0 && !loading && (
          <div className="bg-white rounded-xl border shadow-sm p-10 text-center" style={{ borderColor: '#e6e6e6' }}>
            <Inbox size={32} className="mx-auto mb-3 text-gray-300" />
            <p className="text-sm font-medium" style={{ color: '#141414' }}>
              No {filter === 'all' ? '' : filter} requests
            </p>
            <p className="text-xs mt-1" style={{ color: '#666' }}>
              When a student asks the chatbot to talk to a support team member, their question will show up here.
            </p>
          </div>
        )}

        {/* Request cards */}
        {requests?.map((r) => {
          const expanded = !!expandedTranscripts[r.id];
          const isPending = r.status === 'pending';
          return (
            <article
              key={r.id}
              className="bg-white rounded-xl border shadow-sm overflow-hidden"
              style={{ borderColor: '#e6e6e6' }}
            >
              <div className="px-5 py-4 border-b flex items-start gap-3" style={{ borderColor: '#f0f0f0' }}>
                <div
                  className="shrink-0 mt-0.5 w-8 h-8 rounded-full flex items-center justify-center"
                  style={{
                    background: isPending ? 'rgba(186, 12, 47, 0.1)' : 'rgba(34, 139, 34, 0.1)',
                  }}
                >
                  {isPending ? (
                    <Clock size={16} style={{ color: '#ba0c2f' }} />
                  ) : (
                    <CheckCircle2 size={16} style={{ color: '#228b22' }} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full"
                      style={{
                        background: isPending ? 'rgba(186, 12, 47, 0.1)' : 'rgba(34, 139, 34, 0.1)',
                        color: isPending ? '#ba0c2f' : '#228b22',
                      }}
                    >
                      {r.status}
                    </span>
                    <span className="text-[12px]" style={{ color: '#666' }}>
                      {formatTimestamp(r.createdAt)}
                    </span>
                    <span className="text-[12px] truncate" style={{ color: '#999' }}>
                      · {r.conversationTitle}
                    </span>
                  </div>
                  <p className="mt-2 text-[15px] font-semibold leading-snug" style={{ color: '#141414' }}>
                    {r.userQuestion}
                  </p>
                  {r.reason && (
                    <p className="mt-1 text-[12px] italic" style={{ color: '#666' }}>
                      Chatbot note: {r.reason}
                    </p>
                  )}
                </div>
              </div>

              {/* Transcript toggle */}
              {r.transcript.length > 0 && (
                <div className="px-5 py-2 border-b" style={{ borderColor: '#f0f0f0' }}>
                  <button
                    onClick={() =>
                      setExpandedTranscripts((prev) => ({ ...prev, [r.id]: !prev[r.id] }))
                    }
                    className="flex items-center gap-1 text-[12px] font-medium hover:underline cursor-pointer"
                    style={{ color: '#946f0a' }}
                  >
                    {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    {expanded ? 'Hide' : 'Show'} conversation ({r.transcript.length} messages)
                  </button>
                  {expanded && (
                    <div className="mt-2 space-y-2 max-h-80 overflow-y-auto pr-1">
                      {r.transcript.map((m, idx) => (
                        <div
                          key={idx}
                          className="rounded-lg px-3 py-2 text-[13px] leading-relaxed"
                          style={{
                            background: m.role === 'user' ? '#f6f6f8' : 'rgba(186, 12, 47, 0.04)',
                            borderLeft: `3px solid ${m.role === 'user' ? '#c4c4c4' : '#ba0c2f'}`,
                          }}
                        >
                          <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: '#999' }}>
                            {m.role === 'user' ? 'Student' : 'Assistant'} · {formatTimestamp(m.created_at)}
                          </div>
                          <div className="whitespace-pre-wrap" style={{ color: '#141414' }}>
                            {m.content}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Answer or reply form */}
              <div className="px-5 py-4">
                {isPending ? (
                  <div className="space-y-2">
                    <label className="block text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#666' }}>
                      Your reply
                    </label>
                    <textarea
                      value={answers[r.id] ?? ''}
                      onChange={(e) =>
                        setAnswers((prev) => ({ ...prev, [r.id]: e.target.value }))
                      }
                      rows={4}
                      placeholder="Write a clear, warm answer. The student will see this in their chat."
                      className="w-full rounded-lg border px-3 py-2 text-[14px] outline-none transition-colors resize-y"
                      style={{ borderColor: '#e6e6e6', color: '#141414' }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = '#ba0c2f'; e.currentTarget.style.boxShadow = '0 0 0 1px #ba0c2f'; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = '#e6e6e6'; e.currentTarget.style.boxShadow = 'none'; }}
                    />
                    <div className="flex justify-end">
                      <button
                        onClick={() => submitAnswer(r.id)}
                        disabled={submitting === r.id || !(answers[r.id]?.trim())}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-[13px] font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ background: '#ba0c2f' }}
                        onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.background = '#9e1b34'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = '#ba0c2f'; }}
                      >
                        <Send size={14} />
                        {submitting === r.id ? 'Sending...' : 'Send reply'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#666' }}>
                      Reply sent
                      {r.answeredBy ? ` by ${r.answeredBy}` : ''}
                      {r.answeredAt ? ` · ${formatTimestamp(r.answeredAt)}` : ''}
                    </div>
                    <div
                      className="rounded-lg px-3 py-2 text-[14px] whitespace-pre-wrap"
                      style={{ background: 'rgba(34, 139, 34, 0.06)', color: '#141414' }}
                    >
                      {r.answer}
                    </div>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </main>
    </div>
  );
}
