import { createHash, randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { pool } from '@/db/index';
import { sendEmail } from '@/lib/email';

export const runtime = 'nodejs';

const TOKEN_TTL_MINUTES = 60;
// Don't send more than one reset email per account per minute, so the form
// can't be used to flood someone's inbox.
const RESEND_COOLDOWN_SECONDS = 60;

// Start a password reset: email a one-time link to /reset-password. The
// response is identical whether or not the email has an account, so the form
// can't be used to discover which emails are registered.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { email?: string };
  const email = body.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
  }

  const ok = NextResponse.json({ ok: true });

  const user = await pool.query<{ id: string; email: string }>(
    'SELECT id, email FROM users WHERE LOWER(email) = $1 LIMIT 1',
    [email]
  );
  const row = user.rows[0];
  if (!row) return ok;

  const recent = await pool.query(
    `SELECT 1 FROM password_reset_tokens
      WHERE user_id = $1 AND created_at > NOW() - make_interval(secs => $2)
      LIMIT 1`,
    [row.id, RESEND_COOLDOWN_SECONDS]
  );
  if (recent.rows.length > 0) return ok;

  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');

  // Only the newest link works — drop any earlier unused ones.
  await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1 AND used_at IS NULL', [row.id]);
  await pool.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + make_interval(mins => $3))`,
    [row.id, tokenHash, TOKEN_TTL_MINUTES]
  );

  // Prefer the configured public URL: building the link from the request's
  // Host header would let a spoofed header point the email at another site.
  const baseUrl = (process.env.APP_URL || new URL(req.url).origin).replace(/\/+$/, '');
  const link = `${baseUrl}/reset-password?token=${token}`;

  await sendEmail({
    to: row.email,
    subject: 'Reset your BYU-Hawaii Assistant password',
    text:
      `Someone asked to reset the password for ${row.email}.\n\n` +
      `Reset it here (link works for ${TOKEN_TTL_MINUTES} minutes, one time only):\n${link}\n\n` +
      `If this wasn't you, ignore this email — your password won't change.`,
  });

  return ok;
}
