#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
TMP="/tmp/market-snapshot-$$.json"
curl -s --max-time 40 http://localhost:8899/api/data > "$TMP"
BYTES=$(wc -c < "$TMP" | tr -d ' ')
if [ "$BYTES" -lt 5000 ]; then
  echo "snapshot too small ($BYTES), keep previous file"
  exit 1
fi
python3 - <<'PY' "$TMP"
import json,sys
p=sys.argv[1]
d=json.load(open(p))
assert d.get('qqq',{}).get('currentPrice')
assert d.get('smh',{}).get('currentPrice')
assert d.get('vix',{}).get('currentPrice')
assert d.get('shiller',{}).get('current')
print('ok')
PY
cp "$TMP" market-data-snapshot.json
cp "$TMP" docs/market-data-snapshot.json
echo "snapshot updated: $BYTES bytes"