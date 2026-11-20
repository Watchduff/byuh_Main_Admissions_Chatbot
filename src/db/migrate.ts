import { Pool } from 'pg';
import { config } from 'dotenv';
config({ path: '.env' });

async function migrate() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  const client = await pool.connect();

  try {
    console.log('Running migrations...');

    await client.query('CREATE EXTENSION IF NOT EXISTS vector;');
    console.log('✓ pgvector extension ready');

    await client.query(`
      CREATE TABLE IF NOT EXISTS byuh_chunks (
        id SERIAL PRIMARY KEY,
        url TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        source TEXT NOT NULL DEFAULT 'admissions',
        embedding vector(1536),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✓ byuh_chunks table ready');

    // Backfill for existing deployments that predate the `source` column.
    await client.query(`
      ALTER TABLE byuh_chunks ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'admissions';
    `);
    console.log('✓ byuh_chunks.source column ready');

    await client.query(`
      CREATE INDEX IF NOT EXISTS byuh_chunks_source_idx
      ON byuh_chunks (source);
    `);
    console.log('✓ byuh_chunks source index ready');

    await client.query(`
      CREATE INDEX IF NOT EXISTS byuh_chunks_embedding_idx
      ON byuh_chunks USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100);
    `);
    console.log('✓ ivfflat index ready');

    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✓ sessions table ready');

    await client.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID NOT NULL REFERENCES sessions(id),
        title TEXT NOT NULL DEFAULT 'New conversation',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✓ conversations table ready');

    // Drop old chat_messages if it has session_id column (migration from old schema)
    const colCheck = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'chat_messages' AND column_name = 'session_id'
    `);
    if (colCheck.rows.length > 0) {
      await client.query('DROP TABLE IF EXISTS chat_messages;');
      console.log('✓ dropped old chat_messages table (had session_id)');
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id SERIAL PRIMARY KEY,
        conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✓ chat_messages table ready');

    await client.query(`
      CREATE INDEX IF NOT EXISTS chat_messages_conversation_idx
      ON chat_messages (conversation_id, created_at);
    `);
    console.log('✓ chat_messages index ready');

    await client.query(`
      ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS sources TEXT;
    `);
    console.log('✓ chat_messages sources column ready');

    await client.query(`
      CREATE TABLE IF NOT EXISTS message_feedback (
        id SERIAL PRIMARY KEY,
        message_id INTEGER NOT NULL UNIQUE REFERENCES chat_messages(id) ON DELETE CASCADE,
        rating TEXT NOT NULL CHECK (rating IN ('up', 'down')),
        comment TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✓ message_feedback table ready');

    // Supports the launch-monitoring view's "thumbs-down rate" / recent-comment
    // queries without scanning the whole table.
    await client.query(`
      CREATE INDEX IF NOT EXISTS message_feedback_rating_idx
      ON message_feedback (rating, created_at DESC);
    `);
    console.log('✓ message_feedback rating index ready');

    await client.query(`
      CREATE TABLE IF NOT EXISTS disclaimer_acceptances (
        id SERIAL PRIMARY KEY,
        session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        version TEXT NOT NULL,
        accepted_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✓ disclaimer_acceptances table ready');

    // Supports per-session "already accepted?" lookups and per-version
    // acceptance reporting for the launch compliance record.
    await client.query(`
      CREATE INDEX IF NOT EXISTS disclaimer_acceptances_session_idx
      ON disclaimer_acceptances (session_id, version);
    `);
    console.log('✓ disclaimer_acceptances session index ready');

    await client.query(`
      CREATE TABLE IF NOT EXISTS human_help_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        user_question TEXT NOT NULL,
        reason TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        answer TEXT,
        answered_by TEXT,
        answered_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✓ human_help_requests table ready');

    await client.query(`
      CREATE INDEX IF NOT EXISTS human_help_requests_status_idx
      ON human_help_requests (status, created_at DESC);
    `);
    console.log('✓ human_help_requests status index ready');

    // Drop legacy essay-coach tables. CASCADE removes the dependent
    // essay_revisions and essay_messages along with essay_drafts.
    await client.query('DROP TABLE IF EXISTS essay_messages, essay_revisions, essay_drafts CASCADE;');
    console.log('✓ legacy essay tables dropped');

    await client.query(`
      CREATE TABLE IF NOT EXISTS country_criteria (
        id SERIAL PRIMARY KEY,
        region TEXT,
        country TEXT NOT NULL UNIQUE,
        current_academic_criteria TEXT,
        english_test_required TEXT,
        optional_to_submit TEXT,
        expired_country_criteria TEXT,
        not_accepted TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✓ country_criteria table ready');

    // Case-insensitive lookup index. The seeder writes the original casing,
    // but the chat tool matches user input via LOWER(country).
    await client.query(`
      CREATE INDEX IF NOT EXISTS country_criteria_country_lower_idx
      ON country_criteria (LOWER(country));
    `);
    console.log('✓ country_criteria lookup index ready');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'admin',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✓ users table ready');

    await client.query(`
      CREATE INDEX IF NOT EXISTS users_email_lower_idx
      ON users (LOWER(email));
    `);
    console.log('✓ users email index ready');

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✓ user_sessions table ready');

    await client.query(`
      CREATE INDEX IF NOT EXISTS user_sessions_user_idx
      ON user_sessions (user_id);
    `);
    console.log('✓ user_sessions user index ready');

    await client.query(`
      CREATE TABLE IF NOT EXISTS scrape_runs (
        id SERIAL PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'running',
        trigger TEXT NOT NULL DEFAULT 'manual',
        triggered_by TEXT,
        sites_scraped INTEGER NOT NULL DEFAULT 0,
        pages_ingested INTEGER NOT NULL DEFAULT 0,
        chunks_written INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        started_at TIMESTAMPTZ DEFAULT NOW(),
        finished_at TIMESTAMPTZ,
        duration_ms INTEGER
      );
    `);
    console.log('✓ scrape_runs table ready');

    // Supports the "recent runs" history feed (most-recent-first).
    await client.query(`
      CREATE INDEX IF NOT EXISTS scrape_runs_started_idx
      ON scrape_runs (started_at DESC);
    `);
    console.log('✓ scrape_runs started index ready');

    // One scrape at a time: overlapping runs delete each other's pages.
    // Close out dead 'running' rows first so the unique index can be built.
    await client.query(`ALTER TABLE scrape_runs ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMPTZ;`);
    await client.query(`
      UPDATE scrape_runs
         SET status = 'error',
             error = COALESCE(error, 'Abandoned: the run stopped responding before it finished.'),
             finished_at = NOW()
       WHERE status = 'running'
         AND COALESCE(heartbeat_at, started_at) < NOW() - INTERVAL '10 minutes';
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS scrape_runs_one_running
      ON scrape_runs ((true)) WHERE status = 'running';
    `);
    console.log('✓ scrape_runs single-run lock ready');

    // Queue/state for the batched scraper. Also created on demand by
    // ensureStateTable() in src/lib/ingest.ts.
    await client.query(`
      CREATE TABLE IF NOT EXISTS scrape_site_state (
        source TEXT PRIMARY KEY,
        last_started_at TIMESTAMPTZ,
        last_finished_at TIMESTAMPTZ,
        last_status TEXT,
        last_pages INTEGER NOT NULL DEFAULT 0,
        last_chunks INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        requested_at TIMESTAMPTZ
      );
    `);
    // Resumable crawl passes (see crawlSite in src/lib/scraper.ts).
    await client.query(`
      ALTER TABLE scrape_site_state
        ADD COLUMN IF NOT EXISTS crawl_started_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS crawl_state JSONB,
        ADD COLUMN IF NOT EXISTS crawl_pages INTEGER NOT NULL DEFAULT 0;
    `);
    console.log('✓ scrape_site_state table ready');

    // Indexes supporting the optional pilot usage limits (src/lib/rate-limit.ts).
    // Harmless when the feature is disabled; they speed up the per-session and
    // active-user window counts when USAGE_LIMITS_ENABLED=true.
    await client.query(`
      CREATE INDEX IF NOT EXISTS conversations_session_idx
      ON conversations (session_id);
    `);
    console.log('✓ conversations session index ready');

    await client.query(`
      CREATE INDEX IF NOT EXISTS chat_messages_created_at_idx
      ON chat_messages (created_at);
    `);
    console.log('✓ chat_messages created_at index ready');

    await client.query(`
      CREATE TABLE IF NOT EXISTS support_tickets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        type TEXT NOT NULL CHECK (type IN ('bug', 'feature')),
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
        created_by TEXT NOT NULL,
        closed_by TEXT,
        closed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✓ support_tickets table ready');

    await client.query(`
      CREATE INDEX IF NOT EXISTS support_tickets_status_idx
      ON support_tickets (status, created_at DESC);
    `);
    console.log('✓ support_tickets status index ready');

    // Admin-controlled runtime switches (see src/lib/settings.ts). One row per
    // key. `support_enabled` is seeded to 'false' so the human-in-the-loop
    // escalation stays off until an admin turns it on from /support.
    await client.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_by TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await client.query(`
      INSERT INTO app_settings (key, value) VALUES ('support_enabled', 'false')
      ON CONFLICT (key) DO NOTHING;
    `);
    console.log('✓ app_settings table ready');

    // One-time password-reset tokens. Only the SHA-256 of the token is stored;
    // the raw token lives solely in the emailed link.
    await client.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✓ password_reset_tokens table ready');

    console.log('Migrations complete!');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
