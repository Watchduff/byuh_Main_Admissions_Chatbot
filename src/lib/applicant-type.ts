/**
 * Deterministic "international vs. domestic" clarifying-question gate for
 * admissions questions.
 *
 * Application deadlines, required documents, and transcript timing all differ
 * for international vs. U.S. domestic applicants, and giving the wrong type's
 * answer is actively harmful (the international deadline is months earlier).
 * The system prompt asks the model to clarify the applicant type first, but
 * relying on the LLM to obey one instruction — while it's also staring at a
 * clean deadline table in the retrieved context — proved unreliable: it keeps
 * answering the deadline question directly and skipping the clarification.
 *
 * This module makes the first clarification deterministic. The chat route
 * checks `shouldAskApplicantType` before doing any retrieval or LLM call, and
 * when it returns true it streams the clarifying question straight back (the
 * same short-circuit pattern already used for usage limits). The LLM keeps the
 * "if they repeat without answering, give both, clearly labeled" behavior from
 * the system prompt — this gate only owns the very first ask.
 */

export interface ApplicantTypeMessage {
  role: 'user' | 'assistant';
  text: string;
}

/**
 * The clarifying question the gate streams back. Kept simple and warm to match
 * the bot's "texting a friend" voice, and worded to match the phrasing the
 * system prompt already references so the two stay consistent.
 *
 * The bot serves every department, not just Admissions, so the gate is scoped
 * to admissions questions: a deadline or document question that is clearly
 * about another office (housing, financial aid, registration, …) never
 * triggers it. See `OTHER_OFFICE_PATTERNS`.
 */
export const APPLICANT_TYPE_QUESTION =
  "Happy to help with that! Quick question first — are you applying as an " +
  "**international student** or a **U.S. domestic student**? The deadlines and " +
  "documents are different for each, so I want to make sure I give you the " +
  "right ones. 🙂";

/**
 * Topics whose answer changes with applicant type: application deadlines,
 * required documents, and transcript timing. These are the only topics the
 * gate fires on.
 */
const SENSITIVE_TOPIC_PATTERNS: RegExp[] = [
  // Deadlines / dates to apply.
  /\bdead\s?lines?\b/i,
  /\bdue\s+dates?\b/i,
  /\bcut[-\s]?off\b/i,
  /\blast\s+day\b/i,
  /\bwhen\b[^?.!\n]*\b(apply|application|applications|submit|enroll|admission|admitted)\b/i,
  // Required documents to apply.
  /\b(required|need(ed)?|needing|submit|submitting|which|what|list of)\b[^?.!\n]*\bdocuments?\b/i,
  /\bdocuments?\b[^?.!\n]*\b(need|needed|require[ds]?|submit|apply|application)\b/i,
  /\bwhat\b[^?.!\n]*\b(need|required)\b[^?.!\n]*\b(apply|application)\b/i,
  // Transcript timing (official vs. unofficial, when to send).
  /\btranscripts?\b/i,
];

/**
 * Topics owned by an office other than Admissions. When the latest message is
 * clearly about one of these ("housing deadline", "financial aid documents",
 * "order an official transcript"), the international-vs-domestic question is
 * irrelevant and would derail the answer, so the gate stays quiet. A false
 * negative here is safe: the LLM still carries the clarify-if-unsure rule for
 * admissions topics in its system prompt.
 */
const OTHER_OFFICE_PATTERNS: RegExp[] = [
  /\b(housing|dorms?|hales?|roommates?|tva|apartments?)\b/i,
  /\b(financial\s+aid|scholarships?|fafsa|iwork|loans?|grants?|tuition|payment\s+plans?|refunds?|billing|fees?)\b/i,
  /\b(register|registering|registration|add\/drop|drop\s+(a\s+)?class|class(es)?|courses?|semester|graduat\w*|degree\s+audit|grades?)\b/i,
  /\b(registrar|advis(or|ing)|major|minor|health|immuni[sz]ation|vaccin\w*|counseling|library|career|internships?|clubs?|events?|bookstore|parking|payroll|hr|human\s+resources|jobs?|employment)\b/i,
  /\b(order|request|pick\s+up)\b[^?.!\n]*\btranscripts?\b/i,
];

/**
 * Signals that the student has already made their applicant type clear, so the
 * gate should stay quiet and let the normal flow answer. A false positive here
 * is safe: it just hands the turn to the LLM, which still carries the
 * clarify-if-unsure rule in its system prompt.
 *
 * Note: only the student's own words count — assistant turns routinely mention
 * both "international" and "domestic" (the clarifying question itself does), so
 * scanning assistant text would suppress the gate forever.
 */
const APPLICANT_TYPE_SIGNAL_PATTERNS: RegExp[] = [
  // International
  /\binternational\b/i,
  /\bintl\b/i,
  /\bf-?1\b/i,
  /\bstudent\s+visa\b/i,
  /\bvisa\b/i,
  /\bi-?20\b/i,
  /\bsevis\b/i,
  /\bnot\b[^?.!\n]*\b(u\.?s\.?|american|united\s+states)\b[^?.!\n]*\bcitizen\b/i,
  /\boutside\s+(the\s+)?(u\.?s\.?|united\s+states|america)\b/i,
  // Domestic
  /\bdomestic\b/i,
  /\bu\.?s\.?\s*citizen\b/i,
  /\bamerican\s+citizen\b/i,
  /\bcitizen\s+of\s+(the\s+)?(u\.?s\.?|united\s+states|america)\b/i,
  /\b(in|out)[-\s]of[-\s]?state\b/i,
  /\bgreen\s+card\b/i,
  /\bpermanent\s+resident\b/i,
  /\bfrom\s+(the\s+)?(u\.?s\.?a?|united\s+states|america)\b/i,
  /\bi'?m\s+american\b/i,
  /\bi\s+am\s+american\b/i,
];

/**
 * Was the last assistant turn already the "international or domestic?" question?
 * If so, and the student came back still without stating their type, we must
 * NOT ask again — the system prompt takes over and answers both, clearly
 * labeled. Matches our own wording and any close LLM variant.
 */
const ALREADY_ASKED_PATTERN = /\binternational\b[\s\S]{0,80}\bdomestic\b/i;

/** Does the student's latest message concern a type-sensitive topic? */
export function isApplicantTypeSensitive(text: string): boolean {
  if (OTHER_OFFICE_PATTERNS.some((re) => re.test(text))) return false;
  return SENSITIVE_TOPIC_PATTERNS.some((re) => re.test(text));
}

/** Has the student already revealed which applicant type they are? */
export function hasApplicantTypeSignal(messages: ApplicantTypeMessage[]): boolean {
  const studentText = messages
    .filter((m) => m.role === 'user')
    .map((m) => m.text)
    .join('\n');
  return APPLICANT_TYPE_SIGNAL_PATTERNS.some((re) => re.test(studentText));
}

/** Was the most recent assistant turn already the clarifying question? */
export function alreadyAskedApplicantType(messages: ApplicantTypeMessage[]): boolean {
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  return lastAssistant ? ALREADY_ASKED_PATTERN.test(lastAssistant.text) : false;
}

/**
 * True when the route should short-circuit and ask the clarifying question
 * itself instead of retrieving + calling the LLM.
 *
 * Fires only when: the student's latest message is about a type-sensitive
 * topic, they haven't already told us their type, and we didn't just ask them.
 */
export function shouldAskApplicantType(messages: ApplicantTypeMessage[]): boolean {
  const latestUser = [...messages].reverse().find((m) => m.role === 'user');
  if (!latestUser || latestUser.text.trim().length === 0) return false;
  if (!isApplicantTypeSensitive(latestUser.text)) return false;
  if (hasApplicantTypeSignal(messages)) return false;
  if (alreadyAskedApplicantType(messages)) return false;
  return true;
}
