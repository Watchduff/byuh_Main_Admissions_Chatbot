import { pool } from '@/db/index';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Lightweight count of pending human-help requests. Polled by the admin menu
// to drive the unread-notification dot on the Support item.
export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const client = await pool.connect();
  try {
    const result = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM human_help_requests
         WHERE status = 'pending'`
    );
    const count = Number(result.rows[0]?.count ?? 0);
    return NextResponse.json(
      { count },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } finally {
    client.release();
  }
}
