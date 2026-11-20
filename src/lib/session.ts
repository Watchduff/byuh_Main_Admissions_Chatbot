import { cookies } from 'next/headers';
import { pool } from '@/db/index';
import { useSecureCookies } from '@/lib/cookies';

const COOKIE_NAME = 'byuh_session';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

/**
 * Get or create a session ID from the cookie.
 * Returns the session UUID.
 */
export async function getOrCreateSessionId(): Promise<string> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(COOKIE_NAME)?.value;

  if (existing) {
    // Verify session exists in DB
    const client = await pool.connect();
    try {
      const result = await client.query('SELECT id FROM sessions WHERE id = $1', [existing]);
      if (result.rows.length > 0) {
        return existing;
      }
    } finally {
      client.release();
    }
  }

  // Create new session
  const client = await pool.connect();
  try {
    const result = await client.query(
      'INSERT INTO sessions DEFAULT VALUES RETURNING id'
    );
    const sessionId = result.rows[0].id as string;

    // When the chat runs inside an iframe on a BYU–Hawaii site, the visitor
    // session cookie is a *third-party* cookie. Browsers only send those when
    // they are `SameSite=None; Secure`. Over HTTPS we set that so the embed
    // keeps the same session across requests. `SameSite=None` *requires*
    // `Secure`, so when cookies aren't secure (plain-http localhost dev, or the
    // internal VM with COOKIE_SECURE=false) we fall back to `lax` — the embed
    // iframe won't persist a session over HTTP, but first-party use still works.
    const secure = useSecureCookies();
    cookieStore.set(COOKIE_NAME, sessionId, {
      httpOnly: true,
      sameSite: secure ? 'none' : 'lax',
      secure,
      maxAge: COOKIE_MAX_AGE,
      path: '/',
    });

    return sessionId;
  } finally {
    client.release();
  }
}
