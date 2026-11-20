import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { pool } from '@/db/index';
import { useSecureCookies } from '@/lib/cookies';

const scryptAsync = promisify(scrypt);

const COOKIE_NAME = 'byuh_admin_session';
const SESSION_DAYS = 30;
const SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AuthUser = { id: string; email: string; role: string };

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hashHex] = stored.split(':');
  if (!salt || !hashHex) return false;
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hashHex, 'hex');
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

export function timingSafeStringEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export async function createSession(userId: string): Promise<string> {
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000);
  const result = await pool.query<{ id: string }>(
    'INSERT INTO user_sessions (user_id, expires_at) VALUES ($1, $2) RETURNING id',
    [userId, expiresAt]
  );
  const sessionId = result.rows[0].id;
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: useSecureCookies(),
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
  return sessionId;
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const sid = cookieStore.get(COOKIE_NAME)?.value;
  if (sid && UUID_REGEX.test(sid)) {
    await pool.query('DELETE FROM user_sessions WHERE id = $1', [sid]);
  }
  cookieStore.delete(COOKIE_NAME);
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const sid = cookieStore.get(COOKIE_NAME)?.value;
  if (!sid || !UUID_REGEX.test(sid)) return null;
  const result = await pool.query<AuthUser>(
    `SELECT u.id, u.email, u.role
       FROM user_sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.id = $1 AND s.expires_at > NOW()`,
    [sid]
  );
  return result.rows[0] ?? null;
}

// Returns the auth user or a NextResponse to short-circuit the handler.
// Usage:
//   const auth = await requireAdmin();
//   if (auth instanceof NextResponse) return auth;
export async function requireAdmin(): Promise<AuthUser | NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (user.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  return user;
}
