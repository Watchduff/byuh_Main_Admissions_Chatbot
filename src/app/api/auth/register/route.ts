import { NextResponse } from 'next/server';
import { pool } from '@/db/index';
import { createSession, hashPassword, timingSafeStringEqual } from '@/lib/auth';

export const runtime = 'nodejs';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
    confirmPassword?: string;
    registrationKey?: string;
  };

  const email = body.email?.trim().toLowerCase() ?? '';
  const password = body.password ?? '';
  const confirmPassword = body.confirmPassword ?? '';
  const registrationKey = body.registrationKey ?? '';

  if (!email || !password || !confirmPassword || !registrationKey) {
    return NextResponse.json(
      { error: 'All fields are required.' },
      { status: 400 }
    );
  }
  if (!EMAIL_REGEX.test(email)) {
    return NextResponse.json(
      { error: 'Please enter a valid email address.' },
      { status: 400 }
    );
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
      { status: 400 }
    );
  }
  if (password !== confirmPassword) {
    return NextResponse.json(
      { error: 'Passwords do not match.' },
      { status: 400 }
    );
  }

  const expected = process.env.REGISTRATION_KEY;
  if (!expected) {
    return NextResponse.json(
      { error: 'Registration is currently disabled. Contact the administrator.' },
      { status: 503 }
    );
  }
  if (!timingSafeStringEqual(registrationKey, expected)) {
    return NextResponse.json(
      { error: 'Invalid registration key.' },
      { status: 403 }
    );
  }

  const passwordHash = await hashPassword(password);

  try {
    const result = await pool.query<{ id: string; email: string; role: string }>(
      `INSERT INTO users (email, password_hash, role)
       VALUES ($1, $2, 'admin')
       RETURNING id, email, role`,
      [email, passwordHash]
    );
    const user = result.rows[0];
    await createSession(user.id);
    return NextResponse.json({ user });
  } catch (err) {
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: string }).code === '23505'
    ) {
      return NextResponse.json(
        { error: 'An account with that email already exists.' },
        { status: 409 }
      );
    }
    throw err;
  }
}
