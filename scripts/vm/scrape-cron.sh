#!/usr/bin/env bash
# Scheduled scraping for the BYU–Hawaii VM (run from the ubuntu user's crontab).
# Scheduling lives on the VM only; vercel.json has no crons.
#
#   scrape-cron.sh nightly   one batch of whatever is due (09:00 UTC)
#   scrape-cron.sh queued    one batch of subdomains queued from /scraping
#                            (every 30 minutes, at :15 and :45; does nothing if none are queued)
#
# Calls the app running under pm2 on this machine. The bearer token is read
# from the app's .env (CRON_SECRET) so it lives in one place. flock skips a
# run while the previous one is still going.
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/byuh-admissions-bot}"
APP_URL="${SCRAPE_APP_URL:-http://127.0.0.1:3000}"
LOG="${SCRAPE_LOG:-$HOME/logs/scrape-cron.log}"

case "${1:-}" in
  nightly) path="/api/cron/scrape" ;;
  queued)  path="/api/cron/scrape?queued=1" ;;
  *) echo "usage: $0 nightly|queued" >&2; exit 2 ;;
esac

secret="$(grep -E '^CRON_SECRET=' "$APP_DIR/.env" | tail -1 | cut -d= -f2- | tr -d '"'"'"'')"
if [ -z "$secret" ]; then
  echo "$(date -u +%FT%TZ) $1 skipped: CRON_SECRET missing from $APP_DIR/.env" >>"$LOG"
  exit 1
fi

mkdir -p "$(dirname "$LOG")"
exec 9>"/tmp/byuh-scrape-cron.lock"
flock -n 9 || exit 0

# A batch runs for up to ~5 minutes.
# The header is read from a pipe (-H @file) so the secret never shows up in
# the process list.
body="$(curl -sS -m 330 -w '\n%{http_code}' -H @<(printf 'Authorization: Bearer %s\n' "$secret") "$APP_URL$path" 2>&1 || true)"
code="$(printf '%s' "$body" | tail -1)"
summary="$(printf '%s' "$body" | sed '$d' | head -c 400 | tr '\n' ' ')"

# Idle queue checks are the common case; only log runs that did something.
case "$summary" in
  *'"outcome":"idle"'*) ;;
  *) echo "$(date -u +%FT%TZ) $1 HTTP $code $summary" >>"$LOG" ;;
esac
