import { pool } from '../db/index';
import { runIngestion, ScrapeBusyError } from '../lib/ingest';

// Optional: `npm run ingest -- --only=health,admissions` restricts the crawl
// to specific sources. Useful when you add a new subdomain and don't want to
// re-scrape every site.
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const sourceFilter = onlyArg
  ? onlyArg
      .slice('--only='.length)
      // Commas or spaces: PowerShell turns `a,b,c` into "a b c".
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
  : undefined;

runIngestion({ sourceFilter, trigger: 'cli' })
  .then(async () => {
    await pool.end();
  })
  .catch(async (err) => {
    if (err instanceof ScrapeBusyError) console.error(err.message);
    else console.error('Ingestion failed:', err);
    await pool.end().catch(() => {});
    process.exit(1);
  });
