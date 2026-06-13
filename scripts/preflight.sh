#!/usr/bin/env bash
# Pre-demo checklist — run before EVERY rehearsal and before the slot.
#   BOLNA_API_KEY=... ./scripts/preflight.sh [--reset]
# Verifies the whole chain: local server -> tunnel -> Bolna agent config ->
# extension freshness. Exit 0 = go on stage.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TUNNEL="https://saporous-nonimitative-rozanne.ngrok-free.dev"
AGENT="fd1aa41c-d854-46c1-96ac-b9c9eba8cb49"
PASS=0; FAIL=0; WARN=0

ok()   { echo "  ✓ $1"; PASS=$((PASS+1)); }
bad()  { echo "  ✗ $1"; FAIL=$((FAIL+1)); }
warn() { echo "  ! $1"; WARN=$((WARN+1)); }

echo "== 1. local server =="
H=$(curl -s -m 3 http://127.0.0.1:8000/health)
case "$H" in *'"ok":true'*) ok "server up ($H)";; *) bad "server DOWN — run: nohup ./scripts/run_local.sh --demo >/tmp/saheli_run.log 2>&1 &";; esac
case "$H" in *'"demo_mode":true'*) ok "DEMO_MODE on (fallback armed)";; *) warn "DEMO_MODE off — no fallback if scrape dies";; esac

echo "== 2. tunnel =="
T=$(curl -s -m 6 "$TUNNEL/health")
case "$T" in *'"ok":true'*) ok "tunnel serving on pinned domain";; *) bad "tunnel DEAD — restart run_local.sh (ngrok may need re-auth)";; esac

echo "== 3. Bolna agent =="
if [ -z "${BOLNA_API_KEY:-}" ]; then
  warn "BOLNA_API_KEY not set — skipping agent checks"
else
  python3 - "$AGENT" <<'EOF'
import json, os, sys, urllib.request
agent = sys.argv[1]
req = urllib.request.Request("https://api.bolna.ai/v2/agent/" + agent,
    headers={"Authorization": "Bearer " + os.environ["BOLNA_API_KEY"]})
try:
    a = json.loads(urllib.request.urlopen(req, timeout=10).read())
except Exception as e:
    print("  ✗ cannot fetch agent:", e); sys.exit(1)
tc = a["tasks"][0]["tools_config"]; cfg = a["tasks"][0]["task_config"]
llm = tc["llm_agent"].get("llm_config", tc["llm_agent"])
syn = tc["synthesizer"]
fns = [t.get("name") for t in (tc.get("api_tools") or {}).get("tools") or []]
want = {"get_current_page", "add_to_cart", "open_product", "search_amazon", "set_mission", "shortlist_product", "point_at_products"}
def line(okflag, msg): print(("  ✓ " if okflag else "  ✗ ") + msg)
line(syn["provider"] == "cartesia", "voice: %s / %s" % (syn["provider"], syn["provider_config"].get("voice")))
line("gpt-4o" in str(llm.get("model")), "llm: %s" % llm.get("model"))
line(want <= set(fns), "functions: %s" % ", ".join(fns))
line(cfg.get("call_terminate", 0) >= 600, "call_terminate: %ss" % cfg.get("call_terminate"))
line(cfg.get("hangup_after_silence", 0) >= 120, "hangup_after_silence: %ss (dashboard saves revert to 30)" % cfg.get("hangup_after_silence"))
line(cfg.get("hangup_after_LLMCall") is False, "hangup_after_LLMCall: %s (must be False)" % cfg.get("hangup_after_LLMCall"))
print("  ! verify in dashboard Canvas that the Saheli prompt is present (API cannot see Canvas)")
sys.exit(0 if (syn["provider"] == "cartesia" and want <= set(fns)) else 1)
EOF
  [ $? -eq 0 ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))
fi

echo "== 4. extension freshness =="
AGE=$(curl -s -m 3 "http://127.0.0.1:8000/context?session_id=demo1" | python3 -c "
import sys, json
d = json.load(sys.stdin)
cp = d.get('current_page') or {}
print(cp.get('seconds_since_scrape', 'none'))" 2>/dev/null)
if [ "$AGE" = "none" ] || [ -z "$AGE" ]; then
  warn "no live scrape yet — open an amazon.in product page and watch for the toast"
elif [ "$AGE" -lt 600 ] 2>/dev/null; then
  ok "extension scraped ${AGE}s ago"
else
  warn "last scrape ${AGE}s ago — refresh the Amazon tab to confirm extension alive"
fi

if [ "${1:-}" = "--reset" ]; then
  curl -s -X POST "http://127.0.0.1:8000/reset?session_id=demo1" >/dev/null && ok "session demo1 reset"
fi

echo
echo "passed $PASS, failed $FAIL, warnings $WARN"
[ "$FAIL" -eq 0 ] && echo ">> GO" || echo ">> NO-GO: fix the ✗ items"
[ "$FAIL" -eq 0 ]
