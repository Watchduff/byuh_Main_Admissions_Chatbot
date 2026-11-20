import { openai } from '@ai-sdk/openai';
import { APICallError } from 'ai';

// Models are called directly through OpenAI; the key comes from OPENAI_API_KEY.
export const chatModel = openai('gpt-4o-mini');
export const embeddingModel = openai.embedding('text-embedding-3-small');

/** True if the error (or anything it wraps) is OpenAI rejecting the API key. */
export function isAuthError(err: unknown): boolean {
  let e: unknown = err;
  for (let depth = 0; e && depth < 5; depth++) {
    if (APICallError.isInstance(e) && (e.statusCode === 401 || e.statusCode === 403)) return true;
    const obj = e as { lastError?: unknown; cause?: unknown };
    e = obj.lastError ?? obj.cause;
  }
  return false;
}
