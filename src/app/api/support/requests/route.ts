import { pool } from '@/db/index';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';

export const runtime = 'nodejs';

// List human-help requests for the support dashboard, optionally filtered
// by status ('pending' | 'answered'). Each request is returned with a small
// transcript of the conversation so the support team member has context
// without having to click through to a separate page.
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const status = req.nextUrl.searchParams.get('status');

  const client = await pool.connect();
  try {
    const params: string[] = [];
    let where = '';
    if (status === 'pending' || status === 'answered') {
      params.push(status);
      where = 'WHERE r.status = $1';
    }

    const result = await client.query(
      `SELECT r.id, r.conversation_id, r.user_question, r.reason, r.status,
              r.answer, r.answered_by, r.answered_at, r.created_at,
              c.title AS conversation_title
         FROM human_help_requests r
         JOIN conversations c ON c.id = r.conversation_id
         ${where}
         ORDER BY r.created_at DESC
         LIMIT 100`,
      params
    );

    if (result.rows.length === 0) {
      return NextResponse.json([]);
    }

    const conversationIds = Array.from(
      new Set(result.rows.map((r: { conversation_id: string }) => r.conversation_id))
    );
    const messagesResult = await client.query(
      `SELECT conversation_id, role, content, created_at
         FROM chat_messages
         WHERE conversation_id = ANY($1::uuid[])
         ORDER BY created_at ASC`,
      [conversationIds]
    );
    const messagesByConv = new Map<string, Array<{ role: string; content: string; created_at: string }>>();
    for (const row of messagesResult.rows as Array<{
      conversation_id: string;
      role: string;
      content: string;
      created_at: string;
    }>) {
      const list = messagesByConv.get(row.conversation_id) ?? [];
      list.push({ role: row.role, content: row.content, created_at: row.created_at });
      messagesByConv.set(row.conversation_id, list);
    }

    const payload = result.rows.map((r: {
      id: string;
      conversation_id: string;
      user_question: string;
      reason: string | null;
      status: string;
      answer: string | null;
      answered_by: string | null;
      answered_at: string | null;
      created_at: string;
      conversation_title: string;
    }) => ({
      id: r.id,
      conversationId: r.conversation_id,
      conversationTitle: r.conversation_title,
      userQuestion: r.user_question,
      reason: r.reason,
      status: r.status,
      answer: r.answer,
      answeredBy: r.answered_by,
      answeredAt: r.answered_at,
      createdAt: r.created_at,
      transcript: messagesByConv.get(r.conversation_id) ?? [],
    }));

    return NextResponse.json(payload);
  } finally {
    client.release();
  }
}
