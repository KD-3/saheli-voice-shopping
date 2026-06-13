#!/usr/bin/env python3
"""
Place an outbound call from the Saheli agent. Stdlib only.

Usage:  BOLNA_API_KEY=... python3 place_call.py +919919837374 [AGENT_ID]
"""

import json
import os
import sys
import urllib.error
import urllib.request

DEFAULT_AGENT = "fd1aa41c-d854-46c1-96ac-b9c9eba8cb49"


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    number = sys.argv[1]
    if not number.startswith("+"):
        number = "+91" + number.lstrip("0")
    agent_id = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_AGENT
    key = os.environ.get("BOLNA_API_KEY") or sys.exit("BOLNA_API_KEY not set")

    # fresh call = fresh session (clear last call's brief/finalists from the HUD)
    server = os.environ.get("SERVER_URL", "").rstrip("/")
    if server.startswith("http"):
        try:
            urllib.request.urlopen(
                urllib.request.Request(server + "/reset?session_id=demo1", data=b"", method="POST"),
                timeout=8,
            )
        except Exception:
            pass

    body = {"agent_id": agent_id, "recipient_phone_number": number}
    req = urllib.request.Request(
        "https://api.bolna.ai/call",
        data=json.dumps(body).encode(),
        headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            print(json.dumps(json.loads(resp.read()), indent=2))
    except urllib.error.HTTPError as e:
        sys.exit("HTTP %s: %s" % (e.code, e.read().decode()[:600]))


if __name__ == "__main__":
    main()
