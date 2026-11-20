import { pool } from '@/db/index';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';

export const runtime = 'nodejs';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Read-only full transcript of one conversation for the admin viewer,
// including each assistant message's saved sources and its 👍/👎 rating +
// comment (if any).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!UUID_REGEX.test(id)) {
    return NextResponse.json({ error: 'invalid conversation id' }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    const conv = await client.query<{ id: string; title: string; created_at: string }>(
      'SELECT id, title, created_at FROM conversations WHERE id = $1',
      [id]
    );
    if (conv.rows.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }

    const rows = await client.query(
      `SELECT m.id, m.role, m.content, m.sources, m.created_at,
              mf.rating, mf.comment
         FROM chat_messages m
         LEFT JOIN message_feedback mf ON mf.message_id = m.id
        WHERE m.conversation_id = $1
        ORDER BY m.created_at ASC`,
      [id]
    );

    const messages = rows.rows.map((m: {
      id: number;
      role: string;
      content: string;
      sources: string | null;
      created_at: string;
      rating: string | null;
      comment: string | null;
    }) => {
      let sources: Array<{ url: string; title: string }> = [];
      if (m.sources) {
        try {
          sources = JSON.parse(m.sources);
        } catch { /* ignore malformed JSON */ }
      }
      return {
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.created_at,
        sources,
        feedback: m.rating ? { rating: m.rating, comment: m.comment } : null,
      };
    });

    return NextResponse.json({
      id: conv.rows[0].id,
      title: conv.rows[0].title,
      createdAt: conv.rows[0].created_at,
      messages,
    });
  } finally {
    client.release();
  }
}
