import { readFileSync } from 'fs';
import path from 'path';
import { COUNTRY_CRITERIA_TOOL, RULES, supportSection } from './rules';

// soul.md is read from disk so stakeholders can edit it as plain Markdown. It's
// bundled with the chat route via `outputFileTracingIncludes` in
// next.config.ts — keep that path in sync if this file moves.
const SOUL_PATH = path.join(process.cwd(), 'src/prompt/soul.md');

let soulCache: string | undefined;

/** soul.md with its editor notes (HTML comments) stripped. Read once per process. */
export function loadSoul(): string {
  if (soulCache === undefined) {
    soulCache = readFileSync(SOUL_PATH, 'utf8')
      .replace(/<!--[\s\S]*?-->/g, '')
      .trim();
  }
  return soulCache;
}

export interface SystemPromptInput {
  /** Whether the redirectToSupport tool is offered this turn. */
  supportEnabled: boolean;
  /** Retrieved page sections, already formatted with their [From: …] tags. */
  context: string;
}

/** The full system prompt: who the bot is, then the rules, the tools, and the retrieved context. */
export function buildSystemPrompt({ supportEnabled, context }: SystemPromptInput): string {
  return [
    loadSoul(),
    RULES,
    COUNTRY_CRITERIA_TOOL,
    supportSection(supportEnabled),
    `Context:\n${context}`,
  ].join('\n\n');
}
