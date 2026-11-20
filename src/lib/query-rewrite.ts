import { chatModel } from '@/lib/ai';
import { generateText } from 'ai';

export interface RewriteMessage {
  role: 'user' | 'assistant';
  text: string;
}

const MAX_CONTEXT_TURNS = 6;

/**
 * Rewrite the student's latest message into a standalone, retrieval-friendly
 * query using recent conversation context. This replaces the old keyword
 * router: instead of guessing a subdomain from brittle keyword lists, we let
 * an LLM fold the prior turns into the query so the embedding search has
 * enough signal to find the right pages across all subdomains.
 *
 * Follow-ups like "who do I contact?" or "I was asking about admissions"
 * are the main failure mode for raw-embedding retrieval — the rewriter
 * expands them into self-contained queries that actually describe the topic.
 *
 * Returns the raw user text when there is no prior context, so the first
 * turn skips the rewrite call entirely.
 */
export async function rewriteForRetrieval(
  messages: RewriteMessage[]
): Promise<string> {
  const conversation = messages.filter((m) => m.text.trim().length > 0);
  const latest = [...conversation].reverse().find((m) => m.role === 'user');
  if (!latest) return '';

  const prior = conversation.slice(0, conversation.lastIndexOf(latest));
  if (prior.length === 0) return latest.text;

  const recent = conversation.slice(-MAX_CONTEXT_TURNS);
  const transcript = recent
    .map((m) => `${m.role === 'user' ? 'Student' : 'Assistant'}: ${m.text}`)
    .join('\n');

  try {
    const { text } = await generateText({
      model: chatModel,
      system: `You rewrite a student's latest chat message into a self-contained search query for a BYU–Hawaii knowledge base.

Guidelines:
- Preserve the student's intent. Do not invent topics they didn't mention.
- Resolve pronouns and short follow-ups using prior turns. Example: after a turn about on-campus housing, "how much does it cost?" becomes "how much does on-campus housing at BYU–Hawaii cost".
- If the student points back to an earlier topic ("I was asking about admissions", "I meant the Medical Center"), make the rewritten query reflect that topic.
- Expand obvious acronyms inline the first time (GPA, FAFSA, I-20, SEVIS, TOEFL, IWORK).
- Keep it concise — one sentence or a short keyword phrase, under 25 words.
- Do NOT answer the question. Only rewrite it.
- Output ONLY the rewritten query. No quotes, no preamble, no explanation.`,
      prompt: `Recent conversation:
${transcript}

Rewrite the student's last message as a standalone BYU–Hawaii search query.`,
    });

    const cleaned = text.trim().replace(/^["']|["']$/g, '').trim();
    return cleaned.length > 0 ? cleaned : latest.text;
  } catch (err) {
    console.warn('Query rewrite failed, falling back to raw user text:', (err as Error).message);
    return latest.text;
  }
}
