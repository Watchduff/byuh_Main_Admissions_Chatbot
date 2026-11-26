# BYU–Hawaii Admissions Bot — Roadmap to Aug 1, 2026 Launch

Reconciles two inputs:
- **May 5, 2026 planning meeting** notes (broad, aspirational feature list)
- **June 2, 2026 "Admissions AI Chatbot Baseline"** scope document (formal launch
  scope + Definition of Done)

**Scope decision:** where the two conflict, the **June 2 baseline governs the
Aug 1 launch.** Aug 1 is a **narrow, public, admissions-only embedded chatbot
with no required login.** The broader ambitions from the meeting notes (SSO,
multi-department bundle, journeyline, Career Services, full admin console,
student accounts) are **real and tracked**, but moved to **Phase 2 / post-launch**
(see backlog below). This keeps the Aug 1 date credible.

---

## Build status update — Jul 16, 2026

Catch-up snapshot. The dated phase narrative further below still reads
"today = Jun 15" for its effort estimates; this section is the current
reconciliation. **Today is Jul 16 — ~16 days (~11 working days) to the Aug 1
launch.** Per the reconciled calendar we are **mid-L4 (embed QA, Jul 8–20)**
with **L5 (UAT + student pilot, Jul 18–28) starting in 2 days.**

The core L3 build block is complete in code (last code commit Jul 10) and the
one remaining engineering gate — the **operations runbook** — is now written
(`docs/runbook.md`). Everything else on the critical path is coordination
(security/accounts, content sign-off, QA, UAT), not engineering.

**Shipped:**
- **L3 website embed widget** (`public/embed.js` + `/embed`) — the biggest net-new build.
- **L3 onboarding / capabilities panel** (A2), **feedback capture 👍/👎** (A4),
  **read-only conversation viewer** (A3, trimmed) with pagination.
- **L2 legal disclaimer + acceptance gate** (A1) — `DisclaimerGate` blocking
  first-visit modal + persistent footer on both the app and the embed;
  acceptance recorded per session (version + timestamp) via `/api/disclaimer`.
  ⚠️ **The disclaimer copy in `src/lib/disclaimer.ts` is a draft pending
  legal/compliance sign-off** — bump `DISCLAIMER_VERSION` when the approved
  wording lands.
- **L6 lightweight monitoring view** (B2, trimmed) — `/monitor` admin page +
  `/api/admin/monitor`: volume, escalation rate, thumbs-down rate, daily trend,
  and recent 👎 / escalation feeds.

**Still open (not engineering):** L1 security review + Vercel/Neon ownership
transfer + SOC 2 docs (top date risk); L2 content inventory / FAQ test set /
send disclaimer copy to legal; L4 cross-browser + mobile + accessibility embed
QA; L5 UAT + student pilot. **Still open (engineering):** _none on the critical
path_ — the operations runbook (deploy / roll back / monitor / triage) for the
L6 Definition of Done is now written (`docs/runbook.md`); keep it current and
fill in the escalation-contact owners before go-live.

---

## Assumptions & how to read this

- **Window:** baseline assumes a Jun 2 start; **today is Jun 15**, so Phases 1–2
  below should be wrapping up now (status flagged inline).
- **Team:** ~2 engineers (~70 engineer-days capacity over the window).
- Effort in **engineer-days (d)**: 🟢 ≤2d · 🟡 3–5d · 🔴 6d+. Several launch
  workstreams are **coordination/review**, not engineering — tagged *(non-eng)*.

---

## Aug 1 launch scope (reconciled)

| Category | In scope for Aug 1 | Deferred to Phase 2 / future |
|----------|--------------------|------------------------------|
| **User experience** | Embedded chatbot on the Admissions website; public visitor chat; answers admissions FAQs + web-content questions | Live agent handoff; authenticated student-specific workflows |
| **Content** | Admissions-approved sources; launch FAQ; escalation language; contact links | Campus-wide KB across all departments |
| **Data & hosting** | Institution-managed Vercel + Neon Postgres (paid plan); controlled billing & access | Enterprise governance program *unless required by security review* |
| **Authentication** | No required login for public chat | Campus SSO/Okta; authenticated admin workflows |
| **Administration** | Basic operational monitoring + content-improvement process | Full backend admin console for nontechnical staff |
| **Support model** | Documented escalation to Admissions contact paths (existing `redirectToSupport` + `/support` inbox) | Real-time live-agent routing / ticketing |
| **Future reuse** | Build a **reusable pattern** for other departments | Actually launching Housing, Financial Services, Honor Code, etc. |

> **Reconciliation note:** the meeting notes asked for **Enterprise Neon**; the
> baseline says a **paid plan**, with Enterprise *only if the security review
> requires it*. Treat Enterprise as security-gated, not a default purchase.

### What already exists (baseline — not re-counted below)

- RAG chatbot over scraped BYUH subdomains (pgvector, biweekly re-scrape cron, query rewriting)
- ~~Multilingual answers~~ — dropped; the bot replies in English only
- `getCountryCriteria` tool (97 countries) + `/countries` editor
- `redirectToSupport` escalation + `/support` inbox with pending-count badge
- Admin email/password auth, role-gated pages; sessions/conversations/messages persisted

---

## Launch workstreams (the path to Aug 1)

Mapped to the baseline's 7 phases. Items carried over from the earlier roadmap
are noted as **(was A1/A2/…)**.

### L0 — Scope lock & success criteria · *baseline Phase 1 (Jun 2–7)*
**Status: should be DONE by Jun 15.** *(non-eng)*
- Final launch scope, audience, success metrics, out-of-scope list, owners, decision log.
- **Action now:** confirm this doc reflects the locked decision log; ratify success metrics (e.g. answer rate, escalation rate, thumbs-down rate, deflection).

### L1 — Security & account readiness · *baseline Phase 2 (Jun 5–14)*
**Status: in progress / should be wrapping.** 🟡 2–3d eng + *(coordination)*
- Institution-managed **Vercel + Neon** accounts; transfer ownership; confirm billing owner.
- Collect **SOC 2 / security & compliance docs**; review **least privilege**, account access, and data handling.
- **New vs. old roadmap:** the security/compliance review was missing before — it's a launch gate now. Includes **D1 Neon migration** (institution-controlled paid plan).

### L2 — Content grounding & test set · *baseline Phase 3 (Jun 10–23)* 🟡 3–4d + *(content review)*
- Inventory **admissions-approved** sources; confirm launch **FAQ coverage**; document **known gaps**.
- Finalize **escalation language** + **contact links**.
- **Legal disclaimer + acceptance gate** (*A1*) — 🟢 1–2d eng **+ legal review lead time**. First-visit modal + persistent footer; record acceptance (version + timestamp) per session. **Send copy to legal now** so approval lands before launch. In scope because the baseline lists the disclaimer/escalation language as launch content.
- Build a **FAQ test-question set** for regression/UAT.

### L3 — Build & integration hardening · *baseline Phase 4 (Jun 17 – Jul 10)* 🔴 6–8d
- **Website embed pattern** (script/iframe widget) for the Admissions site — *net-new, the single biggest gap vs. the old roadmap.*
- Production env vars/secrets, **logging**, deployment flow, fallback messaging.
- **Onboarding / intro experience** (*A2*) — 🟡 2–3d, scoped to the embedded widget: welcome, what it can/can't help with, starter prompts.
- **Basic conversation viewer** (*A3, trimmed*) — 🟢 2d. Read-only list + transcript view for operational monitoring. (Full searchable/filterable console → Phase 2.)
- **Feedback capture (👍/👎 + comment)** (*A4*) — 🟢 2d. Per-answer rating stored against message id; feeds the content-improvement process and L6 monitoring.

### L4 — Website embed QA · *baseline Phase 5 (Jul 8–20)* 🟡 3–5d
- Test embed on **desktop/mobile**, major **browsers**, key Admissions pages.
- **Accessibility**, page performance, link handling, fallback messaging.
- *Net-new vs. old roadmap.*

### L5 — UAT & launch readiness · *baseline Phase 6 (Jul 18–28)* 🟡 3–5d + *(coordination)*
- **UAT with Admissions stakeholders**; fix priority defects.
- **Merge the meeting-notes pilot here:** run the student cohorts (mentor group, current-student table, recent + upcoming applicants) as UAT participants/early access — satisfies both docs without a separate phase.
- Finalize **support playbook** + **go/no-go checklist**.

### L6 — Launch & monitoring · *baseline Phase 7 (Aug 1 + first 2 weeks)* 🟡 ongoing
- Launch; monitor usage / questions / errors; review early content gaps; plan post-launch iteration.
- **Lightweight monitoring view** (*B2, trimmed*) — 🟢 1–2d. Volume, top questions, escalation rate, thumbs-down rate from L3 data. (Full analytics dashboard → Phase 2.)
- **Defect / fast-follow buffer** (*B3*) — 🟡 3–5d reserved across L5–L6 to act on UAT + early-launch feedback (tone, gaps, prompt tweaks).
- **Operations runbook:** owners know how to **deploy, roll back, monitor, triage** content issues. *(net-new)* — **written: `docs/runbook.md`.** Remaining: fill in escalation-contact owners before go-live.

**Launch eng subtotal: ~25–40d** (fits within ~70d capacity; the remainder is review/coordination).

---

## Definition of Done for launch (from baseline)

| Workstream | Done means… |
|------------|-------------|
| Scope | Final scope, exclusions, and success metrics approved. |
| Content | Admissions sources reviewed; gaps + escalation paths documented. |
| Build | Deployed to institution-controlled Vercel; env vars/secrets managed. |
| Database | Institution-controlled Neon on an approved paid plan, connected. |
| Website | Embed tested on desktop/mobile, major browsers, key pages. |
| Security | Vercel + Neon security/compliance docs collected; access/least-privilege/data-handling reviewed. |
| Operations | Owners can deploy, roll back, monitor, and triage post-launch. |

---

## Reconciled calendar (today = Jul 16)

| Window | Workstream | Status @ Jul 16 |
|--------|-----------|-----------------|
| Jun 2–7 | L0 Scope lock | ✅ done — confirm decision log ratified. |
| Jun 5–14 | L1 Accounts / security review | ⚠️ **must be closing** — chase SOC 2 docs + Vercel/Neon ownership. Top date risk. |
| Jun 10–23 | L2 Content inventory / FAQ test set | 🔶 in progress — send disclaimer copy to legal; finalize FAQ test set. |
| Jun 17 – Jul 10 | L3 Build / embed / retrieval hardening | ✅ done (code complete; runbook written). |
| Jul 8–20 | L4 Website embed QA | 🔶 **active now** — cross-browser/mobile/accessibility. |
| Jul 18–28 | L5 UAT + readiness (incl. student pilot) | ⏳ starts in 2 days — line up stakeholders + cohorts. |
| Aug 1 + 2 wks | L6 Launch & monitoring | ⏳ go-live + iteration. |

> **Date-risk flag:** with ~11 working days left, **L1 security/account
> readiness** remains the item most likely to slip — it depends on
> institutional IT/procurement, not engineering. If Vercel+Neon ownership
> transfer and SOC 2 doc collection aren't locked **this week**, the fixed Aug 1
> date compresses L4/L5. **Content sign-off (L2)** — especially approved
> disclaimer copy — gates a meaningful UAT and must land before L5 begins.

---

## Traceability: every original roadmap item → where it landed

Confirms nothing from the earlier (notes-derived) roadmap was dropped — each item
is either in the Aug 1 launch or explicitly deferred.

| Orig | Item | Lands in | Aug 1? |
|------|------|----------|--------|
| A1 | Legal disclaimer + acceptance gate | **L2** | ✅ launch — **built** (copy pending legal sign-off) |
| A2 | Onboarding / intro experience | **L3** | ✅ launch |
| A3 | Admin historical access | **L3** (trimmed read-only viewer) | ⚪ partial — full search → Phase 2 |
| A4 | Feedback capture (👍/👎 + comment) | **L3** | ✅ launch |
| A5 | Email-on-escalation 24h reply loop | Phase 2 | ❌ deferred |
| B1 | Pilot cohort onboarding | **L5** (as UAT participants) | ✅ launch |
| B2 | Analytics dashboard | **L6** (lightweight view) | ⚪ partial — **lightweight `/monitor` built**; full dashboard → Phase 2 |
| B3 | Pilot feedback triage / fast-follow buffer | **L5–L6** | ✅ launch |
| C1 | Manual training-data editor | Phase 2 (admin console) | ❌ deferred |
| C2 | Source/department tagging surfaced to admins | Phase 2 (admin console) | ❌ deferred |
| D1 | Neon migration | **L1** (paid plan; Enterprise security-gated) | ✅ launch |
| D2 | Campus SSO | Phase 2 | ❌ deferred |
| E1 | Multi-department ingestion | Phase 2 (pattern groundwork in L3) | ❌ deferred |
| E2 | Journeyline (Pre/Post-Campus) | Phase 2 | ❌ deferred |
| E3 | Career Services bundle | Phase 2 | ❌ deferred |
| F1 | AI inside the application tool | Phase 2 | ❌ deferred |
| F2 | Essay Coach v2 | Phase 2 | ❌ deferred |
| F3 | Student account creation / management | Phase 2 (with SSO) | ❌ deferred |

---

## Phase 2 / post-launch backlog (deferred from Aug 1)

Tracked, not abandoned. These came from the meeting notes and the baseline's
"Potential Phase 2 capabilities."

| Item | Source | Est. | Why deferred |
|------|--------|------|--------------|
| **Full backend admin console** (manage content, review conversations, approve suggested answers, configure escalation rules, analytics) | both docs | 🔴 10–15d | Baseline: explicitly future/optional. Full versions of **A3** (searchable conversation history), **B2** (analytics dashboard), **C1** (manual training-data editor), **C2** (source/department tagging surfaced to admins). |
| **Campus SSO / Okta** + authenticated admin/student workflows | both docs | 🔴 6–10d | Baseline: out of scope for public launch. (was D2/F3) |
| **Multi-department bundle** (Housing, NSO, Financial Aid, ISS, Registrar & Advising, Campus Life) | notes | 🟡 3–5d/dept | Baseline: build *reusable pattern* only; don't launch depts by Aug 1. (was E1) |
| **Journeyline (Pre/Post-Campus)** segmentation | notes | 🟡 3–4d | Depends on multi-dept content. (was E2) |
| **Career Services** separate bundle | notes | 🟢 2–3d | Separate namespace; post-launch. (was E3) |
| **Live-agent routing / ticketing** | baseline | 🔴 6d+ | Beyond documented-escalation launch model. |
| **Email-on-escalation 24h reply loop** | notes | 🟡 3–4d | Above the launch "documented contact paths" bar; nice early Phase 2. (was A5) |
| **Essay Coach v2** (needs Scott/Amber language sign-off) | notes | 🟡 3–4d | Outside FAQ/web-content launch scope; was removed in commit `6e38f79`. (was F2) |
| **AI inside the application tool** | notes | 🔴 5–8d | Advanced/authenticated; prototype later. (was F1) |

> **Reuse-pattern caveat (in scope now):** even though departments don't launch
> by Aug 1, the L3 build should keep the `source`-tagged ingestion generic enough
> that adding a department later is config, not a rewrite. That satisfies the
> baseline's "create reusable pattern for other departments" line.

---

## Critical path & risks

- **L1 security/account readiness** is the top date risk — institutional
  IT/procurement lead time, not engineering. Chase Vercel+Neon ownership transfer
  and SOC 2 docs **this week**.
- **L3 website embed** is the largest net-new build and the most visible launch
  surface — start the embed pattern early, not after retrieval hardening.
- **Content sign-off (L2)** gates UAT — approved sources + escalation language +
  disclaimer must land before the test set is meaningful.
- **Neon plan tier:** default to a **paid plan**; only escalate to **Enterprise**
  if the security review demands it (avoids unplanned committed spend).

---

## Tech stack, costs & recommendations

> Costs are **estimates in mid-2026 USD** for planning only — usage-based items
> scale with traffic and vendor pricing changes. **Pilot** = low traffic;
> **Production** = sustained public Admissions traffic post-launch.

### Stack as currently built

| Layer | Technology (in repo) | Used for |
|-------|----------------------|----------|
| Framework / UI | **Next.js 16, React 19, Tailwind 4**, `react-markdown` | App, API routes, chat UI |
| AI orchestration | **Vercel AI SDK (`ai` v6)** + **`@ai-sdk/gateway`** | Streaming, tool calls, routing to models |
| LLM | **OpenAI `gpt-4o-mini`** via AI Gateway (`chat/route.ts`, `query-rewrite.ts`) | Answer generation + query rewriting |
| Embeddings | **OpenAI `text-embedding-3-small`** (1536-dim) | Ingestion + per-query embedding |
| Database | **Postgres + pgvector**, **Drizzle ORM**, `pg` pool | Chunks/vectors, conversations, users, country criteria |
| Scraping | **axios + cheerio**, `p-limit` | Biweekly subdomain re-scrape (Vercel Cron) |
| Auth | **Custom scrypt + httpOnly cookie sessions** (`lib/auth.ts`) | Admin login (no external provider yet) |
| Hosting | **Vercel** (crons) *or* **AWS App Runner + RDS pgvector** (`Dockerfile`, `deploy-aws.sh`) | Two supported deploy paths |

### Cost by component

| Component | Pricing basis | Pilot / mo | Production / mo | Notes |
|-----------|---------------|-----------|-----------------|-------|
| **`gpt-4o-mini`** (chat + rewrite) | ~$0.15 / 1M input, ~$0.60 / 1M output tokens | **$5–25** | **$50–250** | Dominated by RAG context size. Biggest lever: trim retrieved chunk count/size. |
| **`text-embedding-3-small`** | ~$0.02 / 1M tokens | **<$2** | **$2–10** | Cheap. One-time spikes on full re-ingestion; per-query is negligible. |
| **Vercel AI Gateway** | passthrough + small margin / free tier | **~$0** | **low** | Adds routing, fallback, observability over raw OpenAI. |
| **Hosting — Vercel Pro** | ~$20 / member / mo + usage | **$20–40** | **$40–100** | Pro required for the 300s cron `maxDuration`. |
| **Hosting — AWS alt.** (App Runner + RDS) | compute + db instance | **$40–80** | **$80–200** | Already scripted; more ops control, higher floor than Vercel. |
| **Database — Neon (paid plan)** | Launch/Scale ~$19–69 base + usage; Enterprise = custom | **$19–69** | **$69+ (Enterprise only if security-required)** | Baseline requires institution-controlled paid plan; Enterprise is security-gated, not default. |
| **Email (Phase 2 escalation loop)** | Resend free→$20 (50k); SES ~$0.10/1k | **$0** | **$0–20** | Not a launch line item — escalation launches via documented contact paths. |
| **SSO (Phase 2)** | WorkOS free→~$125/connection; or Auth.js (free, self-built) | **$0** | **$0–125+** | Out of Aug 1 scope; see recommendation 2. |
| **Total (launch-relevant)** | | **~$45–135/mo** | **~$160–460/mo** | Excludes staff/legal/IT time and Phase 2 items. |

### Recommendations

1. **Keep `gpt-4o-mini`; gate any upgrade on UAT quality data.** Answer quality is
   mostly bounded by retrieval, not the model. Cheapest quality win is **tuning
   retrieved-chunk count/size** (also the biggest cost lever).

2. **Don't buy SSO from your hosting tier — and don't build it for Aug 1.** SSO is
   Phase 2 per the baseline. When you do it, implement *end-user* SSO in the app
   (**Auth.js** free / more work, or **WorkOS** faster / paid), not via a Vercel
   plan feature. This also informs future student accounts.

3. **Default Neon to a paid plan; escalate to Enterprise only if security says so.**
   Largest, least-predictable line item — get the institution-controlled account +
   billing owner settled in L1 this week.

4. **Stand up usage + cost observability before launch.** Track tokens/cost per
   conversation (AI Gateway provides most of it) and pair with the lightweight
   feedback widget so L6 monitoring has real signal from day one.

5. **Pick one hosting path and commit — Vercel + Neon.** Matches the baseline's
   institution-managed accounts and lowers ops surface. Keep the AWS App Runner
   scripts as a documented fallback only.

6. **Set per-provider billing alerts (OpenAI, Neon, Vercel).** A misconfigured
   re-ingestion loop or a traffic spike is the realistic cost surprise — a cap
   turns that into an alert instead of an invoice.

7. **Build L3 ingestion generically now to bank the "reusable pattern."** Keep
   `source`-tagged ingestion department-agnostic so Phase 2 department launches
   are config, not refactors — satisfies the baseline's reuse goal at near-zero
   extra launch cost.
