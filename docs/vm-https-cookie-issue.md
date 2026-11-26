# VM login / HTTPS cookie issue

## Summary

Login works on Vercel but **silently fails on the internal BYUH VM**: the
"Sign in" button flips to "Signing in…" and then back to "Sign in" with no error
message. The root cause is that the VM is served over **plain HTTP**, and our
session cookie is marked `Secure` — which browsers refuse to store over HTTP.

This document explains the problem, the temporary workaround now in place
(Option 2), and what we need to do to fix it properly (Option 1).

## The problem

Authentication is custom (not NextAuth). On a successful login,
`createSession()` in `src/lib/auth.ts` sets an httpOnly session cookie
(`byuh_admin_session`) and returns `200`. The page then navigates to a protected
route (`/support`), and `src/proxy.ts` checks that the session cookie is
present before allowing access.

The cookie was previously set with:

```ts
secure: process.env.NODE_ENV === 'production'
```

Both Vercel and the VM run in production mode (`NODE_ENV=production`), so the
cookie always carried the **`Secure`** flag. A `Secure` cookie is only stored
and sent by browsers over an **HTTPS** connection.

- **Vercel** is served over HTTPS → the cookie is stored → login works.
- **The BYUH VM** is served over plain **`http://`** (internal host behind the
  GlobalProtect VPN, no TLS certificate) → the browser **silently discards** the
  `Set-Cookie` → no cookie is stored.

The exact failure sequence on the VM:

1. `POST /api/auth/login` verifies the password, creates the session row in Neon,
   and returns `200` with `Set-Cookie: byuh_admin_session=…; Secure`.
2. The browser drops the cookie because the page is HTTP, not HTTPS.
3. The login page runs `router.replace('/support')`.
4. `proxy.ts` sees **no** session cookie and redirects back to `/login`.
5. The button reverts to "Sign in" with **no error** — because the API call
   itself genuinely succeeded; only the cookie was lost.

This also explains why other things appear to work on the VM:

- **Viewing the home page** needs no auth cookie.
- **Registering a user** (`POST /api/auth/register`) only inserts a row; it does
  not depend on a cookie surviving the round trip.
- **DB writes** succeed from both servers because the database (Neon) is shared
  and reachable from both — the problem was never the database.

### How to confirm

On the VM, open browser DevTools → **Network** → submit login → click the
`login` request → **Response Headers**: you'll see
`Set-Cookie: byuh_admin_session=…; Secure`. Then check **Application → Cookies**:
the cookie will be **absent**. If the address bar shows `http://`, that confirms
the diagnosis.

## Temporary solution (Option 2) — in place now

We gate the `Secure` flag on an explicit environment variable instead of hard-
wiring it to `NODE_ENV`. The logic lives in `src/lib/cookies.ts`:

```ts
export function useSecureCookies(): boolean {
  if (process.env.COOKIE_SECURE === 'false') return false;
  if (process.env.COOKIE_SECURE === 'true') return true;
  return process.env.NODE_ENV === 'production';
}
```

Both cookie call sites use it:

- `src/lib/auth.ts` — the admin session cookie (`byuh_admin_session`).
- `src/lib/session.ts` — the visitor/chat session cookie (`byuh_session`).
  Because `SameSite=None` *requires* `Secure`, this cookie now falls back to
  `SameSite=Lax` whenever cookies aren't secure.

### What to set on the VM

In the VM's environment (e.g. the pm2 ecosystem file or the shell that starts
pm2), set:

```
COOKIE_SECURE=false
```

Then restart the app so pm2 picks up the new env:

```
pm2 restart <app-name> --update-env
```

**Do not** set `COOKIE_SECURE` on Vercel. With it unset, Vercel keeps the
secure-in-production default and continues to work exactly as before.

### Tradeoffs / caveats of the workaround

- On the VM, the session cookie now travels in **cleartext** over HTTP. This is
  only acceptable because the VM is reachable solely over the internal
  GlobalProtect VPN, not the public internet.
- The embeddable chat iframe (third-party cookie via `SameSite=None`) will not
  persist a visitor session over HTTP on the VM. First-party use is unaffected.
- This is a stopgap. It reduces security and should be removed once the VM has
  HTTPS.

## Long-term fix (Option 1) — what we still need to do

**Serve the VM over HTTPS** and remove the workaround. Steps:

1. Put a TLS-terminating reverse proxy (nginx or Caddy) in front of the pm2
   process on the VM, or front it with the campus load balancer / ingress that
   already does TLS.
2. Obtain a certificate — a campus/internal CA cert is fine since access is
   VPN-only; Caddy with an internal CA makes this nearly automatic.
3. Serve the app on `https://` and redirect `http://` → `https://`.
4. Remove `COOKIE_SECURE=false` from the VM environment (and restart with
   `--update-env`) so cookies are `Secure` again everywhere.
5. Once HTTPS is confirmed everywhere, we can optionally delete
   `src/lib/cookies.ts` and revert both call sites to a plain secure-in-prod
   flag — though keeping the helper is harmless and leaves the door open for
   future non-TLS hosts.

After Option 1 is in place, the admin cookie is `Secure` again and the chat embed
regains its `SameSite=None` third-party behavior.
