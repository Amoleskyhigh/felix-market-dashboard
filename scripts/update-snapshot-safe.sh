#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
TMP="/tmp/market-snapshot-$$.json"
OUT="docs/market-data-snapshot.json"

curl -s --max-time 40 http://localhost:8899/api/data > "$TMP"
BYTES=$(wc -c < "$TMP" | tr -d ' ')
if [ "$BYTES" -lt 5000 ]; then
  echo "snapshot too small ($BYTES), keep previous file"
  exit 1
fi

python3 - <<'PY' "$TMP"
import json,sys,time
p=sys.argv[1]
d=json.load(open(p))
missing=[]

def req(path):
    cur=d
    for k in path:
        if not isinstance(cur,dict) or k not in cur:
            return None
        cur=cur[k]
    return cur

checks=[
 (('spy','currentPrice'),'spy'),
 (('qqq','currentPrice'),'qqq'),
 (('smh','currentPrice'),'smh'),
 (('vix','currentPrice'),'vix'),
 (('dxy','currentPrice'),'dxy'),
 (('tnx','currentPrice'),'tnx'),
 (('fearGreed','score'),'fearGreed'),
 (('creditSpread','value'),'creditSpread'),
 (('shiller','current'),'shiller'),
 (('breadth','value'),'breadth'),
 (('usdtwd','currentPrice'),'usdtwd'),
 (('copper','currentPrice'),'copper')
]
for path,name in checks:
    v=req(path)
    if v is None:
        missing.append(name)

ts=d.get('timestamp')
if not isinstance(ts,(int,float)):
    missing.append('timestamp')
else:
    age_hours=(time.time()*1000-ts)/1000/3600
    if age_hours>36:
        missing.append(f'stale_timestamp({age_hours:.1f}h)')

if missing:
    print('MISSING_OR_STALE:', ', '.join(missing))
    sys.exit(2)
print('ok')
PY

cp "$TMP" "$OUT"
echo "snapshot updated: $BYTES bytes -> $OUT"