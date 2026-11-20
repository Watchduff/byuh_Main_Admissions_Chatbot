# Pilot Usage Limits

A lightweight, opt-in guardrail for running **controlled pilots / user testing**
of the BYU-Hawaii Assistant. It caps how many people can use the bot in a given
time window, without restricting how much any single (genuine) person can use it.

> **Status: disabled by default.** Nothing changes for users until you flip the
> hardcoded `USAGE_LIMITS_ENABLED` constant in
> [`src/lib/rate-limit.ts`](../src/lib/rate-limit.ts) to `true` and redeploy.
> With it off, the chat route runs exactly as before and makes **zero** extra
> database queries. This master switch is intentionally **not** an env var — see
> [How to enable it](#how-to-enable-it).

- Code: [`src/lib/rate-limit.ts`](../src/lib/rate-limit.ts)
- Enforced in: [`src/app/api/chat/route.ts`](../src/app/api/chat/route.ts) (right after the session is resolved)

---

## Why this exists (and why it's about scope, not cost)

The app runs on `openai/gpt-4o-mini` through the AI Gateway, which is extremely
cheap — on the order of **~$0.001 per message**. Even a busy pilot week
(100 users × ~20 messages) costs only a couple of dollars. So the point of these
limits is **not** to control the bill. It's to keep a pilot *controlled*:

1. **Scope control** — keep the cohort small enough that you can actually read
   transcripts, gather feedback, and catch bad answers before they reach a wide
   audience.
2. **Abuse protection** — this is a public, unauthenticated, BYU–Hawaii–branded
   bot. A per-session cap stops a script from hammering it.
3. **Brand safety** — a bad answer seen by 15 testers is a fixable note; the same
   answer at full public scale is a bigger problem.

If your goal is a hard **cost** ceiling, the un-bypassable backstop is a spend
cap set **at the AI Gateway**, not in this app (see [Caveats](#important-caveats)).

---

## What "a user" means here

A "user" is a **browser session** — the anonymous `byuh_session` cookie
([`src/lib/session.ts`](../src/lib/session.ts)). There is no login for students.

Two consequences worth understanding before you rely on these caps:

- **They're resettable.** Clearing cookies or opening an incognito window starts
  a new session. So the global caps limit *pilot scope*, not determined
  individuals. They are a soft gate, not authentication.
- **Only people who actually chat count.** The global caps are activity-based: a
  session consumes a slot only once it **sends its first message**. Visitors and
  crawlers that load the page but never chat do **not** count against the cap.

The caps also have a **continuity rule**: once a session is active within a
window, it keeps working even after the cap fills up. The cap turns away *new*
users; it never cuts off someone mid-conversation.

---

## The three limits

| # | Limit | Env var | Default | Purpose |
|---|-------|---------|---------|---------|
| 1 | Per-session messages / 24h | `USAGE_LIMIT_PER_SESSION_DAILY` | `50` | Abuse backstop. A normal visitor never hits it; a script does. |
| 2 | Distinct active users / 24h | `USAGE_LIMIT_GLOBAL_DAILY_USERS` | `20` | Daily pilot scope. |
| 3 | Distinct active users / 7 days | `USAGE_LIMIT_GLOBAL_WEEKLY_USERS` | `100` | Weekly pilot scope. |

All windows are **rolling** (last 24 hours / last 7 days), not calendar-day or
calendar-week resets. This avoids timezone/midnight-reset surprises: the daily
cap is always "in the past 24 hours," measured continuously.

When a limit is hit, the user does **not** get an error. The bot streams back a
friendly notice as its reply (and skips the retrieval + LLM call). Which notice
they see depends on which limit tripped:

- Per-session cap → the **session** message.
- Either global cap → the **global capacity** message.

---

## How to enable it

The master switch is a **hardcoded constant**, not an env var — so turning limits
on is a deliberate, reviewable code change. In
[`src/lib/rate-limit.ts`](../src/lib/rate-limit.ts), find:

```ts
const USAGE_LIMITS_ENABLED = false;
```

Change it to:

```ts
const USAGE_LIMITS_ENABLED = true;
```

Then commit and redeploy. That alone turns on all three limits at their defaults
(50 / 20 / 100) — no env vars are required to get started (the limit *values* and
messages are env-overridable, but they have working built-in defaults).

**Run migrations once** to add the supporting indexes (optional but recommended —
they keep the limit queries fast):

```bash
npm run db:migrate
```

The migration is safe to run repeatedly; it only adds indexes if missing and
never drops or rewrites data.

### To turn it back off

Set the constant back to `false`, commit, and redeploy. No data cleanup is
needed — the indexes are harmless when the feature is off.

---

## Changing the parameters

Once the feature is enabled (via the code constant above), every limit *value*
is independently tunable via env vars. Change the number and redeploy — no
further code changes required.

```bash
# Example: a tighter early pilot (with USAGE_LIMITS_ENABLED already = true in code)
USAGE_LIMIT_PER_SESSION_DAILY=30       # max messages per session per 24h
USAGE_LIMIT_GLOBAL_DAILY_USERS=10      # max new users per 24h
USAGE_LIMIT_GLOBAL_WEEKLY_USERS=50     # max new users per 7 days
```

### Disabling one limit but keeping the others

Set any individual limit to `0` to switch just that one off. For example, to
keep the abuse backstop but remove the global caps entirely:

```bash
# (with USAGE_LIMITS_ENABLED = true in code)
USAGE_LIMIT_PER_SESSION_DAILY=50
USAGE_LIMIT_GLOBAL_DAILY_USERS=0       # 0 = no daily cap
USAGE_LIMIT_GLOBAL_WEEKLY_USERS=0      # 0 = no weekly cap
```

This directly answers the original ask — a limit on total users in a window,
with **no cap on an individual's usage**: set the two global caps and leave the
per-session cap at `0`. (We recommend keeping a generous per-session cap anyway,
purely as spam protection — a real student won't notice 50 messages/day.)

### Customizing the messages users see

Override the default notices (Markdown is rendered in the chat bubble):

```bash
# Shown when a global daily/weekly capacity cap is hit
USAGE_LIMIT_MESSAGE_GLOBAL="We're at capacity for today's pilot — please check back tomorrow! 🌺"

# Shown when a single session hits its per-session message cap
USAGE_LIMIT_MESSAGE_SESSION="You've reached this session's message limit for the pilot. Thanks for testing with us!"
```

If unset, sensible warm defaults are used (see `src/lib/rate-limit.ts`).

---

## Full configuration reference

The **master on/off switch is a code constant**, not an env var:

| Setting | Where | Default | Meaning |
|---------|-------|---------|---------|
| `USAGE_LIMITS_ENABLED` | code constant in `src/lib/rate-limit.ts` | `false` | Master switch. Flip to `true` + redeploy to enable; `false` = fully off. |

Everything else is env-overridable (used only when the master switch is on):

| Variable | Type | Default | Meaning |
|----------|------|---------|---------|
| `USAGE_LIMIT_PER_SESSION_DAILY` | integer ≥ 0 | `50` | Max user messages per session / 24h. `0` disables this limit. |
| `USAGE_LIMIT_GLOBAL_DAILY_USERS` | integer ≥ 0 | `20` | Max distinct active users / 24h. `0` disables. |
| `USAGE_LIMIT_GLOBAL_WEEKLY_USERS` | integer ≥ 0 | `100` | Max distinct active users / 7 days. `0` disables. |
| `USAGE_LIMIT_MESSAGE_GLOBAL` | string | (warm default) | Notice shown when a global cap is hit. |
| `USAGE_LIMIT_MESSAGE_SESSION` | string | (warm default) | Notice shown when the per-session cap is hit. |

Invalid or negative numeric values fall back to the default. A blank string for a
message falls back to the default message.

---

## Recommended pilot settings

A reasonable starting point for user testing, matching the research behind this
feature (layered soft limits, generous per-individual allowance):

First set `USAGE_LIMITS_ENABLED = true` in `src/lib/rate-limit.ts`. The defaults
below then apply automatically; set these env vars only if you want to override
them:

```bash
USAGE_LIMIT_PER_SESSION_DAILY=50
USAGE_LIMIT_GLOBAL_DAILY_USERS=20
USAGE_LIMIT_GLOBAL_WEEKLY_USERS=100
```

Tune the two global numbers up or down as the pilot grows. Watch the actual
numbers (see below) for a week and adjust.

---

## How enforcement works (implementation notes)

On each chat request, after the session cookie is resolved and **before** the
user's message is saved or the LLM is called, `checkUsageLimits(sessionId)`
runs:

1. **Per-session:** counts this session's `role='user'` messages in the last
   24h. If `>=` the cap, block with the session message.
2. **Global daily:** counts distinct sessions that have sent a message in the
   last 24h. If this session isn't already among them **and** the count is `>=`
   the daily cap, block with the global message.
3. **Global weekly:** same as above over a 7-day window.

Counts are computed live from the existing `chat_messages` / `conversations`
tables — there is no separate usage table to maintain, and nothing is written
when a request is blocked (the blocked message is not persisted).

Because it keys on the anonymous session cookie, enforcement is best-effort by
design. That's the right trade-off for a pilot gate; it is not a security
control.

---

## Important caveats

- **Bypassable by design.** Clearing cookies / incognito = a new session. These
  caps shape pilot scope; they do not lock determined users out.
- **The real cost backstop lives at the AI Gateway.** For a guaranteed spend
  ceiling that can't be bypassed by cookie resets, set a monthly budget cap on
  the AI Gateway / provider account. That is independent of this app and should
  be set regardless.
- **Shared networks.** Because counting is per-session (not per-IP), students on
  the same campus Wi-Fi are counted separately — which is what you want. There
  is intentionally no IP-based limiting.
- **Want a defined cohort instead of a race-to-the-cap?** For some pilots an
  invite-code / allowlist gate (only your named testers get in, everyone gets a
  smooth experience) is a better fit than a numeric cap. That isn't built here;
  ask if you'd like it added.

---

## Verifying it works

With the feature enabled, you can watch the live numbers directly in the
database:

```sql
-- Distinct active users in the last 24h (compare against GLOBAL_DAILY_USERS)
SELECT COUNT(DISTINCT c.session_id) AS active_users_24h
FROM chat_messages cm
JOIN conversations c ON c.id = cm.conversation_id
WHERE cm.role = 'user'
  AND cm.created_at > NOW() - INTERVAL '24 hours';

-- Distinct active users in the last 7 days (compare against GLOBAL_WEEKLY_USERS)
SELECT COUNT(DISTINCT c.session_id) AS active_users_7d
FROM chat_messages cm
JOIN conversations c ON c.id = cm.conversation_id
WHERE cm.role = 'user'
  AND cm.created_at > NOW() - INTERVAL '7 days';
```

To smoke-test the block behavior locally, set a tiny cap (e.g.
`USAGE_LIMIT_GLOBAL_DAILY_USERS=1`), then chat from two different browsers /
incognito windows — the second should receive the capacity notice.
