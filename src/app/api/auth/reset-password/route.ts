import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { pool } from '@/db/index';
import { hashPassword } from '@/lib/auth';

export const runtime = 'nodejs';

const MIN_PASSWORD_LENGTH = 8;

// Finish a password reset: swap in the new password for the token's user,
// burn the token, and sign the user out everywhere.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    token?: string;
    password?: string;
    confirmPassword?: string;
  };
  const token = body.token ?? '';
  const password = body.password ?? '';
  const confirmPassword = body.confirmPassword ?? '';

  if (!token || !password || !confirmPassword) {
    return NextResponse.json({ error: 'All fields are required.' }, { status: 400 });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
      { status: 400 }
    );
  }
  if (password !== confirmPassword) {
    return NextResponse.json({ error: 'Passwords do not match.' }, { status: 400 });
  }

  const tokenHash = createHash('sha256').update(token).digest('hex');
  const passwordHash = await hashPassword(password);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Claim the token atomically so it can't be used twice.
    const claimed = await client.query<{ user_id: string }>(
      `UPDATE password_reset_tokens SET used_at = NOW()
        WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
        RETURNING user_id`,
      [tokenHash]
    );
    const userId = claimed.rows[0]?.user_id;
    if (!userId) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { error: 'This reset link is invalid or has expired. Request a new one.' },
        { status: 400 }
      );
    }
    await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, userId]);
    await client.query('DELETE FROM user_sessions WHERE user_id = $1', [userId]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  return NextResponse.json({ ok: true });
}
