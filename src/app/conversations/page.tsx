'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  MessagesSquare,
  RefreshCw,
  Search,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react';
import AdminMenu from '@/components/AdminMenu';

interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  lastMessageAt: string | null;
  messageCount: number;
  thumbsUp: number;
  thumbsDown: number;
}

interface TranscriptMessage {
  id: number;
  role: string;
  content: string;
  createdAt: string;
  sources: Array<{ url: string; title: string }>;
  feedback: { rating: string; comment: string | null } | null;
}

interface Transcript {
  id: string;
  title: string;
  createdAt: string;
  messages: TranscriptMessage[];
}

interface ConversationsResponse {
  conversations: ConversationSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const PAGE_SIZE = 10;

function formatTimestamp(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [transcriptLoading, setTranscriptLoading] = useState(false);

  const loadConversations = useCallback(async (q: string, p: number) => {
    setLoading(true);
    setError(null);
    try {
      const sp = new URLSearchParams();
      if (q.trim()) sp.set('q', q.trim());
      sp.set('page', String(p));
      sp.set('pageSize', String(PAGE_SIZE));
      const res = await fetch(`/api/admin/conversations?${sp.toString()}`);
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data: ConversationsResponse = await res.json();
      setConversations(data.conversations);
      setTotalPages(data.totalPages);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load conversations');
      setConversations([]);
      setTotalPages(1);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  // Reset to the first page whenever the search query changes.
  useEffect(() => {
    setPage(1);
  }, [query]);

  // Load conversations on mount and whenever the page or (debounced) query changes.
  useEffect(() => {
    const t = setTimeout(() => loadConversations(query, page), 300);
    return () => clearTimeout(t);
  }, [query, page, loadConversations]);

  const openConversation = useCallback(async (id: string) => {
    setSelectedId(id);
    setTranscript(null);
    setTranscriptLoading(true);
    try {
      const res = await fetch(`/api/admin/conversations/${id}`);
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      setTranscript(await res.json());
    } catch {
      setTranscript(null);
    } finally {
      setTranscriptLoading(false);
    }
  }, []);

  // Deep link: /conversations?id=<uuid> (e.g. from a Monitoring thumbs-down
  // row) opens that transcript straight away, even if it isn't on page 1.
  // Read from window.location rather than useSearchParams to avoid wrapping
  // the whole page in a Suspense boundary.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('id');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (id) openConversation(id);
  }, [openConversation]);

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
              Conversations
            </h1>
            <p className="text-[11px] sm:text-xs text-white/70 mt-0.5">
              Read-only view of visitor chats for monitoring and content improvement
            </p>
          </div>
          <button
            onClick={() => loadConversations(query, page)}
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

        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-5">
          {/* ─── List pane ─── */}
          <section className={`${selectedId ? 'hidden lg:block' : 'block'}`}>
            <div className="relative mb-3">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#999' }} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by title…"
                className="w-full rounded-lg border pl-9 pr-3 py-2 text-[14px] outline-none transition-colors bg-white"
                style={{ borderColor: '#e6e6e6', color: '#141414' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#ba0c2f'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = '#e6e6e6'; }}
              />
            </div>

            {conversations && conversations.length === 0 && !loading && (
              <div className="bg-white rounded-xl border shadow-sm p-8 text-center" style={{ borderColor: '#e6e6e6' }}>
                <MessagesSquare size={28} className="mx-auto mb-2 text-gray-300" />
                <p className="text-sm font-medium" style={{ color: '#141414' }}>No conversations</p>
                <p className="text-xs mt-1" style={{ color: '#666' }}>
                  {query ? 'Nothing matches your search.' : 'Visitor chats will appear here.'}
                </p>
              </div>
            )}

            <div className="space-y-2">
              {conversations?.map((c) => {
                const active = c.id === selectedId;
                return (
                  <button
                    key={c.id}
                    onClick={() => openConversation(c.id)}
                    className="w-full text-left bg-white rounded-xl border shadow-sm px-4 py-3 transition-all hover:shadow-md cursor-pointer"
                    style={{ borderColor: active ? '#ba0c2f' : '#e6e6e6' }}
                  >
                    <div className="flex items-start gap-2">
                      <span className="flex-1 text-[14px] font-semibold leading-snug truncate" style={{ color: '#141414' }}>
                        {c.title}
                      </span>
                      <div className="shrink-0 flex items-center gap-1.5 text-[11px]">
                        {c.thumbsUp > 0 && (
                          <span className="inline-flex items-center gap-0.5" style={{ color: '#1f7a1f' }}>
                            <ThumbsUp size={11} />{c.thumbsUp}
                          </span>
                        )}
                        {c.thumbsDown > 0 && (
                          <span className="inline-flex items-center gap-0.5" style={{ color: '#ba0c2f' }}>
                            <ThumbsDown size={11} />{c.thumbsDown}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[11px]" style={{ color: '#999' }}>
                      <span>{c.messageCount} message{c.messageCount === 1 ? '' : 's'}</span>
                      <span>·</span>
                      <span className="truncate">{formatTimestamp(c.lastMessageAt)}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {conversations && conversations.length > 0 && totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || loading}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border bg-white text-[13px] font-medium transition-colors hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  style={{ borderColor: '#e6e6e6', color: '#141414' }}
                >
                  <ChevronLeft size={14} /> Prev
                </button>
                <span className="text-[12px]" style={{ color: '#666' }}>
                  Page {page} of {totalPages}
                  <span className="hidden sm:inline"> · {total} total</span>
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || loading}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border bg-white text-[13px] font-medium transition-colors hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  style={{ borderColor: '#e6e6e6', color: '#141414' }}
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            )}
          </section>

          {/* ─── Transcript pane ─── */}
          <section className={`${selectedId ? 'block' : 'hidden lg:block'}`}>
            {!selectedId ? (
              <div className="hidden lg:flex flex-col items-center justify-center h-full min-h-[300px] bg-white rounded-xl border shadow-sm text-center px-8" style={{ borderColor: '#e6e6e6' }}>
                <MessagesSquare size={32} className="mb-3 text-gray-300" />
                <p className="text-sm font-medium" style={{ color: '#141414' }}>Select a conversation</p>
                <p className="text-xs mt-1" style={{ color: '#666' }}>Pick a chat on the left to read its full transcript.</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border shadow-sm overflow-hidden" style={{ borderColor: '#e6e6e6' }}>
                <div className="px-5 py-3.5 border-b flex items-center gap-3" style={{ borderColor: '#f0f0f0' }}>
                  <button
                    onClick={() => { setSelectedId(null); setTranscript(null); }}
                    className="lg:hidden shrink-0 p-1 rounded-md hover:bg-gray-100 cursor-pointer"
                    style={{ color: '#666' }}
                    title="Back to list"
                  >
                    <ArrowLeft size={18} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-[15px] font-semibold truncate" style={{ color: '#141414' }}>
                      {transcript?.title ?? 'Loading…'}
                    </h2>
                    {transcript && (
                      <p className="text-[11px] mt-0.5" style={{ color: '#999' }}>
                        Started {formatTimestamp(transcript.createdAt)} · {transcript.messages.length} messages
                      </p>
                    )}
                  </div>
                </div>

                <div className="px-5 py-4 space-y-4 max-h-[calc(100dvh-220px)] overflow-y-auto">
                  {transcriptLoading && (
                    <p className="text-sm text-center py-8" style={{ color: '#999' }}>Loading transcript…</p>
                  )}

                  {transcript?.messages.map((m) => (
                    <div key={m.id}>
                      <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: '#999' }}>
                        {m.role === 'user' ? 'Student' : 'Assistant'} · {formatTimestamp(m.createdAt)}
                      </div>
                      <div
                        className="rounded-lg px-3.5 py-2.5 text-[13.5px] leading-relaxed"
                        style={{
                          background: m.role === 'user' ? '#f6f6f8' : 'rgba(186, 12, 47, 0.04)',
                          borderLeft: `3px solid ${m.role === 'user' ? '#c4c4c4' : '#ba0c2f'}`,
                          color: '#141414',
                        }}
                      >
                        {m.role === 'user' ? (
                          <p className="whitespace-pre-wrap">{m.content}</p>
                        ) : (
                          <div className="prose prose-sm max-w-none prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                          </div>
                        )}

                        {m.sources.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t" style={{ borderColor: '#f0f0f0' }}>
                            {m.sources.map((s) => (
                              <a
                                key={s.url}
                                href={s.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium no-underline"
                                style={{ background: 'rgba(148, 111, 10, 0.08)', color: '#946f0a' }}
                              >
                                <ExternalLink size={10} />
                                <span className="max-w-[180px] truncate">{s.title || s.url}</span>
                              </a>
                            ))}
                          </div>
                        )}
                      </div>

                      {m.feedback && (
                        <div className="mt-1.5 flex items-start gap-1.5 text-[12px]">
                          {m.feedback.rating === 'up' ? (
                            <span className="inline-flex items-center gap-1 font-medium" style={{ color: '#1f7a1f' }}>
                              <ThumbsUp size={12} /> Helpful
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 font-medium" style={{ color: '#ba0c2f' }}>
                              <ThumbsDown size={12} /> Not helpful
                            </span>
                          )}
                          {m.feedback.comment && (
                            <span className="italic" style={{ color: '#666' }}>&ldquo;{m.feedback.comment}&rdquo;</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  {transcript && transcript.messages.length === 0 && !transcriptLoading && (
                    <p className="text-sm text-center py-8" style={{ color: '#999' }}>This conversation has no messages.</p>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
