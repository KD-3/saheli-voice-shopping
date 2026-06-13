#!/usr/bin/env bash
# Smoke tests for the Saheli context server.
# Boots its own server instances on port 8001 (normal, then DEMO_MODE) and
# asserts every endpoint behaves per SAHELI_SPEC.md §8.2.
set -u
cd "$(dirname "$0")/../server"

PORT=8001
BASE="http://127.0.0.1:$PORT"
PASS=0
FAIL=0

check() { # check <name> <haystack> <needle>
  if echo "$2" | grep -q "$3"; then
    echo "  ok   $1"; PASS=$((PASS+1))
  else
    echo "  FAIL $1"; echo "       wanted: $3"; echo "       got:    $2"; FAIL=$((FAIL+1))
  fi
}

start_server() { # start_server [env...]
  env "$@" uvicorn main:app --port $PORT >/tmp/saheli_smoke.log 2>&1 &
  SERVER_PID=$!
  for _ in $(seq 1 50); do
    curl -sf "$BASE/health" >/dev/null 2>&1 && return 0
    sleep 0.2
  done
  echo "server failed to start"; cat /tmp/saheli_smoke.log; exit 1
}

stop_server() { kill "$SERVER_PID" 2>/dev/null; wait "$SERVER_PID" 2>/dev/null; }

echo "== normal mode =="
start_server DEMO_MODE=0

check "health" "$(curl -s $BASE/health)" '"ok":true'

check "empty context says cannot see screen" \
  "$(curl -s "$BASE/context?session_id=demo1")" 'cannot see'

curl -s -X POST $BASE/context -H 'Content-Type: application/json' -d '{
  "session_id":"demo1","asin":"B0TEST00001","url":"https://www.amazon.in/dp/B0TEST00001",
  "title":"Test Kurta One","price":"₹1,499","rating":"4.1 out of 5 stars",
  "review_count":"1,243 ratings","review_snippets":["fabric runs thin","nice colour"],
  "seller":"Test Seller","key_specs":{"Material":"Cotton"}}' >/dev/null

check "context stored" "$(curl -s "$BASE/context?session_id=demo1")" 'Test Kurta One'

curl -s -X POST $BASE/context -H 'Content-Type: application/json' -d '{
  "session_id":"demo1","asin":"B0TEST00002","url":"https://www.amazon.in/dp/B0TEST00002",
  "title":"Test Kurta Two","price":"₹1,899","rating":"4.4 out of 5 stars",
  "review_count":"3,871 ratings","review_snippets":["excellent stitching"]}' >/dev/null

CTX=$(curl -s "$BASE/context?session_id=demo1")
check "current is product two" "$CTX" '"current_page":{"title":"Test Kurta Two'
check "product one in earlier-viewed history" "$CTX" '"name":"Test Kurta One'
check "history has review theme" "$CTX" '"review_theme":"fabric runs thin'

check "no pending action -> 204" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/action?session_id=demo1")" '204'

curl -s -X POST $BASE/action -H 'Content-Type: application/json' -d '{
  "session_id":"demo1","type":"add_to_cart","asin":"B0TEST00002",
  "product_name":"Test Kurta Two","price":"₹1,899"}' >/dev/null

check "action queued and returned" \
  "$(curl -s "$BASE/action?session_id=demo1")" '"type":"add_to_cart"'
check "action consumed on read -> 204" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/action?session_id=demo1")" '204'

curl -s -X POST $BASE/action/result -H 'Content-Type: application/json' -d '{
  "session_id":"demo1","ok":true,"type":"add_to_cart","asin":"B0TEST00002"}' >/dev/null

check "action result visible in context" \
  "$(curl -s "$BASE/context?session_id=demo1")" '"last_action_result":{"ok":true'

check "action url resolves from history" \
  "$(curl -s -X POST $BASE/action -H 'Content-Type: application/json' -d '{
    "session_id":"demo1","asin":"B0TEST00001"}'; curl -s "$BASE/action?session_id=demo1")" \
  'amazon.in/dp/B0TEST00001'

# --- critical review ---
curl -s -X POST $BASE/context -H 'Content-Type: application/json' -d '{
  "session_id":"demo1","asin":"B0TEST00003","url":"https://www.amazon.in/dp/B0TEST00003",
  "title":"Test Kurta Three","price":"₹999","rating":"3.9 out of 5 stars",
  "review_snippets":["looks great","nice fit"],
  "critical_review":"stitching opened after one wash"}' >/dev/null

check "critical review on current page" \
  "$(curl -s "$BASE/context?session_id=demo1")" '"top_critical_review":"stitching opened'

curl -s -X POST $BASE/context -H 'Content-Type: application/json' -d '{
  "session_id":"demo1","asin":"B0TEST00004","title":"Test Kurta Four","price":"₹1,299"}' >/dev/null

check "history theme prefers critical review" \
  "$(curl -s "$BASE/context?session_id=demo1")" '"review_theme":"stitching opened'

# --- search context + view switching ---
curl -s -X POST $BASE/context -H 'Content-Type: application/json' -d '{
  "session_id":"demo1","page_type":"search_results","query":"wedding kurta",
  "url":"https://www.amazon.in/s?k=wedding+kurta",
  "results":[{"position":1,"name":"Result One","price":"₹899","rating":"4.0 out of 5 stars",
              "review_count":"120","asin":"B0SEARCH001","url":"https://www.amazon.in/dp/B0SEARCH001"},
             {"position":2,"name":"Result Two","price":"₹1,599","rating":"4.3 out of 5 stars",
              "review_count":"950","asin":"B0SEARCH002","url":"https://www.amazon.in/dp/B0SEARCH002"}]}' >/dev/null

SCTX=$(curl -s "$BASE/context?session_id=demo1")
check "view switches to search results" "$SCTX" '"current_view":"search_results"'
check "search query present" "$SCTX" '"query":"wedding kurta"'
check "search result names present" "$SCTX" 'Result Two'

curl -s -X POST $BASE/context -H 'Content-Type: application/json' -d '{
  "session_id":"demo1","asin":"B0TEST00005","title":"Test Kurta Five","price":"₹1,099"}' >/dev/null
PCTX=$(curl -s "$BASE/context?session_id=demo1")
check "view switches back to product" "$PCTX" '"current_view":"product"'
check "last search still available" "$PCTX" 'Result One'

# --- open_search action + url resolution from search results ---
LAST_ID=$(curl -s "$BASE/events?session_id=demo1&after=999999999" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['last_id'])")

curl -s -X POST $BASE/action -H 'Content-Type: application/json' -d '{
  "session_id":"demo1","type":"open_search","query":"silk kurta under 2000"}' >/dev/null
check "open_search action queued with query" \
  "$(curl -s "$BASE/action?session_id=demo1")" '"query":"silk kurta under 2000"'

curl -s -X POST $BASE/action -H 'Content-Type: application/json' -d '{
  "session_id":"demo1","type":"open_product","asin":"B0SEARCH002"}' >/dev/null
check "open_product url resolves from search results" \
  "$(curl -s "$BASE/action?session_id=demo1")" 'amazon.in/dp/B0SEARCH002'

# --- events feed ---
EVENTS=$(curl -s "$BASE/events?session_id=demo1&after=$LAST_ID")
check "events: search action surfaced" "$EVENTS" 'Searching: silk kurta'
check "events: looked event surfaced" \
  "$(curl -s "$BASE/events?session_id=demo1&after=0")" 'looking at this page'
check "events: after filter excludes old" \
  "$(curl -s "$BASE/events?session_id=demo1&after=999999999")" '"events":\[\]'

# --- intelligence: unit price, deep-review mining, mission ---
curl -s -X POST $BASE/context -H 'Content-Type: application/json' -d '{
  "session_id":"demo1","asin":"B0TESTWHEY1","title":"Test Whey Protein Powder 1kg Chocolate",
  "price":"₹3,499","rating":"4.2 out of 5 stars","review_count":"2,210 ratings",
  "deep_reviews":[
    {"rating":"5.0 out of 5 stars","date":"Reviewed in India on 12 May 2026","text":"Great product totally worth it"},
    {"rating":"5.0 out of 5 stars","date":"Reviewed in India on 12 May 2026","text":"Good"},
    {"rating":"2.0 out of 5 stars","date":"Reviewed in India on 20 May 2026","text":"Taste is horrible and it does not dissolve, lumps everywhere"},
    {"rating":"1.0 out of 5 stars","date":"Reviewed in India on 21 May 2026","text":"Fake product not original, seal was broken"},
    {"rating":"2.0 out of 5 stars","date":"Reviewed in India on 22 May 2026","text":"Taste is too bitter, flavour is nothing like chocolate"},
    {"rating":"1.0 out of 5 stars","date":"Reviewed in India on 23 May 2026","text":"Duplicate item, not genuine. Seller not responding for refund"}
  ]}' >/dev/null

ICTX=$(curl -s "$BASE/context?session_id=demo1")
check "unit price computed" "$ICTX" 'per kg'
check "review analysis present" "$ICTX" '"reviews_analyzed":6'
check "complaint theme counted" "$ICTX" '"theme":"taste/mixability","count":2'
check "authenticity complaints counted" "$ICTX" '"theme":"authenticity"'
check "rating drift flagged" "$ICTX" 'recent buyers are unhappier'

curl -s -X POST $BASE/context -H 'Content-Type: application/json' -d '{
  "session_id":"demo1","asin":"B0TESTNEXT1","title":"Another Product"}' >/dev/null
check "history entry carries complaints" \
  "$(curl -s "$BASE/context?session_id=demo1")" '"complaints":\["authenticity (2 mentions)","taste/mixability (2 mentions)"'

curl -s -X POST $BASE/mission -H 'Content-Type: application/json' -d '{
  "session_id":"demo1","mission":"whey protein under 4000, no added sugar","budget":"under ₹4,000"}' >/dev/null
check "mission stored and echoed" \
  "$(curl -s "$BASE/context?session_id=demo1")" '"mission":"whey protein under 4000'

curl -s -X POST $BASE/context -H 'Content-Type: application/json' -d '{
  "session_id":"demo1","page_type":"cart","subtotal":"₹3,821",
  "items":[{"name":"Test Whey Protein 1kg","price":"₹3,499","asin":"B0TESTWHEY1"},
           {"name":"Yogabar Minis","price":"₹322","asin":"B0TESTBAR01"}]}' >/dev/null
check "cart stored and echoed" \
  "$(curl -s "$BASE/context?session_id=demo1")" '"cart":{"items":\[{"name":"Test Whey Protein 1kg"'
check "cart subtotal present" \
  "$(curl -s "$BASE/context?session_id=demo1")" '"subtotal":"₹3,821"'

# --- shortlist ---
curl -s -X POST $BASE/shortlist -H 'Content-Type: application/json' -d '{
  "session_id":"demo1","asin":"B0TEST00002","product_name":"Test Kurta Two"}' >/dev/null
check "shortlist stored and echoed" \
  "$(curl -s "$BASE/context?session_id=demo1")" '"shortlist":\[{"name":"Test Kurta Two'
check "shortlist rejects unseen product" \
  "$(curl -s -X POST $BASE/shortlist -H 'Content-Type: application/json' -d '{
    "session_id":"demo1","asin":"B0NEVERSEEN"}')" 'not seen this session'

# --- trust receipt on add_to_cart ---
curl -s -X POST $BASE/action -H 'Content-Type: application/json' -d '{
  "session_id":"demo1","type":"add_to_cart","asin":"B0TEST00002",
  "product_name":"Test Kurta Two","price":"₹1,899"}' >/dev/null
EV=$(curl -s "$BASE/events?session_id=demo1&after=0")
check "receipt event emitted" "$EV" '"type":"receipt"'
check "receipt carries budget verdict" "$EV" 'under your budget'
curl -s "$BASE/action?session_id=demo1" >/dev/null  # drain queue

# --- size advice mined from reviews ---
curl -s -X POST $BASE/context -H 'Content-Type: application/json' -d '{
  "session_id":"demo1","asin":"B0TEST00006","title":"Test Slim Kurta","price":"₹799",
  "rating":"4.0 out of 5 stars",
  "deep_reviews":[
    {"rating":"4.0 out of 5 stars","date":"1 June 2026","text":"Lovely colour but runs small, order one size larger"},
    {"rating":"3.0 out of 5 stars","date":"2 June 2026","text":"Too tight at shoulders, runs small for sure"},
    {"rating":"5.0 out of 5 stars","date":"3 June 2026","text":"Great fabric, very happy"},
    {"rating":"4.0 out of 5 stars","date":"4 June 2026","text":"Good quality, snug fit, size up"},
    {"rating":"4.0 out of 5 stars","date":"5 June 2026","text":"Nice kurta for the price"}]}' >/dev/null
check "size advice mined" \
  "$(curl -s "$BASE/context?session_id=demo1")" '"size_advice":"runs small'

# --- MRP theatre ---
curl -s -X POST $BASE/context -H 'Content-Type: application/json' -d '{
  "session_id":"demo1","asin":"B0TEST00007","title":"Test Discount Kurta","price":"₹437",
  "mrp":"₹1,499"}' >/dev/null
DCTX2=$(curl -s "$BASE/context?session_id=demo1")
check "claimed discount computed" "$DCTX2" '"claimed_discount":"71% off"'
check "inflated MRP note present" "$DCTX2" 'MRP is theatre'

curl -s -X POST "$BASE/reset?session_id=demo1" >/dev/null
check "reset wipes session" "$(curl -s "$BASE/context?session_id=demo1")" 'cannot see'

stop_server

echo "== DEMO_MODE =="
start_server DEMO_MODE=1

DCTX=$(curl -s "$BASE/context?session_id=demo1")
check "demo current page is the suspect kurta" "$DCTX" 'RS Enterprise'
check "demo history includes Manyavar" "$DCTX" 'Manyavar'
check "demo history includes mediocre kurta" "$DCTX" 'Sequince Embroidered'
check "demo view is product" "$DCTX" '"current_view":"product"'
check "demo baked search present" "$DCTX" '"query":"men wedding kurta"'
check "demo mediocre complaint mined" "$DCTX" 'quality/material (9 mentions)'

curl -s -X POST $BASE/context -H 'Content-Type: application/json' -d '{
  "session_id":"demo1","asin":"B0TEST00009","title":"Live Scrape Wins","price":"₹999"}' >/dev/null
check "live scrape overrides demo data" \
  "$(curl -s "$BASE/context?session_id=demo1")" 'Live Scrape Wins'

stop_server

echo
echo "passed $PASS, failed $FAIL"
[ "$FAIL" -eq 0 ]
