#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-8899}"

if lsof -iTCP:"$PORT" -sTCP:LISTEN -n -P >/dev/null 2>&1; then
  echo "server_listening:$PORT"
  curl -fsS --max-time 5 "http://127.0.0.1:${PORT}/api/health" >/dev/null
  echo "server_health:ok"
else
  echo "server_not_running:$PORT"
  exit 2
fi
