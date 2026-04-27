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
# -s but NOT -f, so we keep the response body on 4xx/5xx and can diagnose.
# -w appends the HTTP status on its own line; split it off below.
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API/api/search" \
  -H 'content-type: application/json' \
  -H "origin: $WEB" \
  -d "{\"from\":\"Bucuresti-Nord\",\"to\":\"Brasov\",\"date\":\"$TOMORROW\"}")
STATUS=$(echo "$RESPONSE" | tail -1)
RESULT=$(echo "$RESPONSE" | sed '$d')

WARNING=$(echo "$RESULT" | sed -n 's/.*"warning":{"kind":"\([^"]*\)".*/\1/p')

if [ "$STATUS" != "200" ]; then
  echo "FAIL: search returned HTTP $STATUS warning=${WARNING:-unknown}"
  exit 1
fi

# `|| true` because grep returns 1 when no matches, which under `set -e -o pipefail`
# would kill the script before we can print the diagnostic below.
COUNT=$(echo "$RESULT" | grep -o '"id"' | wc -l | tr -d ' ' || true)
RATE=$(echo "$RESULT" | sed -n 's/.*"parseSuccessRate":\([0-9.]*\).*/\1/p')

echo "[canary] itineraries=$COUNT parseSuccessRate=${RATE:-?} warning=${WARNING:-none}"
[ "$COUNT" -ge 1 ] || { echo "FAIL: no itineraries (warning=${WARNING:-unknown})"; exit 1; }
awk "BEGIN { exit !(${RATE:-0} >= 0.8) }" || { echo "FAIL: parseSuccessRate ${RATE:-?} < 0.8"; exit 1; }

echo "[canary] OK"
