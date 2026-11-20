import { pool } from '@/db/index';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { sendEmail } from '@/lib/email';

export const runtime = 'nodejs';

const NOTIFY_EMAIL = process.env.SUPPORT_TICKET_NOTIFY_EMAIL || 'apps@innovatorsdna.com';

// List internal admin support tickets (feature requests / bug reports),
// optionally filtered by status ('open' | 'closed').
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const status = req.nextUrl.searchParams.get('status');

  const params: string[] = [];
  let where = '';
  if (status === 'open' || status === 'closed') {
    params.push(status);
    where = 'WHERE status = $1';
  }

  const result = await pool.query(
    `SELECT id, type, title, description, status, created_by, closed_by, closed_at, created_at
       FROM support_tickets
       ${where}
       ORDER BY created_at DESC
       LIMIT 200`,
    params
  );

  const payload = result.rows.map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    description: r.description,
    status: r.status,
    createdBy: r.created_by,
    closedBy: r.closed_by,
    closedAt: r.closed_at,
    createdAt: r.created_at,
  }));

  return NextResponse.json(payload);
}

// File a new ticket. Any signed-in admin may create one; creation always
// emails the apps team so nothing waits on someone polling the dashboard.
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json()) as { type?: string; title?: string; description?: string };
  const type = body.type;
  const title = body.title?.trim();
  const description = body.description?.trim();

  if (type !== 'bug' && type !== 'feature') {
    return NextResponse.json({ error: 'type must be "bug" or "feature"' }, { status: 400 });
  }
  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }
  if (!description) {
    return NextResponse.json({ error: 'description is required' }, { status: 400 });
  }

  const result = await pool.query(
    `INSERT INTO support_tickets (type, title, description, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING id, type, title, description, status, created_by, closed_by, closed_at, created_at`,
    [type, title, description, auth.email]
  );
  const row = result.rows[0];

  await sendEmail({
    to: NOTIFY_EMAIL,
    subject: `[BYUH Support Ticket] ${title}`,
    text: `A new ${type === 'bug' ? 'bug report' : 'feature request'} was filed by ${auth.email}.\n\n${title}\n\n${description}`,
  });

  return NextResponse.json(
    {
      id: row.id,
      type: row.type,
      title: row.title,
      description: row.description,
      status: row.status,
      createdBy: row.created_by,
      closedBy: row.closed_by,
      closedAt: row.closed_at,
      createdAt: row.created_at,
    },
    { status: 201 }
  );
}
