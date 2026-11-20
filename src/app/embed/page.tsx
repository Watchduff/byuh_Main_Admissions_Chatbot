'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { Plus, X } from 'lucide-react';
import ChatPanel from '@/components/ChatPanel';

interface Conversation {
  id: string;
  title: string;
  created_at: string;
}

const ACTIVE_CONVERSATION_KEY = 'byuhEmbedActiveConversationId';

// Standalone, chrome-light chat surface meant to be loaded inside an iframe by
// `public/embed.js` on a BYU–Hawaii website. No sidebar, no admin menu, no
// conversation list — a single conversation per embedded session. The parent
// page (via embed.js) owns open/close; the close button here just posts a
// message up to it.
export default function EmbedPage() {
  const [activeConversationId, setActiveConversationId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem(ACTIVE_CONVERSATION_KEY);
    } catch {
      return null;
    }
  });

  const setEmbedConversationId = useCallback((id: string | null) => {
    setActiveConversationId(id);
    try {
      if (id) window.localStorage.setItem(ACTIVE_CONVERSATION_KEY, id);
      else window.localStorage.removeItem(ACTIVE_CONVERSATION_KEY);
    } catch {
      // Storage can be unavailable in strict browser privacy modes.
    }
  }, []);

  const createConversationRemote = useCallback(async (): Promise<Conversation | null> => {
    try {
      const res = await fetch('/api/conversations', { method: 'POST' });
      if (!res.ok) return null;
      return (await res.json()) as Conversation;
    } catch {
      return null;
    }
  }, []);

  function postToParent(type: string) {
    if (typeof window === 'undefined' || window.parent === window) return;
    window.parent.postMessage({ source: 'byuh-chat', type }, '*');
  }

  // Tell the loader we're ready so it can reveal the iframe without a flash.
  useEffect(() => {
    postToParent('ready');
  }, []);

  function handleNewChat() {
    setEmbedConversationId(null);
  }

  return (
    <div className="flex flex-col h-dvh bg-white">
      <header
        className="shrink-0 flex items-center gap-3 px-4 h-14"
        style={{ background: '#ba0c2f' }}
      >
        <Image
          src="/logo.png"
          alt="BYU–Hawaii"
          width={120}
          height={32}
          className="h-7 w-auto brightness-0 invert"
          priority
        />
        <span className="flex-1 text-[15px] font-semibold text-white tracking-wide truncate">
          BYU-Hawaii Assistant
        </span>
        <button
          onClick={handleNewChat}
          className="shrink-0 p-1.5 rounded-md text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          title="New chat"
        >
          <Plus size={18} />
        </button>
        <button
          onClick={() => postToParent('close')}
          className="shrink-0 p-1.5 rounded-md text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          title="Close"
        >
          <X size={18} />
        </button>
      </header>

      <ChatPanel
        activeConversationId={activeConversationId}
        setActiveConversationId={setEmbedConversationId}
        onConversationsChanged={() => { /* no conversation list in the embed */ }}
        createConversationRemote={createConversationRemote}
      />
    </div>
  );
}
