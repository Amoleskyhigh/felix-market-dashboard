#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-8899}"

if lsof -iTCP:"$PORT" -sTCP:LISTEN -n -P >/dev/null 2>&1; then
  echo "server_listening:$PORT"
  # /api/health intentionally returns 503 for an old cache.  Snapshot refresh
  # must instead verify that the data endpoint can produce a payload; the
  # update script has its own freshness/schema gate after fetching it.
  curl -fsS --max-time 30 --retry 2 --retry-delay 1 "http://127.0.0.1:${PORT}/api/data" >/dev/null
  echo "server_data:ok"
else
  echo "server_not_running:$PORT"
  exit 2
fi
