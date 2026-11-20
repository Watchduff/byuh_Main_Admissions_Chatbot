import type { NextConfig } from "next";
import { execSync } from "node:child_process";

// What this build contains, for the admin Version page: when it was built and
// the last few commits. Captured at build time and inlined into the bundle, so
// it describes the code actually running (the VM builds each deploy from its
// own checkout; on Vercel, git history may be missing, so fall back to the
// commit Vercel reports).
function buildInfo(): string {
  type Commit = { sha: string; author: string; date: string | null; subject: string };
  let commits: Commit[] = [];
  try {
    const out = execSync("git log -5 --format=%H%x1f%an%x1f%cI%x1f%s", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    commits = out
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [sha, author, date, subject] = line.split("\x1f");
        return { sha, author, date, subject };
      });
  } catch {
    // No git (or no history) in this build environment.
  }
  if (commits.length === 0 && process.env.VERCEL_GIT_COMMIT_SHA) {
    commits = [
      {
        sha: process.env.VERCEL_GIT_COMMIT_SHA,
        author: process.env.VERCEL_GIT_COMMIT_AUTHOR_NAME ?? "",
        date: null,
        subject: (process.env.VERCEL_GIT_COMMIT_MESSAGE ?? "").split("\n")[0],
      },
    ];
  }
  return JSON.stringify({ builtAt: new Date().toISOString(), commits });
}

// Origins allowed to embed the chat in an iframe. Space-separated, overridable
// via env so non-prod/staging hosts can be added without a code change. These
// feed the `frame-ancestors` CSP directive on the /embed route.
const embedAllowedAncestors =
  process.env.EMBED_ALLOWED_ANCESTORS ?? "https://*.byuh.edu https://byuh.edu";

const nextConfig: NextConfig = {
  env: {
    BUILD_INFO: buildInfo(),
  },
  output: "standalone",
  // The chat route reads its persona from src/prompt/soul.md at runtime, so the
  // file has to ship with the route's server bundle (standalone and Vercel).
  outputFileTracingIncludes: {
    "/api/chat": ["./src/prompt/soul.md"],
  },
  async headers() {
    return [
      {
        // The embeddable chat surface. `frame-ancestors` both *permits* the
        // approved BYU–Hawaii origins to frame it and *blocks* everyone else
        // (replacing the implicit allow-all and any X-Frame-Options DENY).
        source: "/embed",
        headers: [
          {
            key: "Content-Security-Policy",
            value: `frame-ancestors 'self' ${embedAllowedAncestors};`,
          },
        ],
      },
      {
        // The loader is fetched cross-origin via <script src>; allow that and
        // force revalidation so host pages do not keep stale widget
        // placement/color behavior in normal browser sessions.
        source: "/embed.js",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
