import { pool } from '@/db/index';
import { getOrCreateSessionId } from '@/lib/session';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  await getOrCreateSessionId(); // ensure session cookie exists
  const conversationId = req.nextUrl.searchParams.get('conversationId');
  if (!conversationId) {
    return NextResponse.json({ messages: [], pendingSupport: false });
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT id, role, content, sources FROM chat_messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [conversationId]
    );

    // Existing feedback for this conversation's assistant messages, so the UI
    // can render the 👍/👎 control in its already-rated state.
    const feedbackRows = await client.query<{ message_id: number; rating: string }>(
      `SELECT mf.message_id, mf.rating
         FROM message_feedback mf
         JOIN chat_messages cm ON cm.id = mf.message_id
        WHERE cm.conversation_id = $1`,
      [conversationId]
    );
    const feedback: Record<string, string> = {};
    for (const row of feedbackRows.rows) {
      feedback[String(row.message_id)] = row.rating;
    }

    const messages = result.rows.map((row: { id: number; role: string; content: string; sources: string | null }) => {
      const parts: Array<Record<string, unknown>> = [{ type: 'text', text: row.content }];

      // Add source-url parts for assistant messages that have saved sources
      if (row.role === 'assistant' && row.sources) {
        try {
          const sources: Array<{ url: string; title: string }> = JSON.parse(row.sources);
          for (const source of sources) {
            parts.push({
              type: 'source-url',
              sourceId: source.url,
              url: source.url,
              title: source.title,
            });
          }
        } catch { /* ignore invalid JSON */ }
      }

      // The id is the real chat_messages.id (as a string) so the feedback
      // control can attach a rating to a historical message directly.
      return { id: String(row.id), role: row.role, parts };
    });

    // Whether this conversation has an outstanding human-help request. The
    // client uses this to gate its 15s polling loop: it only polls while a
    // support team member's reply is actually expected. Without this gate,
    // every open chat tab keeps the Neon compute permanently awake.
    const pending = await client.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM human_help_requests
          WHERE conversation_id = $1 AND status = 'pending'
       ) AS exists`,
      [conversationId]
    );
    const pendingSupport = pending.rows[0]?.exists ?? false;

    return NextResponse.json({ messages, pendingSupport, feedback });
  } finally {
    client.release();
  }
}
