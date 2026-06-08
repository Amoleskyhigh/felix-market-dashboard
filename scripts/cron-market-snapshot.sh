#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")/.."

REPO_STATUS="failed"
DATA_STATUS="Error [unknown]"
MISSING_FIELDS="[]"
SNAPSHOT_FILE="docs/market-data-snapshot.json"
ROOT_SNAPSHOT_FILE="market-data-snapshot.json"
LATEST_COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
TMP_LOG="/tmp/cron-market-snapshot-$$.log"
STARTED_SERVER=0
READY_TO_UPDATE=1

run_cmd() {
  "$@" >>"$TMP_LOG" 2>&1
}

validate_json() {
  python3 - <<'PY' "$1" >>"$TMP_LOG" 2>&1
import json, sys
path = sys.argv[1]
with open(path) as fh:
    data = json.load(fh)
if not isinstance(data, dict):
    raise SystemExit(f"{path}: top-level JSON is not an object")
if "timestamp" not in data:
    raise SystemExit(f"{path}: missing timestamp")
print(f"json ok: {path}")
PY
}

if run_cmd git pull --rebase --autostash; then
  :
else
  DATA_STATUS="Error [git pull --rebase --autostash failed]"
  READY_TO_UPDATE=0
fi

CONFLICT_FILES="$(git diff --name-only --diff-filter=U 2>/dev/null || true)"
if [ -n "$CONFLICT_FILES" ]; then
  DATA_STATUS="Error [git conflict after pull: $(echo "$CONFLICT_FILES" | tr '\n' ' ' | sed 's/[[:space:]]*$//')]"
  READY_TO_UPDATE=0
fi

if [ "$READY_TO_UPDATE" -eq 1 ]; then
  if ! run_cmd bash scripts/check-server-safe.sh 8899; then
    if run_cmd nohup node market-server.js >/tmp/market-server.log 2>&1 & then
      STARTED_SERVER=1
      sleep 3
    fi
  fi

  if run_cmd bash scripts/check-server-safe.sh 8899; then
    if run_cmd bash scripts/update-snapshot-safe.sh; then
      if run_cmd cp "$SNAPSHOT_FILE" "$ROOT_SNAPSHOT_FILE" \
        && validate_json "$SNAPSHOT_FILE" \
        && validate_json "$ROOT_SNAPSHOT_FILE"; then
        DATA_STATUS="Success"
      else
        DATA_STATUS="Error [snapshot JSON validation failed]"
      fi
    else
      DATA_STATUS="Error [scripts/update-snapshot-safe.sh failed]"
    fi
  else
    DATA_STATUS="Error [server health check failed on 8899]"
  fi
fi

if [ -f "$SNAPSHOT_FILE" ]; then
  SNAPSHOT_TIMESTAMP="$(node -e "const fs=require('fs');const d=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const t=d.timestamp;console.log(Number.isFinite(t)?new Date(t).toISOString():'N/A');" "$SNAPSHOT_FILE" 2>/dev/null || echo N/A)"
else
  SNAPSHOT_TIMESTAMP="N/A"
fi

if ! grep -q "MISSING_OR_STALE:" "$TMP_LOG"; then
  MISSING_FIELDS="[]"
else
  MISSING_FIELDS="$(grep 'MISSING_OR_STALE:' "$TMP_LOG" | tail -n1 | sed 's/^MISSING_OR_STALE:[[:space:]]*/[/' | sed 's/$/]/')"
fi

if [[ "$DATA_STATUS" == Success* ]] && ! git diff --quiet -- "$SNAPSHOT_FILE" "$ROOT_SNAPSHOT_FILE" 2>/dev/null; then
  if run_cmd git add "$SNAPSHOT_FILE" "$ROOT_SNAPSHOT_FILE" \
    && run_cmd git commit -m "chore: update market snapshot (cron, QA-gated)" \
    && run_cmd git push; then
    REPO_STATUS="updated and pushed"
    LATEST_COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
  else
    REPO_STATUS="failed"
    if [ "$DATA_STATUS" = "Success" ]; then
      DATA_STATUS="Error [git add/commit/push failed]"
    fi
  fi
else
  if [[ "$DATA_STATUS" == Success* ]]; then
    REPO_STATUS="no changes"
  else
    REPO_STATUS="skipped due data error"
  fi
fi

if [ "$STARTED_SERVER" -eq 1 ]; then
  pkill -f "node market-server.js" >/dev/null 2>&1 || true
fi

echo "Repo Status: $REPO_STATUS"
echo "Data Status: $DATA_STATUS"
echo "Missing Fields: $MISSING_FIELDS"
echo "Snapshot File: $SNAPSHOT_FILE"
echo "Snapshot Timestamp: $SNAPSHOT_TIMESTAMP"
echo "Latest Commit: $LATEST_COMMIT"
