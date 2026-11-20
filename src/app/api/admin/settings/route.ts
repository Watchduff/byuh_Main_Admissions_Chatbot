import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { isSupportEnabled, setSupportEnabled } from '@/lib/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Admin runtime settings. Currently just the human-in-the-loop support switch,
// toggled from the /support page.
export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  return NextResponse.json(
    { supportEnabled: await isSupportEnabled() },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function PATCH(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json().catch(() => ({}))) as { supportEnabled?: unknown };
  if (typeof body.supportEnabled !== 'boolean') {
    return NextResponse.json({ error: 'supportEnabled must be a boolean' }, { status: 400 });
  }

  await setSupportEnabled(body.supportEnabled, auth.email);
  return NextResponse.json({ supportEnabled: body.supportEnabled });
}
