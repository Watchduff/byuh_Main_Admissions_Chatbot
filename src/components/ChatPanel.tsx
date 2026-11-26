'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, UIMessage } from 'ai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { ArrowRight, Check, Info } from 'lucide-react';
import ChatMessages from './ChatMessages';
import ChatInput from './ChatInput';
import MessageFeedback, { type Rating } from './MessageFeedback';
import DisclaimerGate, { DisclaimerNote } from './DisclaimerGate';

interface Conversation {
  id: string;
  title: string;
  created_at: string;
}

const SUGGESTIONS = [
  { label: 'Admission requirements', full: 'What are the admission requirements for BYU–Hawaii?' },
  { label: 'Tuition and costs', full: 'How much does it cost to attend BYU–Hawaii?' },
  { label: 'Scholarships', full: 'What scholarships are available at BYU–Hawaii?' },
  { label: 'Campus housing', full: 'Tell me about campus housing at BYU–Hawaii' },
];

// Shown on the empty state so visitors know the assistant's scope up front.
// Mirrors the areas the RAG context actually covers across BYU–Hawaii's sites
// (admissions, financial aid, housing, registrar, advising, student life, and more).
const CAPABILITIES = [
  'Applying and admission requirements',
  'Tuition, costs, and scholarships',
  'Campus housing and student life',
  'Classes, majors, and registration',
  'Visas, I-20, and international students',
  'Campus services, offices, and policies',
];

interface ChatPanelProps {
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
  onConversationsChanged: () => void;
  createConversationRemote: () => Promise<Conversation | null>;
}

export default function ChatPanel({
  activeConversationId,
  setActiveConversationId,
  onConversationsChanged,
  createConversationRemote,
}: ChatPanelProps) {
  const activeIdRef = useRef<string | null>(activeConversationId);
  const skipNextLoadRef = useRef(false);

  useEffect(() => {
    activeIdRef.current = activeConversationId;
  }, [activeConversationId]);

  // The `body` callback runs at send time, not during render — reading
  // activeIdRef.current there is safe, but the lint rule can't see that.
  const transport = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs
      new DefaultChatTransport({
        api: '/api/chat',
        body: () => ({ conversationId: activeIdRef.current }),
      }),
    []
  );

  // Maps a fresh (client-generated) assistant message id to its persisted
  // chat_messages.id, learned from the `data-persisted` transient stream part
  // the chat route emits once it saves the answer. Historical messages already
  // carry their DB id as their message id (set by /api/messages), so they don't
  // need an entry here.
  const [dbIdByMsgId, setDbIdByMsgId] = useState<Record<string, number>>({});
  // Current 👍/👎 per persisted message id.
  const [feedback, setFeedback] = useState<Record<number, Rating>>({});

  const { messages, sendMessage, setMessages, status } = useChat({
    transport,
    onData: (part) => {
      if (part.type === 'data-persisted') {
        const messageId = (part.data as { messageId?: number }).messageId;
        if (typeof messageId !== 'number') return;
        // The transient part lands at the end of the assistant turn, so the
        // last assistant message in the stream is the one it belongs to.
        const lastAssistant = [...messagesRef.current].reverse().find((m) => m.role === 'assistant');
        if (lastAssistant) {
          setDbIdByMsgId((prev) => ({ ...prev, [lastAssistant.id]: messageId }));
        }
      }
    },
  });
  const [input, setInput] = useState('');

  // Latest messages, readable from the onData callback without re-subscribing.
  const messagesRef = useRef<UIMessage[]>(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Resolve a message's persisted DB id: historical messages use their numeric
  // id directly; freshly streamed ones come from the data-persisted map.
  const resolveDbId = useCallback(
    (msg: UIMessage): number | null => {
      const mapped = dbIdByMsgId[msg.id];
      if (typeof mapped === 'number') return mapped;
      const numeric = Number(msg.id);
      return Number.isInteger(numeric) ? numeric : null;
    },
    [dbIdByMsgId]
  );

  const submitFeedback = useCallback(
    (dbId: number, rating: Rating | null, comment?: string) => {
      setFeedback((prev) => {
        const next = { ...prev };
        if (rating === null) delete next[dbId];
        else next[dbId] = rating;
        return next;
      });
      void fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: dbId, rating, comment }),
      }).catch(() => { /* best-effort; UI already reflects the choice */ });
    },
    []
  );

  const renderFeedback = useCallback(
    (msg: UIMessage) => {
      const dbId = resolveDbId(msg);
      // No control until the answer is persisted (id known) and settled.
      if (dbId === null) return null;
      return (
        <MessageFeedback
          rating={feedback[dbId] ?? null}
          onRate={(rating, comment) => submitFeedback(dbId, rating, comment)}
        />
      );
    },
    [resolveDbId, feedback, submitFeedback]
  );
  // The server's view of whether this conversation has an outstanding
  // human-help request. Combined with any in-stream escalation tool call
  // below to derive `pendingSupport`.
  const [pendingSupportFromServer, setPendingSupportFromServer] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isLoading = status === 'submitted' || status === 'streaming';
  const showTypingDots = status === 'submitted';

  const loadMessages = useCallback(async (convId: string) => {
    try {
      const res = await fetch(`/api/messages?conversationId=${convId}`);
      const data: {
        messages: UIMessage[];
        pendingSupport: boolean;
        feedback?: Record<string, Rating>;
      } = await res.json();
      setMessages(data.messages);
      setPendingSupportFromServer(Boolean(data.pendingSupport));
      // Seed the 👍/👎 state from saved feedback (keyed by DB message id).
      const seeded: Record<number, Rating> = {};
      for (const [id, rating] of Object.entries(data.feedback ?? {})) {
        seeded[Number(id)] = rating;
      }
      setFeedback(seeded);
    } catch {
      setMessages([]);
      setPendingSupportFromServer(false);
    }
  }, [setMessages]);

  useEffect(() => {
    if (skipNextLoadRef.current) {
      skipNextLoadRef.current = false;
      return;
    }
    // loadMessages awaits a fetch before calling setState, so the rule's
    // "synchronous setState in effect body" concern doesn't apply here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (activeConversationId) loadMessages(activeConversationId);
    else setMessages([]);
  }, [activeConversationId, loadMessages, setMessages]);

  // Whether this conversation is waiting on a human support team member's
  // reply. Two sources feed it: the server-reported flag (so reopening a
  // conversation with a pending request resumes polling) and the in-memory
  // tool-call stream (so polling starts the moment the assistant escalates,
  // without waiting for a refresh). Polling stops once the server flag
  // clears AND no tool-call part is left in memory — i.e. after the reply
  // lands and `loadMessages` swaps in the DB version of the conversation.
  const pendingSupport = useMemo(() => {
    if (pendingSupportFromServer) return true;
    return messages.some(
      (m) =>
        m.role === 'assistant' &&
        m.parts.some((p) => {
          const part = p as { type: string; state?: string };
          return part.type === 'tool-redirectToSupport' && part.state === 'output-available';
        })
    );
  }, [pendingSupportFromServer, messages]);

  // Poll for a support team member's reply, but only while one is actually
  // expected. The /api/support/requests/[id] endpoint appends an assistant
  // message to the conversation when a support staffer answers; this refresh
  // picks it up. Once the reply lands, `pendingSupport` flips false and the
  // interval is torn down.
  //
  // Like the admin menu's count poll, this is gated on tab visibility so a
  // backgrounded tab with an unanswered request doesn't keep Neon's compute
  // awake indefinitely. We poll only while visible and refresh immediately
  // when the tab comes back into focus.
  useEffect(() => {
    if (!activeConversationId) return;
    if (status !== 'ready') return;
    if (!pendingSupport) return;

    let intervalId: number | null = null;

    function startPolling() {
      if (intervalId !== null) return;
      loadMessages(activeConversationId!);
      intervalId = window.setInterval(() => {
        loadMessages(activeConversationId!);
      }, 15000);
    }

    function stopPolling() {
      if (intervalId === null) return;
      window.clearInterval(intervalId);
      intervalId = null;
    }

    function handleVisibility() {
      if (document.visibilityState === 'visible') startPolling();
      else stopPolling();
    }

    if (document.visibilityState === 'visible') startPolling();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [activeConversationId, status, pendingSupport, loadMessages]);

  async function submitMessage(text: string) {
    if (!text.trim()) return;
    let convId = activeConversationId;
    if (!convId) {
      const conv = await createConversationRemote();
      if (!conv) return;
      convId = conv.id;
      skipNextLoadRef.current = true;
      setActiveConversationId(convId);
      activeIdRef.current = convId;
    }
    sendMessage({ parts: [{ type: 'text', text }] });
    setInput('');
    setTimeout(() => { onConversationsChanged(); }, 1500);
  }

  return (
    <div className="flex flex-col flex-1 min-w-0 min-h-0">
      {/* First-visit legal disclaimer gate (ROADMAP L2 / A1). Rendered here so
          both the main app and the embedded widget are gated by it. */}
      <DisclaimerGate />
      <main className="flex-1 overflow-y-auto" style={{ background: '#f6f6f8' }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-5">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 sm:py-16">
              <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6"
                style={{ background: '#ba0c2f' }}>
                <Image
                  src="/logo.png"
                  alt="BYU–Hawaii"
                  width={56}
                  height={36}
                  className="h-7 w-auto brightness-0 invert"
                />
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2"
                style={{ color: '#141414' }}>
                How can I help?
              </h2>
              <p className="text-sm max-w-sm text-center mb-7 leading-relaxed"
                style={{ color: '#666666' }}>
                I&rsquo;m the BYU-Hawaii Assistant. Ask me anything about BYU–Hawaii &mdash; in English.
              </p>

              {/* What I can help with — sets the assistant's scope up front. */}
              <div className="w-full max-w-md mb-5">
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-2.5" style={{ color: '#999' }}>
                  What I can help with
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2">
                  {CAPABILITIES.map((c) => (
                    <div key={c} className="flex items-start gap-2">
                      <span className="shrink-0 mt-0.5 w-4 h-4 rounded-full flex items-center justify-center"
                        style={{ background: 'rgba(34,139,34,0.12)' }}>
                        <Check size={11} strokeWidth={3} style={{ color: '#1f7a1f' }} />
                      </span>
                      <span className="text-[13px] leading-snug" style={{ color: '#141414' }}>{c}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* What I can't do — sets expectations and points to the human path. */}
              <div className="w-full max-w-md mb-7 flex gap-2.5 rounded-lg bg-white border p-3.5"
                style={{ borderColor: '#e6e6e6' }}>
                <Info size={15} className="shrink-0 mt-0.5" style={{ color: '#946f0a' }} />
                <p className="text-[12.5px] leading-relaxed" style={{ color: '#666666' }}>
                  I can&rsquo;t see your personal records, like your application, account, or grades, or make official decisions.
                </p>
              </div>

              <p className="text-[10px] font-semibold uppercase tracking-wider mb-2.5 w-full max-w-md" style={{ color: '#999' }}>
                Try asking
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-md">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => submitMessage(s.full)}
                    className="group flex items-center justify-between gap-2 px-4 py-3.5 rounded-lg bg-white text-left text-[13px] font-medium shadow-sm border transition-all duration-150 hover:shadow-md hover:-translate-y-px cursor-pointer"
                    style={{ color: '#141414', borderColor: '#e6e6e6' }}
                  >
                    <span>{s.label}</span>
                    <ArrowRight size={14} className="shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: '#ba0c2f' }} />
                  </button>
                ))}
              </div>
            </div>
          )}

          <ChatMessages messages={messages} showTypingDots={showTypingDots} renderFeedback={renderFeedback} />
        </div>
      </main>

      <footer className="shrink-0 bg-white border-t px-4 py-3" style={{ borderColor: '#e6e6e6' }}>
        <ChatInput
          ref={inputRef}
          value={input}
          onChange={setInput}
          onSubmit={() => submitMessage(input)}
          disabled={isLoading}
          placeholder="Ask about BYU–Hawaii..."
        />
        <DisclaimerNote />
      </footer>
    </div>
  );
}
