import { customType, integer, jsonb, serial, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { pgTable } from 'drizzle-orm/pg-core';

const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector(1536)';
  },
  fromDriver(value: string): number[] {
    return value.slice(1, -1).split(',').map(Number);
  },
  toDriver(value: number[]): string {
    return '[' + value.join(',') + ']';
  },
});

export const byuhChunks = pgTable('byuh_chunks', {
  id: serial('id').primaryKey(),
  url: text('url').notNull(),
  title: text('title').notNull().default(''),
  content: text('content').notNull(),
  chunkIndex: integer('chunk_index').notNull(),
  // Subdomain this chunk was scraped from, e.g. 'admissions', 'housing'.
  // Used by the chat route to boost retrieval for the preferred source.
  source: text('source').notNull().default('admissions'),
  embedding: vector('embedding'),
  createdAt: timestamp('created_at').defaultNow(),
});

// One row per ingestion run (scrape → chunk → embed → save to byuh_chunks).
// Written by `runIngestion` regardless of trigger, so the admin "Data &
// scraping" page can show a history of when the knowledge base was last
// refreshed and whether it succeeded. `trigger` distinguishes the nightly
// VM cron batch ('cron'), the manual admin button ('manual'), and the CLI
// `npm run ingest` ('cli'). Cron and manual runs are batches of a few
// subdomains each; a CLI run covers every subdomain.
export const scrapeRuns = pgTable('scrape_runs', {
  id: serial('id').primaryKey(),
  // 'running' while in flight, then 'success' or 'error'.
  status: text('status').notNull().default('running'),
  // 'cron' | 'manual' | 'cli'.
  trigger: text('trigger').notNull().default('manual'),
  // Admin email for manual runs; null for cron/cli.
  triggeredBy: text('triggered_by'),
  sitesScraped: integer('sites_scraped').notNull().default(0),
  pagesIngested: integer('pages_ingested').notNull().default(0),
  chunksWritten: integer('chunks_written').notNull().default(0),
  // Populated only when status = 'error'.
  error: text('error'),
  startedAt: timestamp('started_at').defaultNow(),
  // Bumped every minute while the run is alive; a stale beat means it died.
  heartbeatAt: timestamp('heartbeat_at'),
  finishedAt: timestamp('finished_at'),
  durationMs: integer('duration_ms'),
});

// One row per configured subdomain (`SITE_CONFIGS[].source`), tracking when it
// was last scraped and how that went. The batched scraper (see
// `runIngestBatch` in src/lib/ingest.ts) uses it as its queue: the least
// recently attempted subdomain goes next, and `requested_at` marks sites an
// admin asked to refresh right away.
export const scrapeSiteState = pgTable('scrape_site_state', {
  source: text('source').primaryKey(),
  lastStartedAt: timestamp('last_started_at', { withTimezone: true }),
  lastFinishedAt: timestamp('last_finished_at', { withTimezone: true }),
  // 'running' | 'success' | 'partial' | 'empty' | 'error'.
  lastStatus: text('last_status'),
  lastPages: integer('last_pages').notNull().default(0),
  lastChunks: integer('last_chunks').notNull().default(0),
  lastError: text('last_error'),
  requestedAt: timestamp('requested_at', { withTimezone: true }),
  // The crawl pass in progress, if any. A pass that runs out of time is
  // saved here and resumed by the next batch. Pages saved during the pass have
  // byuh_chunks.created_at >= crawl_started_at (both set by the database),
  // which is how stale pages are found when the pass completes.
  crawlStartedAt: timestamp('crawl_started_at', { withTimezone: true }),
  crawlState: jsonb('crawl_state').$type<{ queue: string[]; visited: string[]; kept: string[] }>(),
  crawlPages: integer('crawl_pages').notNull().default(0),
});

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id),
  title: text('title').notNull().default('New conversation'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const chatMessages = pgTable('chat_messages', {
  id: serial('id').primaryKey(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Per-answer thumbs-up/down feedback on assistant messages. One row per
// message (latest rating wins, via upsert on the unique message_id). Feeds the
// content-improvement process and the lightweight launch-monitoring view.
export const messageFeedback = pgTable('message_feedback', {
  id: serial('id').primaryKey(),
  messageId: integer('message_id')
    .notNull()
    .unique()
    .references(() => chatMessages.id, { onDelete: 'cascade' }),
  // 'up' or 'down'.
  rating: text('rating').notNull(),
  comment: text('comment'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Audit record of a public visitor accepting the launch legal disclaimer
// (see src/lib/disclaimer.ts). One row is written per acceptance, keyed to the
// visitor session, capturing which disclaimer version was accepted and when.
// This is the compliance source of truth; the client also caches acceptance in
// localStorage to avoid re-prompting on every load.
export const disclaimerAcceptances = pgTable('disclaimer_acceptances', {
  id: serial('id').primaryKey(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  version: text('version').notNull(),
  acceptedAt: timestamp('accepted_at').defaultNow(),
});

// Human-in-the-loop escalations. A row is inserted when the chatbot calls
// the `redirectToSupport` tool (see src/app/api/chat/route.ts). Support team
// members answer pending requests from /support, which also appends an assistant
// message to the conversation so the student sees the reply.
export const humanHelpRequests = pgTable('human_help_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  userQuestion: text('user_question').notNull(),
  reason: text('reason'),
  status: text('status').notNull().default('pending'),
  answer: text('answer'),
  answeredBy: text('answered_by'),
  answeredAt: timestamp('answered_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Admin/staff user accounts. Created via /register (gated by REGISTRATION_KEY)
// and authenticated via /login. `role` controls access to /support and
// /countries; only role='admin' may access them.
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('admin'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Server-side session records keyed by an opaque UUID stored in an
// httpOnly cookie. Lookups happen on every authenticated request.
export const userSessions = pgTable('user_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Admin-controlled runtime switches, one row per key. Read via
// src/lib/settings.ts. Currently: `support_enabled` ('true' | 'false') gates
// the human-in-the-loop `redirectToSupport` chat tool.
export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedBy: text('updated_by'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// One-time password-reset tokens issued from /forgot-password. Only the
// SHA-256 hash is stored; a token is valid until `expires_at` and single-use.
export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Internal admin support tickets — feature requests and bug reports filed by
// admins about the tool itself (not student-facing). A row is inserted from
// /tickets, which also emails apps@innovatorsdna.com (see src/lib/email.ts).
// Any admin can close any ticket; there's no assignment model.
export const supportTickets = pgTable('support_tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  // 'bug' or 'feature'.
  type: text('type').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  // 'open' or 'closed'.
  status: text('status').notNull().default('open'),
  createdBy: text('created_by').notNull(),
  closedBy: text('closed_by'),
  closedAt: timestamp('closed_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Country-specific admission criteria, sourced from data/country-criteria.json
// (originally a spreadsheet maintained by the admissions office). Looked up
// directly by the chat agent via the `getCountryCriteria` tool, not embedded.
// `country` covers real countries plus special groupings like
// "ALL STUDENTS" (universal rules) and "American Overseas Schools".
export const countryCriteria = pgTable('country_criteria', {
  id: serial('id').primaryKey(),
  region: text('region'),
  country: text('country').notNull().unique(),
  currentAcademicCriteria: text('current_academic_criteria'),
  englishTestRequired: text('english_test_required'),
  optionalToSubmit: text('optional_to_submit'),
  expiredCountryCriteria: text('expired_country_criteria'),
  notAccepted: text('not_accepted'),
  updatedAt: timestamp('updated_at').defaultNow(),
});
