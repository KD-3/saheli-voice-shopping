# Saheli — 4-Minute Demo Script (June 13)

**Setup before the slot (during walk-up):** laptop on projector with amazon.in open and the extension loaded; phone on speaker; run `BOLNA_API_KEY=... ./scripts/preflight.sh --reset` → must say **GO**; dial Saheli and keep her on the line; volume check done during setup.

The three demo products (real listings — open each once in the morning to confirm they're alive):
| Role | Product | Why it works |
|---|---|---|
| Mediocre | [B0CR94KM77](https://www.amazon.in/dp/B0CR94KM77) — sequin kurta, ₹735, 3.8★ × 1.4K | volume + thin-fabric complaint pattern |
| The pick | [B0DG8QR66W](https://www.amazon.in/dp/B0DG8QR66W) — Manyavar chikankari, ₹1,899, 4.1★ | brand + the spec's exact ₹1,899 beat |
| Suspect | [B0GXQ28WND](https://www.amazon.in/dp/B0GXQ28WND) — "chikankari" ₹499, 5.0★ from ONE review | too-good-to-be-true, her best moment |

---

## The arc

**0:00 — Frame (you, 25s).**
"Indians don't buy alone. Before any real purchase we call someone — a sister, a friend who knows fabrics. I built the someone. She's on the phone right now, and she can see my screen."

**0:25 — Voice-driven search (40s).**
Say: **"Saheli, mujhe wedding ke liye kurta chahiye, budget two thousand."**
→ 📝 mission toast appears on screen, search executes itself, results page loads.
Ask: **"Which ones are worth looking at?"** → she scans like a friend, names one or two.
*(The Hinglish ask + the screen moving by itself is the first hook.)*

**1:05 — The mediocre one (50s).**
Say: **"Open the sequin one"** (or click it). **Scroll down to the reviews while asking:** **"What are people actually saying about this?"**
→ she quotes *counts*: "nine of the last forty reviews say the fabric is thin…"
Follow-up: **"Would you wear it to a shaadi?"** → she has a take, not a summary.

**1:55 — The good one (40s).**
Open the Manyavar kurta. Scroll to reviews. Ask: **"This or the sequin one?"**
→ verdict first, the one decisive reason, the trade-off ("a thousand more").

**2:35 — The objection beat (40s) — the personality moment.**
Open the ₹499 suspect. Say: **"Arre this looks the same and it's five hundred bucks. Five stars also! I'm just buying this."**
→ she pushes back: five stars from ONE review, brand-new listing, ₹499 chikankari doesn't exist. *(Room laughs here if the prompt is right.)*

**3:15 — The applause line (30s).**
**"Okay fine. Add the Manyavar one to my cart."**
→ she confirms name + exact price → "confirm?" → **"Yes."**
→ button glows on the projector → click → ✓ toast → she acknowledges.
Optional closer if time: open the cart — **"Where am I at?"** → "Eighteen ninety-nine, well under your two thousand."

**3:45 — Close (15s).**
"Voice because that's how India shops. Bolna's function calling is doing everything you saw — five live tools. Cartesia is the voice. Roadmap: she interjects on her own when the page changes, full Hindi, and an SDK so platforms embed her natively — this is a returns-reduction product wearing a companion's face. Thank you."

---

## Recovery moves (rehearse these too)

- **She mishears** → repeat once, slower. Twice → move on; never debug on stage.
- **"Technical issues" on a function** → tunnel died: narrate over the backup video without apology. ("Let me show you the exact run from last night.")
- **Voice goes male/silent** → hang up, redial (fresh call = fresh synth). 15 seconds of "she'll call right back — like a real friend would" beats dead air.
- **Telephony dead entirely** → Bolna dashboard → Saheli → in-browser test call (laptop mic). Same agent, same functions, same screen magic — only the phone prop is lost. Rehearse this once so it's a pivot, not a scramble.
- **Page scrape misses** → DEMO_MODE serves the baked data for these three ASINs; she'll still answer — keep going, don't mention it.
- **Hard rule:** never claim proactive interjection; it's turn-based and that's roadmap.

## Morning-of checklist
- [ ] `./scripts/preflight.sh --reset` says GO (on venue network AND hotspot)
- [ ] All three demo product pages still live, prices roughly right
- [ ] One full rehearsal on the venue setup, timed
- [ ] Backup video on the desktop, full screen ready
- [ ] Phone on DND-except-Saheli; speaker volume checked at the podium
