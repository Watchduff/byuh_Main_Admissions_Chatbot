import { NextResponse } from 'next/server';
import { runIngestBatch } from '@/lib/ingest';

export const runtime = 'nodejs';
// One batch is budgeted at 270s (BATCH_BUDGET_MS) so it finishes inside this.
export const maxDuration = 300;
// Never cache cron responses.
export const dynamic = 'force-dynamic';

/**
 * Nightly knowledge-base refresh, one batch per call.
 *
 * The VM's crontab hits this once a day (see `scripts/vm/scrape-cron.sh`;
 * Vercel runs no crons). Each call scrapes as
 * many due subdomains as fit in one function invocation — usually one large
 * site or a handful of small ones — and the next call carries on from there,
 * so the full list is covered about every two weeks. A whole re-scrape takes
 * about an hour, far beyond the 300s function limit, which is why it is split
 * up. (It used to run from GitHub Actions instead, but BYU–Hawaii's servers
 * answer GitHub's runners with 403.)
 *
 * With `?queued=1` the call only works on subdomains an admin queued from the
 * /scraping page and does nothing otherwise. That variant runs every 30 minutes
 * (not more often: each call queries Neon and would keep it from
 * suspending), so a manual refresh keeps going after the admin closes the
 * page.
 *
 * Callers must present `Authorization: Bearer <CRON_SECRET>`. The cron script
 * reads it from the app's .env. Without CRON_SECRET the endpoint is open.
 */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const queuedOnly = new URL(req.url).searchParams.get('queued') === '1';
    const result = await runIngestBatch({ trigger: 'cron', requestedOnly: queuedOnly });
    if (result.error) {
      console.error('Scheduled scrape batch failed:', result.error);
      return NextResponse.json({ ok: false, ...result }, { status: 500 });
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('Scheduled scrape batch failed:', err);
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
