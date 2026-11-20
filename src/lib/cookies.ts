/**
 * Whether auth/session cookies should carry the `Secure` flag.
 *
 * Browsers only store and send `Secure` cookies over HTTPS. Our internal BYUH
 * VM is currently served over plain HTTP (behind the GlobalProtect VPN, no TLS
 * cert), so a `Secure` cookie is silently dropped there and login appears to
 * fail with no error. Set `COOKIE_SECURE=false` in that host's environment so
 * cookies are stored over HTTP. Everywhere else (Vercel/HTTPS) it defaults to
 * secure in production.
 *
 * This is a temporary workaround — see docs/vm-https-cookie-issue.md. The real
 * fix is to put the VM behind HTTPS and remove the override.
 */
export function useSecureCookies(): boolean {
  if (process.env.COOKIE_SECURE === 'false') return false;
  if (process.env.COOKIE_SECURE === 'true') return true;
  return process.env.NODE_ENV === 'production';
}
