'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BarChart3, ChevronDown, DatabaseZap, Globe2, GitCommitHorizontal, Inbox, LogIn, LogOut, MessageSquare, MessagesSquare, Ticket, UserPlus } from 'lucide-react';

// Top-right dropdown for admin/staff destinations. Rendered on every page
// header. Public visitors see only "Sign in"; signed-in admins see the
// chatbot, support, country-criteria links, plus a sign-out action.
const ADMIN_ITEMS = [
  { href: '/', label: 'Chatbot', icon: MessageSquare },
  { href: '/support', label: 'Support', icon: Inbox, notify: 'support' as const },
  { href: '/conversations', label: 'Conversations', icon: MessagesSquare },
  { href: '/monitor', label: 'Monitoring', icon: BarChart3 },
  { href: '/scraping', label: 'Data and scraping', icon: DatabaseZap },
  { href: '/countries', label: 'Country criteria', icon: Globe2 },
  { href: '/tickets', label: 'Support tickets', icon: Ticket },
  { href: '/version', label: 'Version', icon: GitCommitHorizontal },
] as const;

const PENDING_POLL_MS = 30_000;

type AuthUser = { id: string; email: string; role: string };

export default function AdminMenu() {
  const router = useRouter();
  const pathname = usePathname();

  const [open, setOpen] = useState(false);
  const [pendingSupport, setPendingSupport] = useState(0);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Fetch the current user once on mount and any time the route changes,
  // so the menu refreshes after sign-in / sign-out navigations.
  useEffect(() => {
    let cancelled = false;
    async function fetchMe() {
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' });
        if (!res.ok) return;
        const data: { user: AuthUser | null } = await res.json();
        if (!cancelled) setUser(data.user);
      } catch {
        // Ignore — treat as logged out.
      } finally {
        if (!cancelled) setAuthLoaded(true);
      }
    }
    fetchMe();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const isAdmin = user?.role === 'admin';

  // Poll the pending-help-request count so we can show a red dot on the
  // Support item whenever something needs an answer. Skip while on /support
  // itself, and skip when not logged in (the API would return 401 anyway).
  //
  // The poll is gated on tab visibility: a backgrounded admin tab left open
  // (e.g. overnight) would otherwise hit the DB every 30s forever, keeping
  // Neon's compute permanently awake and racking up 24h/day of billed time.
  // We only poll while the tab is visible, and refetch immediately whenever
  // it becomes visible again so the dot is fresh the moment the admin returns.
  const onSupportPage = pathname === '/support';
  const shouldPoll = !onSupportPage && isAdmin;
  useEffect(() => {
    if (!shouldPoll) return;
    let cancelled = false;
    let intervalId: number | null = null;

    async function fetchCount() {
      try {
        const res = await fetch('/api/support/pending-count', { cache: 'no-store' });
        if (!res.ok) return;
        const data: { count?: number } = await res.json();
        if (!cancelled) setPendingSupport(data.count ?? 0);
      } catch {
        // Ignore — transient network errors shouldn't disturb the UI.
      }
    }

    function startPolling() {
      if (intervalId !== null) return;
      fetchCount();
      intervalId = window.setInterval(fetchCount, PENDING_POLL_MS);
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

    // Start immediately if the tab is currently visible; otherwise wait until
    // it becomes visible.
    if (document.visibilityState === 'visible') startPolling();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [shouldPoll]);

  const visiblePending = shouldPoll ? pendingSupport : 0;

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Close on route change.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setUser(null);
      setOpen(false);
      router.replace('/login');
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  // Don't render the menu trigger until we know the auth state — prevents a
  // flash of the wrong menu items.
  if (!authLoaded) {
    return <div className="shrink-0 w-[80px]" aria-hidden="true" />;
  }

  return (
    <div ref={wrapperRef} className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium text-white/90 hover:text-white border border-white/20 hover:bg-white/10 transition-colors cursor-pointer"
        title={visiblePending > 0 ? `Menu (${visiblePending} pending support request${visiblePending === 1 ? '' : 's'})` : 'Menu'}
      >
        Menu
        <ChevronDown
          size={14}
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
        />
        {visiblePending > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full"
            style={{ background: '#ff3b30', boxShadow: '0 0 0 2px white' }}
          />
        )}
        {visiblePending > 0 && (
          <span className="sr-only">{visiblePending} pending support requests</span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 min-w-[220px] rounded-lg border bg-white shadow-lg overflow-hidden z-50"
          style={{ borderColor: '#e6e6e6' }}
        >
          {user && (
            <div
              className="px-3 py-2.5 border-b"
              style={{ borderColor: '#f0f0f0', background: '#fafafb' }}
            >
              <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#888' }}>
                Signed in as
              </div>
              <div className="text-[13px] font-medium truncate" style={{ color: '#141414' }}>
                {user.email}
              </div>
            </div>
          )}

          {isAdmin &&
            ADMIN_ITEMS.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              const showDot = 'notify' in item && item.notify === 'support' && visiblePending > 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  role="menuitem"
                  className="flex items-center gap-2.5 px-3 py-2.5 text-[13px] transition-colors"
                  style={{
                    background: active ? 'rgba(186, 12, 47, 0.06)' : 'white',
                    color: active ? '#ba0c2f' : '#141414',
                    fontWeight: active ? 600 : 500,
                  }}
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.background = '#fafafb';
                  }}
                  onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.background = 'white';
                  }}
                >
                  <span className="relative shrink-0 inline-flex">
                    <Icon size={14} />
                    {showDot && (
                      <span
                        aria-hidden="true"
                        className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full"
                        style={{ background: '#ff3b30', boxShadow: '0 0 0 1.5px white' }}
                      />
                    )}
                  </span>
                  <span className="flex-1">{item.label}</span>
                  {showDot && (
                    <span
                      className="text-[10px] font-semibold rounded-full px-1.5 py-0.5"
                      style={{ background: '#ff3b30', color: 'white', minWidth: '1.1rem', textAlign: 'center' }}
                      aria-label={`${visiblePending} pending`}
                    >
                      {visiblePending}
                    </span>
                  )}
                </Link>
              );
            })}

          {user ? (
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              role="menuitem"
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[13px] transition-colors border-t cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ borderColor: '#f0f0f0', color: '#141414', background: 'white', fontWeight: 500 }}
              onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.background = '#fafafb'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'white'; }}
            >
              <LogOut size={14} />
              <span className="flex-1 text-left">{signingOut ? 'Signing out…' : 'Sign out'}</span>
            </button>
          ) : (
            <>
              <Link
                href="/login"
                role="menuitem"
                className="flex items-center gap-2.5 px-3 py-2.5 text-[13px] transition-colors"
                style={{ color: '#141414', background: 'white', fontWeight: 500 }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#fafafb'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'white'; }}
              >
                <LogIn size={14} />
                <span className="flex-1">Sign in</span>
              </Link>
              <Link
                href="/register"
                role="menuitem"
                className="flex items-center gap-2.5 px-3 py-2.5 text-[13px] transition-colors border-t"
                style={{ borderColor: '#f0f0f0', color: '#141414', background: 'white', fontWeight: 500 }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#fafafb'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'white'; }}
              >
                <UserPlus size={14} />
                <span className="flex-1">Register</span>
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}
