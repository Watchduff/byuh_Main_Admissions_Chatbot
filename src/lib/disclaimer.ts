// Launch legal disclaimer shown to every public visitor before they chat
// (ROADMAP L2 / item A1). The full copy below is a working draft and MUST be
// signed off by the institution's legal/compliance reviewer before Aug 1 — the
// version string is bumped whenever the approved wording changes so returning
// visitors are re-prompted to accept the new version.
//
// Acceptance (version + timestamp) is recorded server-side per visitor session
// via POST /api/disclaimer; localStorage is only a UX cache so we don't re-prompt
// on every page load.
export const DISCLAIMER_VERSION = '2026-11-09';

export const DISCLAIMER_TITLE = 'Before you begin';

// Full body shown in the blocking acceptance modal on first visit.
export const DISCLAIMER_PARAGRAPHS: readonly string[] = [
  'This is an AI-powered assistant that answers general questions about BYU–Hawaii using published university information. Its answers may be incomplete or occasionally incorrect.',
  'It cannot access your personal records, such as your application, account, or grades, and it cannot make, guarantee, or predict an official decision. It does not provide official, financial, immigration, or legal advice. For anything that affects you, confirm with the BYU–Hawaii department that owns the topic.',
  'Please do not share sensitive personal information such as government ID numbers, passwords, or financial account details. Conversations may be stored and reviewed to improve the assistant.',
  'By continuing, you acknowledge these limits and agree to use the assistant on this basis.',
];

export const DISCLAIMER_ACCEPT_LABEL = 'I understand and agree';

// One-line reminder shown persistently beneath the chat input on every surface.
export const DISCLAIMER_SHORT =
  'AI assistant — can make mistakes and isn’t an official university decision. Verify important details with the relevant department.';
