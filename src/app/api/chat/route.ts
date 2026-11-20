import { chatModel, embeddingModel } from '@/lib/ai';
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  embed,
  jsonSchema,
  stepCountIs,
  streamText,
  tool,
  UIMessage,
} from 'ai';
import { pool } from '@/db/index';
import { getOrCreateSessionId } from '@/lib/session';
import { checkUsageLimits } from '@/lib/rate-limit';
import { isSupportEnabled } from '@/lib/settings';
import { buildSystemPrompt } from '@/prompt';
import { rewriteForRetrieval, type RewriteMessage } from '@/lib/query-rewrite';
import {
  shouldAskApplicantType,
  APPLICANT_TYPE_QUESTION,
} from '@/lib/applicant-type';

export const runtime = 'nodejs';

function extractText(m: UIMessage): string {
  return m.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join(' ');
}

export async function POST(req: Request) {
  const { messages, conversationId }: { messages: UIMessage[]; conversationId: string } = await req.json();
  const sessionId = await getOrCreateSessionId();

  // Pilot usage limits. No-op (and no DB queries) unless USAGE_LIMITS_ENABLED
  // is set — see src/lib/rate-limit.ts and docs/usage-limits.md. When a limit
  // is hit we stream back a friendly notice as the assistant turn instead of
  // erroring, and skip the retrieval + LLM call entirely.
  const limit = await checkUsageLimits(sessionId);
  if (!limit.allowed) {
    const noticeStream = createUIMessageStream({
      execute: async ({ writer }) => {
        const id = 'usage-limit-notice';
        writer.write({ type: 'start' });
        writer.write({ type: 'text-start', id });
        writer.write({ type: 'text-delta', id, delta: limit.message });
        writer.write({ type: 'text-end', id });
      },
    });
    return createUIMessageStreamResponse({ stream: noticeStream });
  }

  // Extract the last user message text
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
  const userText = lastUserMessage ? extractText(lastUserMessage) : '';

  // Collapse the chat into a user/assistant transcript for the rewriter.
  const rewriteHistory: RewriteMessage[] = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role as 'user' | 'assistant', text: extractText(m) }));

  // Save user message & update conversation title if it's the first message
  const client = await pool.connect();
  try {
    await client.query(
      'INSERT INTO chat_messages (conversation_id, role, content) VALUES ($1, $2, $3)',
      [conversationId, 'user', userText]
    );

    // Auto-title: set title to the first user message (truncated)
    const countResult = await client.query(
      'SELECT COUNT(*) as cnt FROM chat_messages WHERE conversation_id = $1',
      [conversationId]
    );
    if (parseInt(countResult.rows[0].cnt) === 1) {
      const title = userText.length > 60 ? userText.slice(0, 57) + '...' : userText;
      await client.query(
        'UPDATE conversations SET title = $1 WHERE id = $2',
        [title, conversationId]
      );
    }
  } finally {
    client.release();
  }

  // Deterministic applicant-type gate. Deadlines, required documents, and
  // transcript timing all differ for international vs. U.S. domestic
  // applicants, so answering with the wrong type's dates is harmful. The
  // system prompt asks the model to clarify first, but gpt-4o-mini keeps
  // ignoring that when a clean deadline table is sitting in the retrieved
  // context. When the student asks one of these questions without having said
  // which type they are, short-circuit here and ask — no retrieval, no LLM —
  // the same pattern used for usage limits above. The gate only fires for
  // admissions-type questions; deadline or document questions that belong to
  // another office (housing, financial aid, …) pass straight through. (If they repeat the question
  // without answering, this gate stays quiet and the LLM answers both types,
  // clearly labeled, per the system prompt.)
  if (shouldAskApplicantType(rewriteHistory)) {
    const clarifyStream = createUIMessageStream({
      execute: async ({ writer }) => {
        const id = 'applicant-type-clarify';
        writer.write({ type: 'start' });
        writer.write({ type: 'text-start', id });
        writer.write({ type: 'text-delta', id, delta: APPLICANT_TYPE_QUESTION });
        writer.write({ type: 'text-end', id });

        // Persist the clarifying question as the assistant turn so it shows up
        // in history/admin views and so the "already asked" check sees it on
        // the next request.
        const saveClient = await pool.connect();
        try {
          const saved = await saveClient.query<{ id: number }>(
            'INSERT INTO chat_messages (conversation_id, role, content, sources) VALUES ($1, $2, $3, $4) RETURNING id',
            [conversationId, 'assistant', APPLICANT_TYPE_QUESTION, JSON.stringify([])]
          );
          writer.write({
            type: 'data-persisted',
            data: { messageId: saved.rows[0].id },
            transient: true,
          });
        } finally {
          saveClient.release();
        }
      },
    });
    return createUIMessageStreamResponse({ stream: clarifyStream });
  }

  // Rewrite short follow-ups ("who do I contact?", "I was asking about
  // admissions") into a standalone query using the prior turns. This replaces
  // the old keyword router, which had two structural problems: it could only
  // cover topics listed in a hand-written table (so "vaccination", "health",
  // and similar long-tail topics defaulted to the weakest Admissions bucket),
  // and it didn't respect when the student explicitly re-stated their topic
  // mid-conversation. With a rewritten standalone query, pure vector search
  // over all subdomains produces much more relevant context.
  const searchQuery = await rewriteForRetrieval(rewriteHistory);

  // Embed the rewritten standalone query so follow-ups retrieve against the
  // full topic, not just the last short sentence.
  const { embedding } = await embed({
    model: embeddingModel,
    value: searchQuery,
  });
  const embeddingStr = '[' + embedding.join(',') + ']';

  // Pure vector search across all subdomains. The rewritten query carries
  // enough topical signal that we no longer need to bias the ranking toward a
  // specific subdomain — the right office's pages win on relevance.
  // TOP_K has some slack because date-heavy Registrar/Housing calendar chunks
  // cluster tightly around deadline questions: "when is the spring deadline"
  // ranks the admissions deadlines page at #11, one slot outside a top-10.
  const TOP_K = 15;
  // Sources with a raw cosine distance worse than this are only tangentially
  // related to the query; we still pass them to the LLM as context, but we
  // don't advertise them as citations to the user.
  const MAX_SOURCE_DISTANCE = 0.7;

  const searchClient = await pool.connect();
  // IVFFlat with the default probes=1 searches only 1 of the index's 100 lists
  // and can miss genuinely-relevant chunks entirely (it dropped the
  // application-deadlines page for "Spring application deadline" questions).
  // probes=10 matches exact-search results at our table size (~1.1k chunks)
  // for negligible cost.
  await searchClient.query('SET ivfflat.probes = 10');
  let context = '';
  const sources: Array<{ url: string; title: string }> = [];
  try {
    const result = await searchClient.query(
      `SELECT content, url, title, source,
              (embedding <=> $1::vector)::float AS raw_distance
         FROM byuh_chunks
         ORDER BY raw_distance ASC
         LIMIT $2`,
      [embeddingStr, TOP_K]
    );
    context = result.rows
      .map((r: { url: string; content: string; source: string }) =>
        `[From: ${r.url} (${r.source})]\n${r.content}`
      )
      .join('\n\n---\n\n');

    // Deduplicate sources by URL. Drop entries that look off-topic so we
    // don't cite, e.g., a financial-aid loan page on an admissions GPA
    // question (which is exactly what users were complaining about).
    const seen = new Set<string>();
    for (const r of result.rows as Array<{
      url: string;
      title: string;
      content: string;
      source: string;
      raw_distance: number;
    }>) {
      if (r.raw_distance > MAX_SOURCE_DISTANCE) continue;
      if (seen.has(r.url)) continue;
      seen.add(r.url);
      sources.push({ url: r.url, title: r.title || r.url });
    }
    // Cap shown sources so the UI doesn't get overwhelmed.
    if (sources.length > 5) sources.length = 5;
  } finally {
    searchClient.release();
  }

  // Human handoff is admin-toggleable from /support. When it's off, the
  // redirectToSupport tool isn't offered and the prompt tells the model it
  // can't hand off to a person.
  const supportEnabled = await isSupportEnabled();

  // Persona (src/prompt/soul.md) + rules and tool instructions
  // (src/prompt/rules.ts) + the retrieved context.
  const systemPrompt = buildSystemPrompt({ supportEnabled, context });

  const getCountryCriteria = tool({
    description:
      "Look up BYU–Hawaii's official admission criteria for a specific country. " +
      "Returns the current academic requirements, English-test requirement, optional submissions, " +
      "expired (no-longer-accepted) criteria, and documents not accepted — plus the universal " +
      '"ALL STUDENTS" rules that apply to everyone. ' +
      'Call this whenever the student asks about admission requirements for a specific country, ' +
      "or when the student's country is known from earlier in the conversation. " +
      'If no exact match is found, the response includes the list of valid country names so you can ' +
      'try again with the closest match or ask the student to clarify.',
    inputSchema: jsonSchema<{ country: string }>({
      type: 'object',
      additionalProperties: false,
      properties: {
        country: {
          type: 'string',
          description:
            "The country name to look up, exactly as the student referred to it (e.g. 'Philippines', 'United States', 'Japan'). Case-insensitive.",
        },
      },
      required: ['country'],
    }),
    execute: async ({ country }) => {
      const toolClient = await pool.connect();
      try {
        const trimmed = country.trim();
        const exact = await toolClient.query(
          `SELECT region, country, current_academic_criteria, english_test_required,
                  optional_to_submit, expired_country_criteria, not_accepted
             FROM country_criteria
            WHERE LOWER(country) = LOWER($1)
            LIMIT 1`,
          [trimmed]
        );

        let match = exact.rows[0];
        if (!match) {
          const fuzzy = await toolClient.query(
            `SELECT region, country, current_academic_criteria, english_test_required,
                    optional_to_submit, expired_country_criteria, not_accepted
               FROM country_criteria
              WHERE country ILIKE $1
              ORDER BY LENGTH(country) ASC
              LIMIT 1`,
            [`%${trimmed}%`]
          );
          match = fuzzy.rows[0];
        }

        const universal = await toolClient.query(
          `SELECT current_academic_criteria, english_test_required,
                  optional_to_submit, expired_country_criteria, not_accepted
             FROM country_criteria
            WHERE LOWER(country) = LOWER('ALL STUDENTS')
            LIMIT 1`
        );

        if (!match) {
          const all = await toolClient.query(
            `SELECT country FROM country_criteria ORDER BY country ASC`
          );
          return {
            found: false,
            message: `No country criteria found for "${country}".`,
            validCountries: all.rows.map((r: { country: string }) => r.country),
            universalRules: universal.rows[0] ?? null,
          };
        }

        return {
          found: true,
          country: match,
          universalRules: universal.rows[0] ?? null,
        };
      } finally {
        toolClient.release();
      }
    },
  });

  const redirectToSupport = tool({
    description:
      "Forward the student's question to a human BYU–Hawaii support team member who will reply asynchronously. " +
      'Only call this when the student explicitly asks to be connected to a human, a support team member, an advisor, or a real person. ' +
      'Do NOT call this just because a question is hard — you may suggest the option in plain text, but wait for the student to agree before calling the tool.',
    inputSchema: jsonSchema<{ reason: string; question: string }>({
      type: 'object',
      additionalProperties: false,
      properties: {
        reason: {
          type: 'string',
          description:
            "One sentence explaining why this is being escalated (e.g. 'student asked to talk to a human about transfer credits').",
        },
        question: {
          type: 'string',
          description:
            "The specific question the support team member should answer, paraphrased clearly from the student's latest message.",
        },
      },
      required: ['reason', 'question'],
    }),
    execute: async ({ reason, question }) => {
      const toolClient = await pool.connect();
      try {
        await toolClient.query(
          `INSERT INTO human_help_requests (conversation_id, user_question, reason)
           VALUES ($1, $2, $3)`,
          [conversationId, question, reason]
        );
      } finally {
        toolClient.release();
      }
      return {
        success: true,
        message:
          'The question has been forwarded to a BYU–Hawaii support team member. They will reply in this same chat.',
      };
    },
  });

  const textResult = streamText({
    model: chatModel,
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
    tools: supportEnabled
      ? { getCountryCriteria, redirectToSupport }
      : { getCountryCriteria },
    // Allow up to two tool calls (e.g. retry getCountryCriteria with a corrected
    // name, or call it then escalate via redirectToSupport) plus a final
    // assistant message to the student.
    stopWhen: stepCountIs(5),
  });

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      // Write start event, then RAG source parts, then merge the text stream
      writer.write({ type: 'start' });
      for (const source of sources) {
        writer.write({
          type: 'source-url',
          sourceId: source.url,
          url: source.url,
          title: source.title,
        });
      }
      writer.merge(textResult.toUIMessageStream({ sendStart: false }));

      // Persist the finished assistant message once the text is fully
      // generated, then tell the client its DB id so the 👍/👎 control can
      // attach feedback to this exact answer. Emitted as a transient part: the
      // client reads it via onData but it is not stored in message history.
      const finalText = await textResult.text;
      const saveClient = await pool.connect();
      try {
        const saved = await saveClient.query<{ id: number }>(
          'INSERT INTO chat_messages (conversation_id, role, content, sources) VALUES ($1, $2, $3, $4) RETURNING id',
          [conversationId, 'assistant', finalText, JSON.stringify(sources)]
        );
        writer.write({
          type: 'data-persisted',
          data: { messageId: saved.rows[0].id },
          transient: true,
        });
      } finally {
        saveClient.release();
      }
    },
  });

  return createUIMessageStreamResponse({ stream });
}
