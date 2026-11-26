# BYU–Hawaii Admissions Assistant

An AI chatbot that answers questions about BYU–Hawaii from the university's own
web pages. It scrapes BYU–Hawaii subdomains into a Postgres + pgvector
knowledge base, retrieves the relevant pages for each question, and answers with
OpenAI `gpt-4o-mini`, citing its sources. Admins get pages for support
requests, country admission criteria, conversations, monitoring and scraping.

Built with Next.js 16 (App Router), the Vercel AI SDK, Drizzle ORM and Tailwind.

## Quick start

Prerequisites: Node.js 20+, [pnpm](https://pnpm.io), a Postgres database with
the `vector` extension (e.g. [Neon](https://neon.tech)), and an OpenAI API key.

```bash
pnpm install
cp .env.example .env        # then fill in the values (see the file for each one)
pnpm db:migrate             # create tables, indexes and the pgvector extension
pnpm seed:countries         # load data/country-criteria.json
pnpm ingest                 # scrape BYU–Hawaii sites into the knowledge base (~1.5 h)
pnpm dev                    # http://localhost:3000
```

Create the first admin account at `/register` using your `REGISTRATION_KEY`.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Start the dev server on port 3000 |
| `pnpm build` / `pnpm start` | Production build / serve it |
| `pnpm lint` | Run ESLint |
| `pnpm db:migrate` | Create or update the database schema (safe to re-run) |
| `pnpm seed:countries` | Upsert country admission criteria from `data/country-criteria.json` |
| `pnpm ingest` | Re-scrape every site. Only one scrape can run at a time |
| `pnpm ingest -- --only=admissions,housing` | Re-scrape specific sites (commas or spaces) |

## Project structure

```
├── data/
│   └── country-criteria.json   Admission criteria per country (seed data)
├── docs/
│   ├── roadmap.md              Launch plan, backlog, costs
│   ├── runbook.md              Operating, deploying and troubleshooting
│   ├── usage-limits.md         Per-session and global usage caps
│   └── vm-https-cookie-issue.md
├── public/                     Static files, incl. embed.js (website widget)
├── scripts/
│   ├── deploy-aws.sh           Provision + deploy on AWS App Runner
│   ├── start-database.sh       Optional local Postgres in Docker
│   └── vm/                     VM auto-deploy and nightly scrape cron
└── src/
    ├── app/                    Pages (chat, admin pages, auth) and API routes
    │   └── api/                chat, conversations, admin/*, auth/*, cron/scrape …
    ├── components/             Chat UI and shared components
    ├── db/                     Drizzle schema, connection, migrations
    ├── lib/                    AI models, scraper, ingestion, auth, rate limits …
    ├── prompt/                 The bot's system prompt (see below)
    ├── scripts/                CLI entry points for ingest and seeding
    └── proxy.ts                Redirects signed-out visitors away from admin pages
```

## The bot's instructions

The chat route builds its system prompt from two files in `src/prompt/`:

- `soul.md` — who the bot is: identity, voice, tone, house style, values, and
  what it stays away from. Plain Markdown, owned by BYU–Hawaii stakeholders.
  HTML comments are editor notes and are not sent to the model.
- `rules.ts` — what it must get right: answering only from the context, office
  routing, topic accuracy rules (including admissions), and tool and handoff instructions.

`index.ts` joins them with the retrieved context. Keep voice out of
`rules.ts` and facts out of `soul.md`. `soul.md` is read at runtime, so if it
moves, update `outputFileTracingIncludes` in `next.config.ts`.

## Embedding on a website

`public/embed.js` adds the chat as a floating widget on any page; the widget
loads `/embed`. See `docs/runbook.md` for details.

## Deploy on AWS

`scripts/deploy-aws.sh` provisions everything on AWS (RDS Postgres with
pgvector, ECR, App Runner), runs migrations and ingestion, and rolls out the
image. It is idempotent — re-run it to ship a new revision.

```bash
# Prereqs: aws CLI authenticated, docker running, node + pnpm, jq, curl
scripts/deploy-aws.sh /absolute/path/to/this/repo
```

Useful environment overrides: `AWS_REGION`, `APP_NAME`, `DB_INSTANCE_CLASS`,
`APP_RUNNER_CPU`, `APP_RUNNER_MEMORY`, `SKIP_INGEST=1` (skip re-ingestion on
re-runs). Resource IDs and the generated DB password are written to
`.aws-deploy.state` in the project dir — treat it as a secret.

See [`docs/runbook.md`](docs/runbook.md) for operations and troubleshooting.
