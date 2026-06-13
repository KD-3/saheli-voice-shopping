#!/usr/bin/env python3
"""
Switch the Saheli agent's voice to a Cartesia voice by name, via the API.
(Workaround: the dashboard's voice picker reverts to ElevenLabs on save.)

Usage:  BOLNA_API_KEY=... python3 set_voice.py Riya [AGENT_ID]
        BOLNA_API_KEY=... python3 set_voice.py --list
"""

import json
import os
import sys

from create_agent import (
    api_key,
    load_prompt,
    normalize_fetched,
    patch_agent,
    request,
    saheli_functions,
    server_url,
    strip_readonly,
)

DEFAULT_AGENT = "fd1aa41c-d854-46c1-96ac-b9c9eba8cb49"


def cartesia_voices():
    data = request("GET", "/me/voices")["data"]
    return [v for v in data if v.get("provider") == "cartesia"]


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    api_key()  # fail fast if missing
    voices = cartesia_voices()

    if sys.argv[1] == "--list":
        for v in voices:
            print("%-22s %-12s %s" % (v["name"].strip(), v.get("language_code"), v.get("accent")))
        return

    wanted = sys.argv[1].strip().lower()
    agent_id = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_AGENT
    match = next((v for v in voices if v["name"].strip().lower() == wanted), None)
    if not match:
        sys.exit("No Cartesia voice named %r on this account. Try --list." % sys.argv[1])

    # Bolna's PUT silently drops functions/prompts that its own GET returns, so
    # every PUT must re-send our locally built prompt + functions (patch_agent),
    # never just pass the GET state through.
    payload = strip_readonly(normalize_fetched(request("GET", "/agent/" + agent_id)))
    payload = patch_agent(payload, load_prompt(), saheli_functions(server_url()))
    synth = payload["agent_config"]["tasks"][0]["tools_config"]["synthesizer"]
    # Cartesia rejects some voice+language combos (Hindi-catalog voice with
    # language "en" caused a male-default fallback mid-call). Default "hi" for
    # these voices; override with SAHELI_TTS_LANG=en to experiment.
    language = os.environ.get("SAHELI_TTS_LANG", "hi")
    synth["provider"] = "cartesia"
    synth["language"] = language
    synth["provider_config"] = {
        "voice": match["name"].strip(),
        "voice_id": match["voice_id"],
        "model": match.get("model") or "sonic-3",
        "language": language,
    }
    updated = request("PUT", "/agent/" + agent_id, payload)
    print(json.dumps(updated, indent=2))
    print("\nVoice set to Cartesia %s (%s, %s)." % (
        match["name"].strip(), match.get("model"), match.get("accent")))


if __name__ == "__main__":
    main()
