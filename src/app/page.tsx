'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { Menu, MessageSquare, Plus, Trash2, X } from 'lucide-react';
import ChatPanel from '@/components/ChatPanel';
import AdminMenu from '@/components/AdminMenu';

interface Conversation {
  id: string;
  title: string;
  created_at: string;
}

export default function Home() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/conversations');
      const data: Conversation[] = await res.json();
      setConversations(data);
      setActiveConversationId((prev) => {
        if (prev) return prev;
        return data.length > 0 ? data[0].id : null;
      });
    } catch { /* ignore */ }
  }, []);

  // Initial fetch on mount. Lint wants us to avoid calling setState in an
  // effect, but this is the standard "load initial data" pattern — the
  // alternative (Suspense / server component) would be a much bigger refactor.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    void fetchConversations();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [fetchConversations]);

  async function createConversationRemote(): Promise<Conversation | null> {
    try {
      const res = await fetch('/api/conversations', { method: 'POST' });
      const conv: Conversation = await res.json();
      setConversations((prev) => [conv, ...prev]);
      return conv;
    } catch {
      return null;
    }
  }

  async function handleNewConversation() {
    const conv = await createConversationRemote();
    if (conv) {
      setActiveConversationId(conv.id);
      setSidebarOpen(false);
    }
  }

  async function handleDeleteConversation(id: string) {
    try {
      await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConversationId === id) setActiveConversationId(null);
    } catch { /* ignore */ }
  }

  const headerTitle = activeConversationId
    ? conversations.find((c) => c.id === activeConversationId)?.title || 'Chat'
    : 'BYU-Hawaii Assistant';

  // Fixed to the screen height so only the message list scrolls; with min-h
  // the whole page grew on phones and pushed the footer off-screen.
  return (
    <div className="flex h-dvh overflow-hidden bg-white">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ─── Sidebar ─── */}
      <aside
        className={`fixed lg:sticky lg:top-0 lg:self-start lg:h-dvh inset-y-0 lg:inset-y-auto left-0 z-40 w-72 bg-byuh-burgundy flex flex-col transition-transform duration-200 lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col items-center px-4 pt-5 pb-3 border-b border-white/10">
          <a href="https://www.byuh.edu" target="_blank" rel="noopener noreferrer" className="cursor-pointer mb-3">
            <Image
              src="/logo.png"
              alt="BYU–Hawaii website"
              width={140}
              height={36}
              className="h-8 w-auto brightness-0 invert"
              priority
            />
          </a>
          <div className="flex items-center gap-0.5 w-full justify-between">
            <button
              onClick={handleNewConversation}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-white/80 hover:text-white hover:bg-white/10 transition-colors text-[13px] font-medium cursor-pointer"
              title="New conversation"
            >
              <Plus size={16} strokeWidth={2.5} />
              New chat
            </button>
            <button
              onClick={() => setSidebarOpen(false)}
              aria-label="Close menu"
              className="p-2 rounded-md text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer lg:hidden"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {conversations.length === 0 && (
            <div className="px-3 py-8 text-center">
              <MessageSquare size={24} className="mx-auto mb-2 text-white/25" />
              <p className="text-xs text-white/40">No conversations yet</p>
            </div>
          )}
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={`group flex items-center gap-2.5 rounded-md px-3 py-2.5 text-[13px] cursor-pointer transition-all duration-150 ${
                activeConversationId === conv.id
                  ? 'bg-white/15 text-white shadow-sm'
                  : 'text-white/70 hover:bg-white/8 hover:text-white/90'
              }`}
              onClick={() => { setActiveConversationId(conv.id); setSidebarOpen(false); }}
            >
              <MessageSquare size={14} className="shrink-0 opacity-50" />
              <span className="flex-1 truncate leading-snug">{conv.title}</span>
              <button
                onClick={(e) => { e.stopPropagation(); handleDeleteConversation(conv.id); }}
                className="shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-white/15 transition-all cursor-pointer"
                title="Delete"
              >
                <Trash2 size={13} className="text-white/60" />
              </button>
            </div>
          ))}
        </nav>

        <div className="px-4 py-3 border-t border-white/10">
          <p className="text-[11px] text-white/30 text-center tracking-wide uppercase">
            BYU-Hawaii Assistant
          </p>
        </div>
      </aside>

      {/* ─── Main Area ─── */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0">
        <header className="sticky top-0 z-20 shrink-0 flex items-center gap-3 px-4 py-0 h-14" style={{ background: '#ba0c2f' }}>
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
            className="p-1.5 -ml-1 rounded-md text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer lg:hidden"
          >
            <Menu size={22} />
          </button>
          <a href="https://www.byuh.edu" target="_blank" rel="noopener noreferrer" className="cursor-pointer lg:hidden">
            <Image
              src="/logo.png"
              alt="BYU–Hawaii website"
              width={120}
              height={32}
              className="h-7 w-auto brightness-0 invert"
            />
          </a>

          <div className="flex-1 min-w-0 flex items-center gap-4">
            <h1 className="text-[15px] font-semibold text-white truncate tracking-wide hidden sm:block">
              {headerTitle}
            </h1>
          </div>

          <button
            onClick={handleNewConversation}
            className="shrink-0 hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium text-white/90 hover:text-white border border-white/20 hover:bg-white/10 transition-colors cursor-pointer"
          >
            <Plus size={15} />
            New chat
          </button>

          <AdminMenu />
        </header>

        <ChatPanel
          activeConversationId={activeConversationId}
          setActiveConversationId={setActiveConversationId}
          onConversationsChanged={fetchConversations}
          createConversationRemote={createConversationRemote}
        />
      </div>
    </div>
  );
}
