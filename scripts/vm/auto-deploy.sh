#!/usr/bin/env bash
# Auto-deploy for the BYU–Hawaii VM (run from the ubuntu user's crontab).
#
# The VM is on a private network, so GitHub can't notify it about pushes.
# Instead this checks the tip of `main` (one tiny `git ls-remote`, no database)
# and, when it has changed, builds the new commit in its own folder:
#
#   ~/releases/<sha>/        one folder per deployed commit (git worktrees)
#   ~/byuh-admissions-bot    symlink to the live release (pm2 runs from here)
#   ~/shared/.env            the app's env file, linked into every release
#   ~/shared/repo.git        local bare copy of the repo, so updates only
#                            download what changed
#
# The live site is only switched over after install + build succeed, and it
# switches back if the site doesn't answer after the restart. A commit that
# fails is not retried until a newer one is pushed (delete
# ~/shared/.deploy-failed-sha to retry it). The last KEEP releases are kept.
#
#   auto-deploy.sh            deploy if main has moved (what cron runs)
#   auto-deploy.sh <sha>      deploy that commit now (setup / manual rollback)
set -euo pipefail

REPO_URL="git@github.com:innovatorsdna/byuh-admissions-bot.git"
BRANCH="main"
PM2_NAME="byuh-admissions-bot"
APP_LINK="$HOME/byuh-admissions-bot"
RELEASES="$HOME/releases"
SHARED="$HOME/shared"
CACHE="$SHARED/repo.git"
FAILED_MARK="$SHARED/.deploy-failed-sha"
HEALTH_URL="http://127.0.0.1:3000/login"
KEEP=3
LOG="$HOME/logs/deploy.log"
# Held by scripts/vm/scrape-cron.sh while a scheduled scrape batch runs.
SCRAPE_LOCK="/tmp/byuh-scrape-cron.lock"

export GIT_SSH_COMMAND="ssh -o BatchMode=yes -o ConnectTimeout=15"
export NVM_DIR="$HOME/.nvm"
set +u # nvm.sh reads unset variables
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"
set -u

mkdir -p "$RELEASES" "$SHARED" "$(dirname "$LOG")"
log() { echo "$(date -u +%FT%TZ) $*" >>"$LOG"; }

exec 9>/tmp/byuh-auto-deploy.lock
flock -n 9 || exit 0

# --- What should be live? ----------------------------------------------------
if [ -n "${1:-}" ]; then
  target="$1"
  forced=1
else
  forced=0
  target="$(git ls-remote "$REPO_URL" "refs/heads/$BRANCH" 2>/dev/null | cut -f1 || true)"
  [ -n "$target" ] || exit 0 # GitHub unreachable (VPN, outage): try next time
fi

current=""
[ -L "$APP_LINK" ] && current="$(basename "$(readlink -f "$APP_LINK")")"
if [ "$forced" = 0 ]; then
  [ "$target" = "$current" ] && exit 0
  [ "$target" = "$(cat "$FAILED_MARK" 2>/dev/null || true)" ] && exit 0
fi

log "deploying ${target:0:7} (live: ${current:0:7})"

# --- Build it in its own folder --------------------------------------------
[ -d "$CACHE" ] || git clone -q --bare "$REPO_URL" "$CACHE"
git -C "$CACHE" fetch -q origin "+refs/heads/$BRANCH:refs/heads/$BRANCH"
target="$(git -C "$CACHE" rev-parse "$target^{commit}")"
new="$RELEASES/$target"

fail() {
  log "FAILED ${target:0:7}: $*"
  echo "$target" >"$FAILED_MARK"
  exit 1
}

if [ "$target" != "$current" ]; then
  if [ -d "$new" ]; then
    rm -rf "$new"
    git -C "$CACHE" worktree prune
  fi
  git -C "$CACHE" worktree add -q --detach "$new" "$target" || fail "checkout"
  ln -sfn "$SHARED/.env" "$new/.env"
  (cd "$new" && pnpm install --frozen-lockfile >>"$LOG" 2>&1) || fail "pnpm install (see log above)"
  (cd "$new" && pnpm build >>"$LOG" 2>&1) || fail "pnpm build (see log above)"
fi

# --- Switch over -------------------------------------------------------------
# Don't cut a scheduled scrape batch off mid-way (they last up to ~5 min).
flock -w 360 "$SCRAPE_LOCK" true || true

if [ -d "$APP_LINK" ] && [ ! -L "$APP_LINK" ]; then
  # First run: the app still lives in a plain checkout. Keep it as the
  # fallback and replace it with the symlink.
  previous="$APP_LINK.pre-releases-$(date -u +%Y%m%d%H%M%S)"
  mv "$APP_LINK" "$previous"
  log "moved the old checkout to $previous"
else
  previous="$(readlink -f "$APP_LINK" 2>/dev/null || true)"
fi

switch_to() {
  ln -sfn "$1" "$APP_LINK.tmp"
  mv -T "$APP_LINK.tmp" "$APP_LINK"
  pm2 restart "$PM2_NAME" --update-env >/dev/null
}

healthy() {
  for _ in $(seq 1 30); do
    [ "$(curl -s -o /dev/null -m 5 -w '%{http_code}' "$HEALTH_URL")" = 200 ] && return 0
    sleep 2
  done
  return 1
}

switch_to "$new"
if ! healthy; then
  if [ -n "$previous" ] && [ "$previous" != "$new" ] && [ -d "$previous" ]; then
    switch_to "$previous"
    fail "site didn't respond after restart; switched back to $(basename "$previous" | cut -c1-7)"
  fi
  fail "site didn't respond after restart"
fi
pm2 save >/dev/null
rm -f "$FAILED_MARK"
log "live: ${target:0:7}"

# --- Keep the newest KEEP releases (never the live one) ---------------------
live="$(readlink -f "$APP_LINK")"
# shellcheck disable=SC2012
ls -1dt "$RELEASES"/*/ 2>/dev/null | sed 's#/$##' | tail -n +$((KEEP + 1)) | while read -r old; do
  [ "$old" = "$live" ] && continue
  rm -rf "$old"
  log "removed old release $(basename "$old" | cut -c1-7)"
done
git -C "$CACHE" worktree prune
