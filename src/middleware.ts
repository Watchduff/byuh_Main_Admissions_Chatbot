import { NextRequest, NextResponse } from 'next/server';

// Edge-runtime middleware for the admin pages. We can't talk to Postgres
// here, so this only checks that a session cookie is *present* — actual
// session validation (and the role check) happens in the page/API code.
// This is enough to bounce unauthenticated visitors to /login before any
// server component runs.
const PROTECTED_PAGES = ['/support', '/countries', '/conversations', '/monitor', '/scraping', '/version'];

const COOKIE_NAME = 'byuh_admin_session';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isProtected = PROTECTED_PAGES.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  );
  if (!isProtected) return NextResponse.next();

  const sessionId = req.cookies.get(COOKIE_NAME)?.value;
  if (!sessionId) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/support/:path*', '/countries/:path*', '/conversations/:path*', '/monitor/:path*', '/scraping/:path*', '/version/:path*'],
};
