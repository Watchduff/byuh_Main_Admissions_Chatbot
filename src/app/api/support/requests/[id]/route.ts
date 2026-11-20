import { pool } from '@/db/index';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';

export const runtime = 'nodejs';

// Answer a pending human-help request. Marks the request as answered and
// appends an assistant message to the original conversation so the student
// sees the support team member's reply the next time they open the chat.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = (await req.json()) as { answer?: string; answeredBy?: string };
  const answer = body.answer?.trim();
  const answeredBy = body.answeredBy?.trim() || null;

  if (!answer) {
    return NextResponse.json({ error: 'answer is required' }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const updated = await client.query(
      `UPDATE human_help_requests
          SET status = 'answered',
              answer = $1,
              answered_by = $2,
              answered_at = NOW()
        WHERE id = $3 AND status = 'pending'
      RETURNING conversation_id`,
      [answer, answeredBy, id]
    );

    if (updated.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { error: 'Request not found or already answered' },
        { status: 404 }
      );
    }

    const conversationId = updated.rows[0].conversation_id as string;
    const signature = answeredBy ? `A BYU–Hawaii support team member (${answeredBy}) replied:` : 'A BYU–Hawaii support team member replied:';
    const messageContent = `${signature}\n\n${answer}`;

    await client.query(
      'INSERT INTO chat_messages (conversation_id, role, content) VALUES ($1, $2, $3)',
      [conversationId, 'assistant', messageContent]
    );

    await client.query('COMMIT');
    return NextResponse.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
