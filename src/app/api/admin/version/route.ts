import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// When this server process started: on the VM, effectively when the last
// deploy (or restart) went live.
const startedAt = new Date().toISOString();

type Commit = { sha: string; author: string; date: string | null; subject: string };

export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  let info: { builtAt: string | null; commits: Commit[] } = { builtAt: null, commits: [] };
  try {
    info = JSON.parse(process.env.BUILD_INFO ?? '');
  } catch {
    // Built without version info (e.g. an old build).
  }

  return NextResponse.json({
    host: process.env.VERCEL ? 'Vercel' : 'BYU–Hawaii VM',
    builtAt: info.builtAt,
    startedAt,
    commits: info.commits,
  });
}
