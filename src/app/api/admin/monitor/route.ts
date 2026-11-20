import { pool } from '@/db/index';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';

export const runtime = 'nodejs';

// Lightweight launch-monitoring metrics for admins (ROADMAP L6 / B2 trimmed).
// Aggregates the data already captured by the chat, feedback, and escalation
// flows into the signals the launch needs on day one: volume, escalation rate,
// thumbs-down rate, a short daily trend, and the two actionable feeds
// (recent 👎 answers and recent escalations). Read-only.
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  // Allowed windows in days; 0 = all time. Anything else falls back to 7.
  const daysRaw = Number(req.nextUrl.searchParams.get('days'));
  const days = [1, 7, 30, 0].includes(daysRaw) ? daysRaw : 7;
  const allTime = days === 0;

  // Integer-only interval, inlined safely (never user-controlled text).
  const inWindow = (col: string) =>
    allTime ? 'TRUE' : `${col} >= NOW() - INTERVAL '${days} days'`;

  const client = await pool.connect();
  try {
    const [volume, escal, fb, daily, downs, escalations] = await Promise.all([
      client.query(
        `SELECT
           COUNT(DISTINCT cm.conversation_id)                  AS conversations,
           COUNT(*) FILTER (WHERE cm.role = 'user')            AS user_messages,
           COUNT(*) FILTER (WHERE cm.role = 'assistant')       AS assistant_messages
         FROM chat_messages cm
         WHERE ${inWindow('cm.created_at')}`
      ),
      client.query(
        `SELECT
           COUNT(*)                                   AS total,
           COUNT(*) FILTER (WHERE status = 'pending') AS pending
         FROM human_help_requests
         WHERE ${inWindow('created_at')}`
      ),
      client.query(
        `SELECT
           COUNT(*) FILTER (WHERE rating = 'up')   AS up,
           COUNT(*) FILTER (WHERE rating = 'down') AS down
         FROM message_feedback
         WHERE ${inWindow('created_at')}`
      ),
      // Daily trend: one bucket per day, capped at 30 days back.
      client.query(
        `SELECT to_char(d, 'YYYY-MM-DD') AS day,
                COUNT(DISTINCT cm.conversation_id)          AS conversations,
                COUNT(cm.id) FILTER (WHERE cm.role='user')  AS questions
           FROM generate_series(
                  CURRENT_DATE - INTERVAL '${allTime ? 29 : Math.min(days, 30) - 1} days',
                  CURRENT_DATE,
                  INTERVAL '1 day') AS d
           LEFT JOIN chat_messages cm
             ON cm.created_at >= d AND cm.created_at < d + INTERVAL '1 day'
          GROUP BY d
          ORDER BY d`
      ),
      // Recent 👎 answers with the question that prompted them — the content-gap
      // worklist for the improvement process.
      client.query(
        `SELECT mf.id, mf.comment, mf.created_at,
                a.conversation_id,
                a.content AS answer,
                (SELECT u.content FROM chat_messages u
                   WHERE u.conversation_id = a.conversation_id
                     AND u.role = 'user' AND u.id < a.id
                   ORDER BY u.id DESC LIMIT 1) AS question
           FROM message_feedback mf
           JOIN chat_messages a ON a.id = mf.message_id
          WHERE mf.rating = 'down' AND ${inWindow('mf.created_at')}
          ORDER BY mf.created_at DESC
          LIMIT 8`
      ),
      client.query(
        `SELECT id, conversation_id, user_question, reason, status, created_at
           FROM human_help_requests
          WHERE ${inWindow('created_at')}
          ORDER BY created_at DESC
          LIMIT 8`
      ),
    ]);

    const conversations = Number(volume.rows[0]?.conversations ?? 0);
    const userMessages = Number(volume.rows[0]?.user_messages ?? 0);
    const assistantMessages = Number(volume.rows[0]?.assistant_messages ?? 0);
    const escalationsTotal = Number(escal.rows[0]?.total ?? 0);
    const escalationsPending = Number(escal.rows[0]?.pending ?? 0);
    const up = Number(fb.rows[0]?.up ?? 0);
    const down = Number(fb.rows[0]?.down ?? 0);
    const rated = up + down;

    const excerpt = (s: string | null, n: number) =>
      !s ? null : s.length > n ? s.slice(0, n).trimEnd() + '…' : s;

    return NextResponse.json({
      days,
      metrics: {
        conversations,
        userMessages,
        assistantMessages,
        escalations: escalationsTotal,
        escalationsPending,
        // Share of conversations that reached a human. Null when there's no
        // volume yet so the UI can show “—” instead of a misleading 0%.
        escalationRate: conversations > 0 ? escalationsTotal / conversations : null,
        thumbsUp: up,
        thumbsDown: down,
        rated,
        // Share of rated answers that were 👎.
        thumbsDownRate: rated > 0 ? down / rated : null,
        // Share of assistant answers that received any rating.
        feedbackCoverage: assistantMessages > 0 ? rated / assistantMessages : null,
      },
      daily: daily.rows.map((r: { day: string; conversations: string; questions: string }) => ({
        day: r.day,
        conversations: Number(r.conversations),
        questions: Number(r.questions),
      })),
      recentThumbsDown: downs.rows.map(
        (r: {
          id: number;
          conversation_id: string;
          question: string | null;
          answer: string | null;
          comment: string | null;
          created_at: string;
        }) => ({
          id: r.id,
          conversationId: r.conversation_id,
          question: excerpt(r.question, 160),
          answer: excerpt(r.answer, 200),
          comment: r.comment,
          createdAt: r.created_at,
        })
      ),
      recentEscalations: escalations.rows.map(
        (r: {
          id: string;
          conversation_id: string;
          user_question: string;
          reason: string | null;
          status: string;
          created_at: string;
        }) => ({
          id: r.id,
          conversationId: r.conversation_id,
          question: excerpt(r.user_question, 160),
          reason: r.reason,
          status: r.status,
          createdAt: r.created_at,
        })
      ),
    });
  } finally {
    client.release();
  }
}
