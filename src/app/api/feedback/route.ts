import { pool } from '@/db/index';
import { getOrCreateSessionId } from '@/lib/session';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Record (or clear) a visitor's 👍/👎 rating on a single assistant answer.
// Feedback is keyed to chat_messages.id and is only accepted for assistant
// messages that belong to a conversation in the caller's own session — a
// visitor can't rate someone else's conversation.
export async function POST(req: NextRequest) {
  const sessionId = await getOrCreateSessionId();

  let body: { messageId?: unknown; rating?: unknown; comment?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const messageId = Number(body.messageId);
  if (!Number.isInteger(messageId)) {
    return NextResponse.json({ error: 'messageId must be an integer' }, { status: 400 });
  }

  // rating null/empty clears the feedback (toggle off); otherwise 'up'/'down'.
  const rating = body.rating == null ? null : String(body.rating);
  if (rating !== null && rating !== 'up' && rating !== 'down') {
    return NextResponse.json({ error: "rating must be 'up', 'down', or null" }, { status: 400 });
  }
  const comment =
    typeof body.comment === 'string' ? body.comment.trim().slice(0, 2000) || null : null;

  const client = await pool.connect();
  try {
    // Ownership + role check in one query: the message must be an assistant
    // message in a conversation owned by this session.
    const owned = await client.query<{ id: number }>(
      `SELECT cm.id
         FROM chat_messages cm
         JOIN conversations c ON c.id = cm.conversation_id
        WHERE cm.id = $1 AND cm.role = 'assistant' AND c.session_id = $2
        LIMIT 1`,
      [messageId, sessionId]
    );
    if (owned.rows.length === 0) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    if (rating === null) {
      await client.query('DELETE FROM message_feedback WHERE message_id = $1', [messageId]);
      return NextResponse.json({ ok: true, rating: null });
    }

    // Upsert: re-rating an answer overwrites the previous rating/comment.
    await client.query(
      `INSERT INTO message_feedback (message_id, rating, comment)
            VALUES ($1, $2, $3)
       ON CONFLICT (message_id)
       DO UPDATE SET rating = EXCLUDED.rating,
                     comment = EXCLUDED.comment,
                     updated_at = NOW()`,
      [messageId, rating, comment]
    );
    return NextResponse.json({ ok: true, rating });
  } finally {
    client.release();
  }
}
