#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
TMP="/tmp/market-snapshot-$$.json"
OUT="docs/market-data-snapshot.json"

CURL_URL="http://127.0.0.1:8899/api/data"
if ! curl -fsS --retry 2 --retry-delay 2 --retry-connrefused --max-time 80 "$CURL_URL" > "$TMP"; then
  code=$?
  echo "ERROR: fetch api failed (code=$code, url=$CURL_URL)"
  exit $code
fi
BYTES=$(wc -c < "$TMP" | tr -d ' ')
if [ "$BYTES" -lt 5000 ]; then
  echo "ERROR: snapshot too small ($BYTES), keep previous file"
  exit 11
fi

python3 - <<'PY' "$TMP" "$OUT"
import json,sys,time,os
p=sys.argv[1]
out=sys.argv[2]
d=json.load(open(p))
prev = json.load(open(out)) if os.path.exists(out) else {}
missing=[]

# allow carrying forward slowly-updated series (credit spread) from previous snapshot
if not d.get('creditSpread') and prev.get('creditSpread'):
    d['creditSpread'] = prev['creditSpread']

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
    if age_hours>96:
        missing.append(f'stale_timestamp({age_hours:.1f}h)')

if missing:
    print('MISSING_OR_STALE:', ', '.join(missing))
    sys.exit(2)

open(p,'w').write(json.dumps(d,separators=(',',':')))
print('ok')
PY

cp "$TMP" "$OUT"
echo "snapshot updated: $BYTES bytes -> $OUT"