import { pool } from '@/db/index';

/**
 * Usage limiting for the pilot / user-testing phase.
 *
 * This is a lightweight guardrail for running controlled pilots of the
 * BYU-Hawaii Assistant. It is DISABLED by default and gated entirely behind the
 * `USAGE_LIMITS_ENABLED` env var — when unset (or anything other than the
 * string "true"), `checkUsageLimits` short-circuits and lets every request
 * through with zero database queries.
 *
 * The master on/off switch is the hardcoded `USAGE_LIMITS_ENABLED` constant
 * below — NOT an env var. Flip it to `true`, commit, and redeploy to turn
 * limits on; flip it back to `false` to turn them off. This is deliberate: it
 * keeps enabling limits an explicit, reviewable code change.
 *
 * When enabled, three independent limits are enforced, each of which can be
 * tuned or individually switched off (set to 0) via env vars:
 *
 *   1. Per-session daily message cap  — abuse backstop. A normal visitor never
 *      hits it; a script gets stopped. Counts a single browser session's user
 *      messages in a rolling 24h window.
 *   2. Global daily active-user cap   — scope control. Caps how many distinct
 *      sessions may *use* the bot (send >=1 message) in a rolling 24h window.
 *   3. Global weekly active-user cap  — scope control, rolling 7-day window.
 *
 * A "user" here is a browser session (the `byuh_session` cookie). It is
 * anonymous and resettable (clearing cookies / incognito starts a new one), so
 * these caps control pilot *scope*, not hard access — see docs/usage-limits.md.
 *
 * The global caps are activity-based, not page-load-based: a session only
 * counts once it sends its first message, so lookers and crawlers that never
 * chat don't consume a slot. Sessions that are already active within the window
 * keep chatting even after the cap is reached (continuity), so the cap turns
 * away *new* users rather than cutting off people mid-conversation.
 */

export type UsageLimitReason = 'per_session' | 'global_daily' | 'global_weekly';

export type UsageDecision =
  | { allowed: true }
  | { allowed: false; reason: UsageLimitReason; message: string };

export interface UsageLimitConfig {
  enabled: boolean;
  /** Max user messages per browser session per rolling 24h. 0 = disabled. */
  perSessionDailyMessages: number;
  /** Max distinct sessions that may send a message per rolling 24h. 0 = disabled. */
  globalDailyUsers: number;
  /** Max distinct sessions that may send a message per rolling 7 days. 0 = disabled. */
  globalWeeklyUsers: number;
  /** Shown when a global (daily/weekly) capacity cap is hit. */
  globalMessage: string;
  /** Shown when the per-session message cap is hit. */
  sessionMessage: string;
}

/**
 * MASTER SWITCH for pilot usage limits — hardcoded on purpose.
 *
 * Set to `true`, commit, and redeploy when you want to turn the limits on for a
 * pilot; set back to `false` to disable. There is intentionally no env var for
 * this — enabling limits is a deliberate code change. While `false`, the chat
 * route is unaffected and runs no extra database queries.
 *
 * (The individual limit *values* and messages below can still be tuned via env
 * vars once this is on — see docs/usage-limits.md — but the on/off decision
 * lives here.)
 */
const USAGE_LIMITS_ENABLED = false;

const DEFAULT_PER_SESSION_DAILY = 50;
const DEFAULT_GLOBAL_DAILY = 20;
const DEFAULT_GLOBAL_WEEKLY = 100;

const DEFAULT_GLOBAL_MESSAGE =
  "Thanks so much for your interest in BYU–Hawaii! 🌺 Our " +
  "assistant is running as a limited pilot right now, and we've reached capacity " +
  "for the moment. Please check back a little later — we'd love to help you " +
  'then. In the meantime you can find answers at www.byuh.edu.';

const DEFAULT_SESSION_MESSAGE =
  "You've reached the message limit for this pilot session — thanks for " +
  'chatting with us! Please check back a bit later, or find the office you need ' +
  'at www.byuh.edu.';

/**
 * Parse a non-negative integer limit from the environment. An unset/blank/
 * invalid value falls back to `fallback`; an explicit `0` means "this limit is
 * turned off" and is preserved.
 */
function parseLimit(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

function parseMessage(raw: string | undefined, fallback: string): string {
  if (raw === undefined || raw.trim() === '') return fallback;
  return raw;
}

export function getUsageLimitConfig(): UsageLimitConfig {
  return {
    enabled: USAGE_LIMITS_ENABLED,
    perSessionDailyMessages: parseLimit(
      process.env.USAGE_LIMIT_PER_SESSION_DAILY,
      DEFAULT_PER_SESSION_DAILY
    ),
    globalDailyUsers: parseLimit(
      process.env.USAGE_LIMIT_GLOBAL_DAILY_USERS,
      DEFAULT_GLOBAL_DAILY
    ),
    globalWeeklyUsers: parseLimit(
      process.env.USAGE_LIMIT_GLOBAL_WEEKLY_USERS,
      DEFAULT_GLOBAL_WEEKLY
    ),
    globalMessage: parseMessage(process.env.USAGE_LIMIT_MESSAGE_GLOBAL, DEFAULT_GLOBAL_MESSAGE),
    sessionMessage: parseMessage(process.env.USAGE_LIMIT_MESSAGE_SESSION, DEFAULT_SESSION_MESSAGE),
  };
}

/**
 * How many distinct sessions have sent >=1 user message within `interval`, and
 * whether *this* session is one of them. `activeUsers` is the count of distinct
 * sessions already active in the window; `sessionAlreadyActive` is true when the
 * given session has itself sent a message in the window (so it should be allowed
 * to continue regardless of the cap).
 */
async function windowActivity(
  client: import('pg').PoolClient,
  sessionId: string,
  interval: string
): Promise<{ activeUsers: number; sessionAlreadyActive: boolean }> {
  const result = await client.query(
    `SELECT
        COUNT(DISTINCT c.session_id)::int AS active_users,
        BOOL_OR(c.session_id = $1) AS session_active
       FROM chat_messages cm
       JOIN conversations c ON c.id = cm.conversation_id
      WHERE cm.role = 'user'
        AND cm.created_at > NOW() - $2::interval`,
    [sessionId, interval]
  );
  return {
    activeUsers: result.rows[0].active_users ?? 0,
    sessionAlreadyActive: result.rows[0].session_active === true,
  };
}

/**
 * Decide whether a chat request from `sessionId` should be allowed. Call this
 * BEFORE persisting the incoming user message (the current message is not yet
 * counted). Returns `{ allowed: true }` immediately and runs no queries when the
 * feature flag is off.
 */
export async function checkUsageLimits(sessionId: string): Promise<UsageDecision> {
  const cfg = getUsageLimitConfig();
  if (!cfg.enabled) return { allowed: true };

  const client = await pool.connect();
  try {
    // 1. Per-session daily message cap (abuse backstop).
    if (cfg.perSessionDailyMessages > 0) {
      const r = await client.query(
        `SELECT COUNT(*)::int AS cnt
           FROM chat_messages cm
           JOIN conversations c ON c.id = cm.conversation_id
          WHERE c.session_id = $1
            AND cm.role = 'user'
            AND cm.created_at > NOW() - INTERVAL '24 hours'`,
        [sessionId]
      );
      if (r.rows[0].cnt >= cfg.perSessionDailyMessages) {
        return { allowed: false, reason: 'per_session', message: cfg.sessionMessage };
      }
    }

    // 2. Global daily active-user cap. Already-active sessions continue; only a
    //    brand-new active user is turned away once capacity is full.
    if (cfg.globalDailyUsers > 0) {
      const { activeUsers, sessionAlreadyActive } = await windowActivity(
        client,
        sessionId,
        '24 hours'
      );
      if (!sessionAlreadyActive && activeUsers >= cfg.globalDailyUsers) {
        return { allowed: false, reason: 'global_daily', message: cfg.globalMessage };
      }
    }

    // 3. Global weekly active-user cap.
    if (cfg.globalWeeklyUsers > 0) {
      const { activeUsers, sessionAlreadyActive } = await windowActivity(
        client,
        sessionId,
        '7 days'
      );
      if (!sessionAlreadyActive && activeUsers >= cfg.globalWeeklyUsers) {
        return { allowed: false, reason: 'global_weekly', message: cfg.globalMessage };
      }
    }

    return { allowed: true };
  } finally {
    client.release();
  }
}
