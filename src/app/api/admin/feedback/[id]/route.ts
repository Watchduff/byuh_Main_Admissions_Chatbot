import { pool } from '@/db/index';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';

export const runtime = 'nodejs';

// Delete one 👍/👎 rating (e.g. a test rating left while trying the bot). Only
// the feedback row is removed — the conversation and its messages stay.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id: idRaw } = await params;
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'invalid feedback id' }, { status: 400 });
  }

  const result = await pool.query('DELETE FROM message_feedback WHERE id = $1', [id]);
  if (result.rowCount === 0) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
