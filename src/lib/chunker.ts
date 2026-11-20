/**
 * Split plain text into chunks of roughly `chunkSize` characters with
 * `overlap` characters of overlap between consecutive chunks.
 *
 * Unlike a naive sliding-window split, this chunker prefers to break at
 * natural boundaries — paragraph breaks first, then single newlines,
 * then sentence terminators. That keeps logically related material
 * (like a list of admission GPA tiers) together in a single chunk,
 * which dramatically improves retrieval relevance.
 *
 * If no good boundary exists in the back half of the window we fall
 * back to a hard cut so very long runs of unpunctuated text still get
 * chunked rather than producing one huge chunk.
 */
export function chunkText(text: string, chunkSize = 1500, overlap = 200): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized.length) return [];
  if (normalized.length <= chunkSize) return [normalized];

  const chunks: string[] = [];
  // Only look for a boundary in the back 40% of the window — cutting
  // earlier than that wastes too much of the chunk budget.
  const MIN_BREAK_FRACTION = 0.6;
  let start = 0;

  while (start < normalized.length) {
    let end = Math.min(start + chunkSize, normalized.length);

    if (end < normalized.length) {
      const minBreak = Math.floor(chunkSize * MIN_BREAK_FRACTION);
      const window = normalized.slice(start, end);
      // Preferred break points, best first.
      const candidates = [
        window.lastIndexOf('\n\n'),
        window.lastIndexOf('\n'),
        window.lastIndexOf('. '),
        window.lastIndexOf('? '),
        window.lastIndexOf('! '),
      ].filter((idx) => idx >= minBreak);

      if (candidates.length > 0) {
        // Use the latest acceptable break point so we keep as much
        // content in the chunk as possible.
        end = start + Math.max(...candidates) + 1;
      }
    }

    const chunk = normalized.slice(start, end).trim();
    if (chunk.length > 0) chunks.push(chunk);

    if (end >= normalized.length) break;
    // Advance by chunkSize - overlap, but guarantee forward progress
    // even if the semantic break landed deep in the chunk.
    start = Math.max(end - overlap, start + 1);
  }

  return chunks;
}
