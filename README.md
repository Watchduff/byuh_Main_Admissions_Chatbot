This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

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

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

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
