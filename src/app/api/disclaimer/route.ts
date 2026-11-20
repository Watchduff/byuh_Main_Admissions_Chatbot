import { pool } from '@/db/index';
import { getOrCreateSessionId } from '@/lib/session';
import { DISCLAIMER_VERSION } from '@/lib/disclaimer';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Record a public visitor's acceptance of the launch legal disclaimer
// (ROADMAP L2 / A1). Writes one audit row per acceptance, keyed to the visitor
// session, with the accepted version and a server timestamp. Only the current
// version is accepted so stale/forged versions can't be recorded.
export async function POST(req: NextRequest) {
  let body: { version?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (body.version !== DISCLAIMER_VERSION) {
    return NextResponse.json({ error: 'Unknown disclaimer version' }, { status: 400 });
  }

  const sessionId = await getOrCreateSessionId();

  await pool.query(
    'INSERT INTO disclaimer_acceptances (session_id, version) VALUES ($1, $2)',
    [sessionId, DISCLAIMER_VERSION]
  );

  return NextResponse.json({ ok: true, version: DISCLAIMER_VERSION });
}
