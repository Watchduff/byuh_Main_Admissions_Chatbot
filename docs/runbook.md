# Operations Runbook — BYU-Hawaii Assistant

Satisfies the **L6 / Operations** Definition of Done from
[`roadmap.md`](roadmap.md): *owners can deploy, roll back, monitor, and
triage post-launch.* This is the on-call reference for the Aug 1, 2026 launch
and the first weeks after.

> Scope: the public embedded BYU-Hawaii Assistant chatbot (all departments). It assumes the
> institution-managed **Vercel + Neon** hosting path (the primary path in the
> roadmap). The AWS App Runner path (`scripts/deploy-aws.sh`) is a documented
> fallback only — see [Appendix: AWS fallback](#appendix-aws-app-runner-fallback).

---

## 1. Service map — what runs where

| Piece | Where | Notes |
|-------|-------|-------|
| Next.js app + API routes | Vercel (project owned by the institution) | Chat UI, `/embed`, admin pages, all `/api/*` routes |
| Website embed | `public/embed.js` loaded on BYU–Hawaii sites | Injects the chat widget; points at the Vercel deployment |
| Database | Neon Postgres + `pgvector` (paid plan) | Chunks/embeddings, conversations, messages, users, country criteria, scrape-run history |
| LLM + embeddings | OpenAI (direct, via `@ai-sdk/openai`) | `gpt-4o-mini` (chat + query rewrite), `text-embedding-3-small` (1536-dim) |
| Knowledge-base re-scrape | VM crontab → `scripts/vm/scrape-cron.sh` → `/api/cron/scrape` on the VM's app (`0 9 * * *` UTC, plus `?queued=1` every 30 minutes). Vercel runs **no** crons (`vercel.json` is empty) | Runs one time-boxed batch per night (a few subdomains, under the 300s function limit) and works through every subdomain about every two weeks; queue state lives in `scrape_site_state`. Needs `CRON_SECRET` in the VM app's `.env`. The 30-minute `?queued=1` run works only on subdomains queued from `/scraping` ("Run scrape now" queues all of them, or tick rows to queue just those) and is a no-op otherwise, so a manual refresh finishes even after the page is closed. While the page is open it also drives batches back to back; the two take turns via the busy check. A subdomain too big for one batch is resumable: its crawl position is saved in `scrape_site_state.crawl_state` and the next batch carries on. Only when a crawl pass completes are that subdomain's pages that weren't re-saved (removed from the site or no longer linked) deleted. Pages that failed with a timeout/5xx are kept, and the cleanup is skipped if it would remove over half the stored pages. Passes that end because the site refused us are marked `incomplete` and delete nothing. The old GitHub Actions workflow is manual-only: BYU–Hawaii returns 403 to GitHub's runners. A full local run is `npm run ingest` (about an hour). |

### Required environment variables

Set in the Vercel project (Production + Preview). Missing/rotated secrets are a
common incident cause, so this is the first thing to check.

| Var | Purpose | Notes |
|-----|---------|-------|
| `DATABASE_URL` | Neon Postgres connection string | Use the pooled connection string. Rotating it requires a redeploy. |
| `CRON_SECRET` | Bearer token the scrape cron + manual GitHub/curl trigger must present | If unset, the cron endpoint runs **unauthenticated** — always set it in production. |
| `REGISTRATION_KEY` | Gates admin self-registration at `/register` | Keep secret; anyone with it can create an admin account. |
| `COOKIE_SECURE` | Forces the `Secure` flag on session cookies | Set truthy in production (HTTPS). See `docs/vm-https-cookie-issue.md`. |
| `OPENAI_API_KEY` | LLM + embedding access via `@ai-sdk/openai` (`src/lib/ai.ts`) | Required. Without it chat and ingestion fail. |
| `RESEND_API_KEY` | Sends the "new support ticket" email from `/tickets` and password-reset emails from `/forgot-password` | Without it, those actions still succeed but the email is skipped (logged as a warning) — so password reset won't work. |
| `APP_URL` | Public base URL used in password-reset links (e.g. `https://chat.example.edu`) | Set it in production. Falls back to the request's origin, which trusts the `Host` header. |
| `SUPPORT_EMAIL_FROM` | `From` address on ticket-notification emails | Optional — must be a domain verified in Resend. Defaults to Resend's sandbox sender. |
| `SUPPORT_TICKET_NOTIFY_EMAIL` | Recipient for new-ticket emails | Optional — defaults to `apps@innovatorsdna.com`. |

---

## 2. Deploy

Standard deploys are **git-push driven** through Vercel.

1. Merge to the default branch (`main`). Vercel auto-builds and promotes to
   Production. Watch the build in the Vercel dashboard → Deployments.
2. **If the change includes a schema/migration or new ingestion logic**, run
   against the production `DATABASE_URL` *after* the deploy is live:
   ```bash
   npm run db:migrate      # idempotent: CREATE EXTENSION/TABLE IF NOT EXISTS
   npm run ingest          # only if content/scraper logic changed
   ```
   `db:migrate` is safe to re-run (all statements are `IF NOT EXISTS` /
   backfill-guarded). `ingest` re-scrapes and re-embeds — it costs OpenAI
   tokens, so don't run it casually (see cost note in [`roadmap.md`](roadmap.md)).
3. Smoke-test after promotion (see [§5 Post-deploy smoke test](#5-post-deploy-smoke-test)).

### Pre-deploy check (local)
```bash
npm run lint
npm run build
```

---

## 3. Roll back

Fastest recovery for a bad deploy — **do this first, diagnose second.**

1. **Vercel instant rollback (preferred):** Vercel dashboard → Deployments →
   pick the last known-good deployment → **Promote to Production**. This is
   near-instant and needs no rebuild.
2. **Or revert the commit:** `git revert <bad-sha>` and push; Vercel rebuilds
   from the reverted state.
3. **If the bad deploy shipped a destructive migration:** code rollback does
   **not** undo data changes. Migrations here are additive (`IF NOT EXISTS` +
   backfills), so a plain rollback is normally safe. If a genuinely destructive
   change ever ships, restore from a Neon point-in-time / branch snapshot —
   coordinate with the Neon account owner.

> Rule of thumb: **roll back the deploy immediately** if the widget is failing
> for visitors. Investigate on a preview deployment, not in Production.

---

## 4. Monitor

### In-app monitoring
- **`/monitor`** (admin-only) — volume, escalation rate, thumbs-down rate,
  daily trend, and recent 👎 / escalation feeds. First stop each shift.
  Backed by `GET /api/admin/monitor`.
- **`/support`** — escalation inbox with a pending-count badge. Every
  `redirectToSupport` escalation lands here; work the queue down.
- **`/scraping`** — scrape-run history + "next scheduled refresh" + a manual
  re-trigger. Confirms ingestion is healthy and content is fresh.
- **`/conversations`** — read-only transcript viewer for spot-checking answer
  quality and investigating a specific 👎.

### Platform monitoring
- **Vercel** → Deployments (build health), Functions/Logs (runtime errors,
  `maxDuration` timeouts on the 300s cron/scrape functions), Usage.
- **Neon** → compute/storage usage and connection counts.
- **OpenAI** → token spend and error rate.

### Set before launch (roadmap recommendation #6)
Per-provider **billing alerts** on OpenAI, Neon, and Vercel. A runaway
re-ingestion loop or a traffic spike is the realistic cost surprise — an alert
turns an invoice into a page.

---

## 5. Post-deploy smoke test

Run after every production promotion (≈2 minutes):

1. Load the BYU–Hawaii page hosting `embed.js` → widget renders; disclaimer
   gate appears on first visit.
2. Ask a known admissions question → grounded answer streams back.
3. Ask a country-criteria question (e.g. a specific country) → `getCountryCriteria` answers.
4. Trigger an escalation path → confirm it appears in `/support`.
5. Submit a 👍/👎 on an answer → confirm it lands in `/monitor`.
6. `/scraping` shows the last successful run and a sane "next scheduled refresh".

---

## 6. Triage — common incidents

| Symptom | Likely cause | Action |
|---------|-------------|--------|
| Widget not loading on host site | `embed.js` URL / CORS / bad deploy | Roll back deploy (§3); verify the embed script src points at the live Vercel URL. |
| Answers error out / stream cuts off | OpenAI outage; missing or invalid `OPENAI_API_KEY` | Check function logs + OpenAI status; confirm `OPENAI_API_KEY` is set. Fallback messaging should show to visitors. |
| DB connection errors | `DATABASE_URL` rotated/wrong; Neon at connection cap | Verify the pooled `DATABASE_URL`; check Neon connection count. Redeploy after fixing the var. |
| Cron scrape returns 401 | `CRON_SECRET` mismatch between caller and env | Confirm `CRON_SECRET` is set and the caller sends `Authorization: Bearer <CRON_SECRET>`. |
| Answers miss a page that obviously exists in the KB | IVFFlat recall: index centroids stale, or too few lists probed | The chat search sets `ivfflat.probes = 10` (see `src/app/api/chat/route.ts`); ingestion re-runs `REINDEX INDEX byuh_chunks_embedding_idx` after every ingest. If answers still miss, run `REINDEX INDEX byuh_chunks_embedding_idx;` manually against the production DB. |
| Content stale / a run stuck "running" | Serverless function killed mid-scrape (>20 min ⇒ treated as stale) | `/scraping` flags stale runs and unblocks a fresh trigger — hit **manual re-scrape**. |
| Escalations piling up in `/support` | Volume spike or a content gap driving deflection | Work the queue; log recurring gaps for the L2 content-improvement process. |
| Admin can't log in | Cookie `Secure`/HTTPS mismatch | See `docs/vm-https-cookie-issue.md`; ensure `COOKIE_SECURE` matches the scheme. |
| Disclaimer re-prompts everyone | `DISCLAIMER_VERSION` bumped | Expected after a copy update — acceptance is recorded per version. Only bump when approved wording lands. |

### Manual re-scrape (out-of-band content refresh)
- **UI:** `/scraping` → "Run scrape now" for everything (about an hour, keep
  the page open), or the Refresh button on one subdomain (a few minutes).
- **API:** `POST /api/admin/scrape` (admin session) runs one batch; so does the
  cron endpoint with the shared secret (it only scrapes subdomains that are
  due or queued):
  ```bash
  curl -X GET https://<prod-host>/api/cron/scrape \
    -H "Authorization: Bearer $CRON_SECRET"
  ```

---

## 7. Escalation contacts

Fill in before go-live — these are the owners the go/no-go checklist depends on.

| Role | Owner | Contact |
|------|-------|---------|
| Product / launch owner | _TBD_ | |
| Engineering on-call | _TBD_ | |
| Vercel account owner | _TBD_ | |
| Neon / database owner | _TBD_ | |
| Admissions content owner | _TBD_ | |
| Security / compliance contact | _TBD_ | |

---

## Appendix: AWS App Runner fallback

Documented alternative only; the primary path is Vercel + Neon.
`scripts/deploy-aws.sh /absolute/path/to/repo` provisions RDS Postgres +
pgvector, ECR, and App Runner, runs migrations + ingestion, and rolls out the
image. It is idempotent — re-run to ship a revision. `SKIP_INGEST=1` skips
re-ingestion on re-runs. Resource IDs and the generated DB password land in
`.aws-deploy.state` — **treat that file as a secret.** See `README.md` for the
full override list.

## Scheduled scraping on the VM

Scheduled scraping runs only on the BYU–Hawaii VM (`ubuntu@10.11.240.55 -p 1955`,
app in `~/byuh-admissions-bot` under pm2 as `byuh-admissions-bot`, port 3000).
Vercel runs no crons.

1. `CRON_SECRET` must be set in `~/shared/.env` (linked into the app as `.env`) (any long random
   string, e.g. `openssl rand -hex 32`), then `pm2 restart byuh-admissions-bot --update-env`.
2. `crontab -e` as `ubuntu`:

   ```cron
   0 9 * * *   $HOME/byuh-admissions-bot/scripts/vm/scrape-cron.sh nightly
   15,45 * * * * $HOME/byuh-admissions-bot/scripts/vm/scrape-cron.sh queued
   ```

   The queue check runs every 30 minutes (at :15 and :45, clear of the 09:00 nightly run) rather than every few
   minutes: each check queries Neon, and polling more often than Neon's 5-minute autosuspend
   keeps the database awake around the clock.

Runs that did something (not idle queue checks) are logged to
`~/logs/scrape-cron.log`. The admin page's Scrape history shows them with the
"cron" trigger.

## Auto-deploy on the VM

The VM deploys `main` by itself: every 5 minutes cron runs
`scripts/vm/auto-deploy.sh`, which compares the tip of `main` on GitHub
(`git ls-remote`, a few KB, no database) with the live release. When it has
moved, it builds the new commit in its own folder and only then switches over:

```
~/releases/<sha>/        one folder per deployed commit (keeps the last 3)
~/byuh-admissions-bot    symlink to the live release (pm2 and cron use this path)
~/shared/.env            the app's env file, linked into every release
~/shared/repo.git        local bare copy of the repo
~/logs/deploy.log        what each deploy did
```

- A failed install/build leaves the live site untouched. That commit is not
  retried until a newer one is pushed (delete `~/shared/.deploy-failed-sha`
  to retry it).
- If the site doesn't answer after the restart, it switches back to the
  previous release.
- It waits for a running scheduled scrape batch before restarting.
- Rollback by hand: `~/byuh-admissions-bot/scripts/vm/auto-deploy.sh <sha>`
  (any commit; cron will move forward again on the next push to `main`).
- Edit env vars in `~/shared/.env`, then `pm2 restart byuh-admissions-bot --update-env`.

Crontab line (as `ubuntu`):

```cron
*/5 * * * * $HOME/byuh-admissions-bot/scripts/vm/auto-deploy.sh
```
