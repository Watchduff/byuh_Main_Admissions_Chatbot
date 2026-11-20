import { pool } from '@/db/index';

// Admin-controlled runtime switches stored in `app_settings`.
//
// support_enabled — whether the chatbot may escalate to a human via the
// `redirectToSupport` tool. Defaults to OFF: if the row is missing or the table
// doesn't exist yet (migration not run), escalation stays disabled rather than
// forwarding questions nobody will answer.
export async function isSupportEnabled(): Promise<boolean> {
  try {
    const result = await pool.query<{ value: string }>(
      `SELECT value FROM app_settings WHERE key = 'support_enabled'`
    );
    return result.rows[0]?.value === 'true';
  } catch (err) {
    console.error('[settings] failed to read support_enabled:', err);
    return false;
  }
}

export async function setSupportEnabled(enabled: boolean, updatedBy: string): Promise<void> {
  await pool.query(
    `INSERT INTO app_settings (key, value, updated_by, updated_at)
     VALUES ('support_enabled', $1, $2, NOW())
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [enabled ? 'true' : 'false', updatedBy]
  );
}
