import { pool } from '@/db/index';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';

export const runtime = 'nodejs';

// Close a ticket. Any admin can close any ticket — there's no assignment or
// ownership model, per how the team wants this run.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { status?: string };
  if (body.status !== 'closed') {
    return NextResponse.json({ error: 'only status "closed" is supported' }, { status: 400 });
  }

  const result = await pool.query(
    `UPDATE support_tickets
        SET status = 'closed',
            closed_by = $1,
            closed_at = NOW()
      WHERE id = $2 AND status = 'open'
    RETURNING id, type, title, description, status, created_by, closed_by, closed_at, created_at`,
    [auth.email, id]
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ error: 'Ticket not found or already closed' }, { status: 404 });
  }

  const row = result.rows[0];
  return NextResponse.json({
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description,
    status: row.status,
    createdBy: row.created_by,
    closedBy: row.closed_by,
    closedAt: row.closed_at,
    createdAt: row.created_at,
  });
}
