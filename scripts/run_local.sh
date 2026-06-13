#!/usr/bin/env bash
# Boot the Saheli context server + ngrok tunnel.
#   ./scripts/run_local.sh          normal mode
#   ./scripts/run_local.sh --demo   DEMO_MODE=1 (pre-baked kurtas)
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UVICORN="$ROOT/.venv/bin/uvicorn"
[ -x "$UVICORN" ] || UVICORN="uvicorn"  # fall back to PATH

DEMO=0
[ "${1:-}" = "--demo" ] && DEMO=1

cleanup() { kill ${UVICORN_PID:-} ${NGROK_PID:-} 2>/dev/null; }
trap cleanup EXIT

echo "starting server (DEMO_MODE=$DEMO) on :8000 ..."
# BOLNA_API_KEY/CALL_NUMBER power the extension's 📞 Call Saheli button
(cd "$ROOT/server" && DEMO_MODE=$DEMO BOLNA_API_KEY="${BOLNA_API_KEY:-}" \
  CALL_NUMBER="${CALL_NUMBER:-+919919837374}" "$UVICORN" main:app --port 8000) &
UVICORN_PID=$!

if ! command -v ngrok >/dev/null; then
  echo "ngrok not found — server running locally only at http://127.0.0.1:8000"
  wait $UVICORN_PID
  exit 0
fi

# pin the account's static domain so restarts keep the same URL
# (Bolna functions + extension config both point at it)
NGROK_DOMAIN="${NGROK_DOMAIN:-saporous-nonimitative-rozanne.ngrok-free.dev}"
ngrok http 8000 --domain="$NGROK_DOMAIN" --log=stdout >/tmp/saheli_ngrok.log 2>&1 &
NGROK_PID=$!

PUBLIC=""
for _ in $(seq 1 30); do
  sleep 0.5
  PUBLIC=$(curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null \
    | python3 -c "import sys,json;ts=json.load(sys.stdin).get('tunnels',[]);print(ts[0]['public_url'] if ts else '')" 2>/dev/null)
  [ -n "$PUBLIC" ] && break
done

if [ -n "$PUBLIC" ]; then
  echo
  echo "================================================================"
  echo "  public URL:  $PUBLIC"
  echo "================================================================"
  echo "  1. extension/config.js  -> SERVER_URL: \"$PUBLIC\"  (then reload extension)"
  echo "  2. export SERVER_URL=$PUBLIC"
  echo "  3. python bolna/create_agent.py --update <AGENT_ID>"
  echo
  echo "  sanity check: curl $PUBLIC/health"
  echo "================================================================"
else
  echo "could not read ngrok URL — check /tmp/saheli_ngrok.log"
fi

wait $UVICORN_PID
