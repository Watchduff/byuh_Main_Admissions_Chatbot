import { pool } from '@/db/index';
import { getOrCreateSessionId } from '@/lib/session';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Delete a conversation (and its messages via CASCADE)
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessionId = await getOrCreateSessionId();
  const { id } = await params;

  const client = await pool.connect();
  try {
    await client.query(
      'DELETE FROM conversations WHERE id = $1 AND session_id = $2',
      [id, sessionId]
    );
    return NextResponse.json({ ok: true });
  } finally {
    client.release();
  }
}
