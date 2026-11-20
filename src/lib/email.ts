// Minimal transactional-email sender used for internal admin notifications
// (currently: new support ticket alerts). Uses the Resend HTTP API directly
// rather than pulling in an SDK, matching this codebase's preference for a
// small dependency footprint.
//
// Requires RESEND_API_KEY. Without it, sends are skipped with a console
// warning rather than throwing — a missing/misconfigured mail provider
// should never block the underlying action (e.g. creating a ticket).
const RESEND_API_URL = 'https://api.resend.com/emails';

export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.SUPPORT_EMAIL_FROM || 'BYU-Hawaii Assistant <onboarding@resend.dev>';

  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY not set — skipping email:', opts.subject);
    return;
  }

  try {
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: opts.subject,
        text: opts.text,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[email] Resend API error ${res.status}: ${body}`);
    }
  } catch (err) {
    console.error('[email] Failed to send email:', err);
  }
}
