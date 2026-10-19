#!/bin/bash
# Starts both Next.js dev servers (brasaland-web on :3000, backoffice on
# :3001), both bound to 0.0.0.0 so they're reachable from outside the
# container. Forwards SIGTERM/SIGINT to both children and waits for a
# clean shutdown, so `docker compose stop`/`down` doesn't just kill -9
# the container mid-write.
set -e

# Call the `next` binary directly (not `pnpm exec`/`pnpm run`, which can
# add its own wrapper process) and `exec` it in place of the subshell —
# so $! is the actual Next.js process, and SIGTERM sent to it is received
# directly instead of possibly being lost on an intermediate wrapper that
# lingers past Docker's stop grace period and gets SIGKILLed instead.
(cd /app/brasaland-web && exec ./node_modules/.bin/next dev --turbopack -p 3000 -H 0.0.0.0) &
WEBSITE_PID=$!

(cd /app/backoffice && exec ./node_modules/.bin/next dev --turbopack -p 3001 -H 0.0.0.0) &
BACKOFFICE_PID=$!

shutdown() {
  echo "Stopping website (pid $WEBSITE_PID) and backoffice (pid $BACKOFFICE_PID)…"
  kill -TERM "$WEBSITE_PID" "$BACKOFFICE_PID" 2>/dev/null || true
  wait "$WEBSITE_PID" "$BACKOFFICE_PID" 2>/dev/null
  exit 0
}
trap shutdown TERM INT

# Exit as soon as either app dies, so a crashed dev server doesn't leave
# the container silently running with only the other app up.
wait -n "$WEBSITE_PID" "$BACKOFFICE_PID"
EXIT_CODE=$?
kill -TERM "$WEBSITE_PID" "$BACKOFFICE_PID" 2>/dev/null || true
wait "$WEBSITE_PID" "$BACKOFFICE_PID" 2>/dev/null
exit "$EXIT_CODE"
