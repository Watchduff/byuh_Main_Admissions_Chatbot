import { pool } from '@/db/index';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';

export const runtime = 'nodejs';

// Read-only list of visitor conversations for the admin conversation viewer.
// Each row carries a message count, last-activity timestamp, and the 👍/👎
// tallies so staff can spot the conversations worth reading. Empty
// conversations (created but never messaged) are hidden.
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const q = req.nextUrl.searchParams.get('q')?.trim();

  // Pagination: 1-based page index with a bounded page size so the list stays
  // responsive even as the conversation history grows.
  const DEFAULT_PAGE_SIZE = 10;
  const MAX_PAGE_SIZE = 10;
  const page = Math.max(1, Number(req.nextUrl.searchParams.get('page')) || 1);
  const pageSizeRaw = Number(req.nextUrl.searchParams.get('pageSize')) || DEFAULT_PAGE_SIZE;
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, pageSizeRaw));
  const offset = (page - 1) * pageSize;

  const client = await pool.connect();
  try {
    const filterParams: string[] = [];
    let where = '';
    if (q) {
      filterParams.push(`%${q}%`);
      where = 'WHERE c.title ILIKE $1';
    }

    // Total number of non-empty conversations matching the current filter,
    // used to drive the page count on the client.
    const countResult = await client.query(
      `SELECT COUNT(*) AS total
         FROM (
           SELECT c.id
             FROM conversations c
             JOIN chat_messages m ON m.conversation_id = c.id
             ${where}
             GROUP BY c.id
         ) AS sub`,
      filterParams
    );
    const total = Number(countResult.rows[0]?.total ?? 0);

    const result = await client.query(
      `SELECT c.id, c.title, c.created_at,
              COUNT(m.id)                              AS message_count,
              MAX(m.created_at)                        AS last_message_at,
              COUNT(*) FILTER (WHERE mf.rating = 'up')   AS thumbs_up,
              COUNT(*) FILTER (WHERE mf.rating = 'down') AS thumbs_down
         FROM conversations c
         JOIN chat_messages m ON m.conversation_id = c.id
         LEFT JOIN message_feedback mf ON mf.message_id = m.id
         ${where}
         GROUP BY c.id
         ORDER BY MAX(m.created_at) DESC
         LIMIT $${filterParams.length + 1} OFFSET $${filterParams.length + 2}`,
      [...filterParams, pageSize, offset]
    );

    const conversations = result.rows.map((r: {
      id: string;
      title: string;
      created_at: string;
      message_count: string;
      last_message_at: string;
      thumbs_up: string;
      thumbs_down: string;
    }) => ({
      id: r.id,
      title: r.title,
      createdAt: r.created_at,
      lastMessageAt: r.last_message_at,
      messageCount: Number(r.message_count),
      thumbsUp: Number(r.thumbs_up),
      thumbsDown: Number(r.thumbs_down),
    }));

    return NextResponse.json({
      conversations,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } finally {
    client.release();
  }
}
