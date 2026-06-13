# Saheli — voice AI companion that shops with you

A voice companion on a phone call while you browse Amazon.in. She sees the product page you're on, compares it with what you viewed earlier in the call, talks you out of bad buys, and adds to cart when you say so. Built for the Bolna x Cartesia Voc-A-Thon. Full spec: [SAHELI_SPEC.md](SAHELI_SPEC.md).

```
extension (Chrome MV3)  →  context server (FastAPI)  ←  Bolna agent (Cartesia TTS)
   scrapes product+search        /context  /action  /events    get_current_page, add_to_cart,
   pages, polls actions,         in-memory, session demo1      open_product, search_amazon
   clicks cart, shows overlay
```

Beyond the spec MVP, three extensions are built in: **voice-driven search** (`search_amazon` opens results on screen and Saheli sees the top organic hits), an **on-screen presence overlay** (toasts on the page when Saheli looks, queues an action, or finishes one — judges who can't hear the phone can see her), and **critical-review scraping** (her dissuasion ammo comes from the top critical review, not just the positive-skewed top reviews).

## Setup (once)

```bash
python3 -m venv .venv && ./.venv/bin/pip install -r server/requirements.txt
export BOLNA_API_KEY=...        # from Bolna dashboard
```

**Tonight's path (voice before plumbing):**

1. **Server + tunnel:** `./scripts/run_local.sh --demo` — boots the server in DEMO_MODE (pre-baked kurta data, no extension needed) and prints the ngrok URL.
2. **Throwaway dashboard agent:** in the Bolna dashboard, create any agent and set its voice to **Cartesia** (model `sonic-3-preview`). Audition 3 voices with the same paragraph; pick by ear — warm adult female, English-India or neutral-warm. Note its agent id.
3. **Create Saheli:**
   ```bash
   export SERVER_URL=<ngrok url>
   python3 bolna/create_agent.py --from-existing <throwaway_agent_id>
   ```
   This clones the dashboard agent's exact config (keeps the Cartesia voice block verbatim), patches in [bolna/system_prompt.txt](bolna/system_prompt.txt) and the four functions, and creates the Saheli agent. Verify in the dashboard: Functions tab shows `get_current_page`, `add_to_cart`, `open_product`, `search_amazon`; turn **interruption handling ON** (and backchanneling if available).
4. **Attach a phone number** to the agent in the dashboard (inbound or outbound — code doesn't care) and make the first test call against the DEMO_MODE data.

**Prompt iteration loop (the actual product):** edit `bolna/system_prompt.txt` → `python3 bolna/create_agent.py --update <saheli_agent_id>` → call again. Six targeted calls, one behavior each:

1. Page awareness — "what do you think of this one?"
2. Comparison — "this or the one before?"
3. Dissuasion — "I'm just going to buy this" (on the cheap suspect kurta)
4. Hallucination resistance — ask about a spec NOT on the page ("does it shrink?")
5. Confirmation flow — "add it to my cart" (must confirm exact product + price first)
6. Stale context — ask about the page before browsing anything (`curl -X POST '<server>/reset?session_id=demo1'` first, non-demo mode)
7. Search — "find me wedding kurtas under two thousand" (she searches, then scans the results like a friend, doesn't read the list)

After each call, edit the **prompt**, not the code.

## Extension (June 12)

1. Set `SERVER_URL` in [extension/config.js](extension/config.js) to the ngrok URL.
2. `chrome://extensions` → Developer mode → **Load unpacked** → the `extension/` folder. Reload it after any config change.
3. Browse Amazon.in product pages; the server logs each `POST /context`. If a field comes back null, fix the selector in `config.js` only — that's the 60-second-fix surface.

Run live (not demo) mode once the extension works: `./scripts/run_local.sh`. DEMO_MODE still serves pre-baked data if the live scrape fails, so it's safe to leave on `--demo` for the actual demo.

## Tests

```bash
PATH="$PWD/.venv/bin:$PATH" ./scripts/smoke.sh   # 16 endpoint tests, boots its own server
```

## Demo day checklist (June 13)

- [ ] `run_local.sh --demo` up; ngrok URL unchanged since June 12 (if changed: config.js + `--update` + reload extension)
- [ ] `curl <url>/health` from the venue network
- [ ] Pre-open the three demo product pages; verify scrape on each (server logs)
- [ ] `curl -X POST '<url>/reset?session_id=demo1'` right before the slot
- [ ] Phone: DND except Saheli's number; volume check during setup, not during the slot
- [ ] Backup video on the laptop desktop; phone hotspot as secondary network
- [ ] Demo ASINs in [server/demo_data.py](server/demo_data.py) swapped for the real three products

**The 4-minute arc (with voice search opening):** insight framing → *"Saheli, show me wedding kurtas under two thousand"* (results appear on projector, she scans them aloud) → "open the first one" → mediocre kurta (she flags the complaint) → good kurta (she compares) → "I'm tempted by the cheap one" (she talks you out) → "add the good one" (confirm → button glows → visible click + ✓ toast) → roadmap one-breath close. If the search beat feels shaky in rehearsal, fall back to the original manual-browsing arc — everything else is unchanged.

## Definition of done (June 12 submission, spec §15)

- [ ] Live call: grounded, opinionated answer about a real product page
- [ ] Comparison across two viewed products
- [ ] One dissuasion behavior demonstrated
- [ ] Hallucination test passes (absent spec → honest answer)
- [ ] add_to_cart works on the three demo ASINs (or consciously cut)
- [ ] Backup video recorded
- [ ] DEMO_MODE fallback tested
