#!/usr/bin/env bash
set -euo pipefail

API="${1:-https://api.garalagara.com}"
WEB="${2:-https://garalagara.com}"

echo "[canary] checking $API/health"
HEALTH=$(curl -sf "$API/health")
echo "$HEALTH" | grep -q '"status":"ok"' || { echo "FAIL: health"; exit 1; }

echo "[canary] checking $WEB landing"
curl -sf -o /dev/null -w "%{http_code}" "$WEB/" | grep -q "^200$" || { echo "FAIL: web 200"; exit 1; }

echo "[canary] running real CFR search (Bucuresti-Nord -> Brasov, T+1)"
TOMORROW=$(date -u -d 'tomorrow' '+%Y-%m-%d' 2>/dev/null || date -v+1d '+%Y-%m-%d')
RESULT=$(curl -sf -X POST "$API/api/search" \
  -H 'content-type: application/json' \
  -H "origin: $WEB" \
  -d "{\"from\":\"Bucuresti-Nord\",\"to\":\"Brasov\",\"date\":\"$TOMORROW\"}")

COUNT=$(echo "$RESULT" | grep -o '"id"' | wc -l | tr -d ' ')
RATE=$(echo "$RESULT" | sed -n 's/.*"parseSuccessRate":\([0-9.]*\).*/\1/p')

echo "[canary] itineraries=$COUNT parseSuccessRate=$RATE"
[ "$COUNT" -ge 1 ] || { echo "FAIL: no itineraries"; exit 1; }
awk "BEGIN { exit !($RATE >= 0.8) }" || { echo "FAIL: parseSuccessRate $RATE < 0.8"; exit 1; }

echo "[canary] OK"
