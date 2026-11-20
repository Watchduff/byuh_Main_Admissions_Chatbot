import { NextResponse } from 'next/server';
import { pool } from '@/db/index';
import { createSession, verifyPassword } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
  };
  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? '';

  if (!email || !password) {
    return NextResponse.json(
      { error: 'Email and password are required.' },
      { status: 400 }
    );
  }

  const result = await pool.query<{
    id: string;
    email: string;
    password_hash: string;
    role: string;
  }>(
    'SELECT id, email, password_hash, role FROM users WHERE LOWER(email) = $1 LIMIT 1',
    [email]
  );

  const row = result.rows[0];
  // Always run the password verifier to keep the response time uniform.
  const ok = row
    ? await verifyPassword(password, row.password_hash)
    : await verifyPassword(password, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:00');

  if (!row || !ok) {
    return NextResponse.json(
      { error: 'Invalid email or password.' },
      { status: 401 }
    );
  }

  await createSession(row.id);

  return NextResponse.json({
    user: { id: row.id, email: row.email, role: row.role },
  });
}
