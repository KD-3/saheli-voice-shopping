"""
Saheli context server.

In-memory, single file, per SAHELI_SPEC.md §8.2 (+ extensions). Holds whatever
the user is looking at — a product page OR a search results page (POSTed by
the Chrome extension), a session history of viewed products, a single-slot
action queue the extension polls, and an event feed the extension renders as
an on-screen overlay ("Saheli is looking…", "Adding to cart…").

Run:    uvicorn main:app --reload --port 8000
Demo:   DEMO_MODE=1 uvicorn main:app --port 8000   (serves pre-baked kurtas
        when no live scrape has arrived for the session)
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from typing import Any

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from demo_data import (
    DEMO_BOOT_CURRENT,
    DEMO_BOOT_HISTORY,
    DEMO_BOOT_SEARCH,
    DEMO_PRODUCTS,
)
from intelligence import analyze_reviews, discount_note, extract_unit_price, parse_price

DEMO_MODE = os.environ.get("DEMO_MODE", "") in ("1", "true", "yes")
DEFAULT_SESSION = "demo1"
HISTORY_CAP = 10
SNIPPET_CHARS = 220
MAX_SNIPPETS = 5
MAX_SEARCH_RESULTS = 8
EVENT_CAP = 50
LOOKED_THROTTLE_S = 4

app = FastAPI(title="Saheli context server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# session_id -> {"current": page, "current_search": search, "history": [pages],
#                "pending_action": dict|None, "last_action_result": dict|None,
#                "events": [..], "event_seq": int}
SESSIONS: dict[str, dict[str, Any]] = {}


def session(session_id: str) -> dict[str, Any]:
    if session_id not in SESSIONS:
        SESSIONS[session_id] = {
            "current": None,
            "current_search": None,
            "history": [],
            "pending_actions": [],
            "last_action_result": None,
            "events": [],
            "event_seq": 0,
            "mission": None,
            "cart": None,
            "shortlist": [],
            "dispatched": None,
        }
    return SESSIONS[session_id]


def push_event(s: dict, type_: str, text: str, data: dict | None = None) -> None:
    """Feed for the extension's on-screen overlay."""
    if type_ == "looked" and s["events"]:
        last = s["events"][-1]
        if last["type"] == "looked" and time.time() - last["ts"] < LOOKED_THROTTLE_S:
            return
    s["event_seq"] += 1
    event = {"id": s["event_seq"], "type": type_, "text": text, "ts": time.time()}
    if data:
        event["data"] = data
    s["events"].append(event)
    s["events"] = s["events"][-EVENT_CAP:]


def build_receipt(s: dict, product: dict) -> dict:
    """Saheli's homework, made visible: what she checked before the cart."""
    ra = product.get("review_analysis") or {}
    mission = s.get("mission") or {}
    budget_note = None
    b, p = parse_price(mission.get("budget")), parse_price(product.get("price"))
    if b and p:
        budget_note = "✓ under your budget" if p <= b else "⚠ OVER your budget"
    return {
        "name": (product.get("title") or "")[:70],
        "price": product.get("price"),
        "unit_price": product.get("unit_price"),
        "rating": product.get("rating"),
        "review_count": product.get("review_count"),
        "reviews_analyzed": ra.get("reviews_analyzed"),
        "complaints": ["%s (%d mentions)" % (c["theme"], c["count"])
                       for c in ra.get("top_complaints", [])[:2]],
        "red_flags": (ra.get("red_flags") or [])[:2],
        "size_advice": ra.get("size_advice"),
        "mission": mission.get("mission"),
        "budget_note": budget_note,
    }


_JUNK_SNIPPET = ("double tap to read", "brief content visible")


def _real_review(text: str) -> bool:
    t = text.lower()
    return not any(j in t for j in _JUNK_SNIPPET)


def clean_page(raw: dict) -> dict:
    """Trim a scraped product page payload to what the LLM needs."""
    snippets = [
        s.strip()[:SNIPPET_CHARS]
        for s in (raw.get("review_snippets") or [])
        if s and s.strip() and _real_review(s)
    ][:MAX_SNIPPETS]
    specs = raw.get("key_specs") or {}
    if isinstance(specs, dict):
        specs = dict(list(specs.items())[:6])
    critical = (raw.get("critical_review") or "").strip()[:250] or None
    title = (raw.get("title") or "").strip()[:200]
    page = {
        "title": title,
        "price": raw.get("price"),
        "rating": raw.get("rating"),
        "review_count": raw.get("review_count"),
        "seller": raw.get("seller"),
        "key_specs": specs,
        "review_snippets": snippets,
        "top_critical_review": critical,
        "asin": raw.get("asin"),
        "url": raw.get("url"),
        "received_at": raw.get("received_at", time.time()),
    }
    unit = extract_unit_price(title, specs, raw.get("price"))
    if unit:
        page.update(unit)  # quantity, unit_price
    disc = discount_note(raw.get("price"), raw.get("mrp"))
    if disc:
        page["discount"] = disc
    analysis = raw.get("review_analysis") or analyze_reviews(
        raw.get("deep_reviews"), raw.get("rating"))
    if analysis:
        page["review_analysis"] = analysis
    return page


def clean_search(raw: dict) -> dict:
    results = []
    for r in (raw.get("results") or [])[:MAX_SEARCH_RESULTS]:
        item = {
            "position": r.get("position", len(results) + 1),
            "name": (r.get("name") or "")[:90],
            "price": r.get("price"),
            "rating": r.get("rating"),
            "review_count": r.get("review_count"),
            "asin": r.get("asin"),
            "url": r.get("url"),
        }
        unit = extract_unit_price(r.get("name") or "", {}, r.get("price"))
        if unit:
            item["unit_price"] = unit["unit_price"]
        results.append(item)
    return {
        "query": (raw.get("query") or "")[:120],
        "url": raw.get("url"),
        "results": results,
        "received_at": raw.get("received_at", time.time()),
    }


def history_entry(page: dict) -> dict:
    """One compact line per earlier product — this is Saheli's session memory."""
    snippets = page.get("review_snippets") or []
    theme = page.get("top_critical_review") or (snippets[0] if snippets else None)
    entry = {
        "name": (page.get("title") or "")[:90],
        "price": page.get("price"),
        "rating": page.get("rating"),
        "review_count": page.get("review_count"),
        "review_theme": theme[:140] if theme else None,
        "seller": page.get("seller"),
        "asin": page.get("asin"),
    }
    if page.get("unit_price"):
        entry["unit_price"] = page["unit_price"]
    analysis = page.get("review_analysis")
    if analysis:
        entry["complaints"] = [
            "%s (%d mentions)" % (c["theme"], c["count"])
            for c in analysis.get("top_complaints", [])[:2]
        ]
        if analysis.get("red_flags"):
            entry["red_flags"] = analysis["red_flags"][:2]
        if analysis.get("size_advice"):
            entry["size_advice"] = analysis["size_advice"]
    return entry


def search_payload(search: dict) -> dict:
    out = {k: v for k, v in search.items() if k != "received_at"}
    out["seconds_since_scrape"] = int(time.time() - search.get("received_at", time.time()))
    # url per result is for the server's own use; the LLM only needs names/asins
    for r in out["results"]:
        r.pop("url", None)
    return out


@app.get("/health")
def health():
    return {"ok": True, "demo_mode": DEMO_MODE}


@app.post("/context")
async def post_context(request: Request):
    body = await request.json()
    sid = body.get("session_id") or DEFAULT_SESSION
    s = session(sid)

    if body.get("page_type") == "search_results":
        search = clean_search(body)
        if not search["results"]:
            return {"ok": False, "error": "search context with no results"}
        s["current_search"] = search
        return {"ok": True, "results": len(search["results"])}

    if body.get("page_type") == "cart":
        items = [
            {"name": (i.get("name") or "")[:70], "price": i.get("price")}
            for i in (body.get("items") or [])[:10]
        ]
        s["cart"] = {
            "items": items,
            "subtotal": body.get("subtotal"),
            "received_at": time.time(),
        }
        return {"ok": True, "cart_items": len(items)}

    page = clean_page(body)
    if not page["title"] and not page["asin"]:
        return {"ok": False, "error": "empty scrape — missing title and asin"}
    s["current"] = page
    # dedupe by asin so revisits don't flood history; latest scrape wins
    if page["asin"]:
        s["history"] = [p for p in s["history"] if p.get("asin") != page["asin"]]
    s["history"].append(page)
    s["history"] = s["history"][-HISTORY_CAP:]
    return {"ok": True, "history_size": len(s["history"])}


@app.get("/context")
def get_context(session_id: str = DEFAULT_SESSION, silent: int = 0):
    # silent=1: the extension's HUD state-poll, which must NOT emit a "looked"
    # event (only Saheli's real get_current_page calls should).
    s = session(session_id)
    current, search, history = s["current"], s["current_search"], s["history"]

    # action dispatched to the browser but result not back yet — tell the LLM
    # it's WORKING so she doesn't declare failure while the page is loading
    action_in_flight = None
    d = s.get("dispatched")
    if d and s["last_action_result"] is None and time.time() - d["at"] < 12:
        action_in_flight = {
            "type": d["type"],
            "note": ("the browser is executing this right now — the page the user "
                     "sees may still be changing. Wait a beat; do NOT say it failed."),
        }

    if current is None and search is None and DEMO_MODE:
        current = clean_page(DEMO_BOOT_CURRENT)
        history = [clean_page(p) for p in DEMO_BOOT_HISTORY]
        search = clean_search(DEMO_BOOT_SEARCH)
        search["received_at"] = current["received_at"] - 60  # product view wins

    if current is None and search is None:
        if not silent:
            push_event(s, "looked", "Saheli is looking for your screen…")
        return {
            "current_view": None,
            "current_page": None,
            "search_results": None,
            "products_viewed_earlier": [history_entry(p) for p in history],
            "shopping_mission": s["mission"],
            "note": (
                "No page data received yet. You cannot see the user's screen. "
                "Say so plainly and ask what they are looking at. Do not guess."
            ),
            "last_action_result": s["last_action_result"],
        }

    # whichever arrived most recently is what the user is looking at
    page_ts = current.get("received_at", 0) if current else 0
    search_ts = search.get("received_at", 0) if search else 0
    view = "product" if page_ts >= search_ts else "search_results"

    payload_current = None
    if current:
        age = int(time.time() - current.get("received_at", time.time()))
        payload_current = {k: v for k, v in current.items() if k != "received_at"}
        payload_current["seconds_since_scrape"] = age

    earlier = [
        p for p in history
        if not (current and p.get("asin") == current.get("asin"))
    ]
    if not silent:
        push_event(s, "looked", "👀 Saheli is looking at this page…")
    return {
        "current_view": view,
        "current_page": payload_current,
        "search_results": search_payload(search) if search else None,
        "products_viewed_earlier": [history_entry(p) for p in earlier],
        "shortlist": [history_entry(p) for p in s["shortlist"]],
        "shopping_mission": s["mission"],
        "cart": {k: v for k, v in s["cart"].items() if k != "received_at"} if s["cart"] else None,
        "action_in_flight": action_in_flight,
        "last_action_result": s["last_action_result"],
    }


@app.post("/action")
async def post_action(request: Request):
    body = await request.json()
    sid = body.get("session_id") or DEFAULT_SESSION
    s = session(sid)
    asin = (body.get("asin") or "").strip()
    atype = body.get("type") or "add_to_cart"

    # highlight goes through the EVENT stream, not the single-slot action queue —
    # so a following real action (open/cart) can't overwrite it before it fires.
    if atype == "highlight":
        asins = [a.strip() for a in (body.get("asins") or "").split(",") if a.strip()]
        push_event(s, "highlight", "👉 Pointing at options on screen", {"asins": asins})
        return {"ok": True, "highlighted": asins}

    action = {
        "type": atype,
        "asin": asin,
        "product_name": body.get("product_name"),
        "price": body.get("price"),
        "query": body.get("query"),
        "url": body.get("url") or _url_for_asin(s, asin),
        "queued_at": time.time(),
    }
    if atype == "open_search":
        # apply Amazon's REAL price filter via low-price/high-price params + sort
        action["url"] = _search_url(
            body.get("query"), body.get("min_price"), body.get("max_price"), body.get("sort"))
    elif atype == "back_to_results":
        # "show me more options" — return to the EXACT results page she was on
        search = s.get("current_search")
        action["url"] = (search or {}).get("url")
    s["pending_actions"].append(action)  # queue: no action lost
    s["pending_actions"] = s["pending_actions"][-5:]  # cap at 5
    s["last_action_result"] = None
    if atype == "add_to_cart":
        text = "🛒 Adding to cart: %s — %s" % (action["product_name"] or asin, action["price"] or "")
        product = next((p for p in s["history"] if p.get("asin") == asin), None)
        if product is None and asin in DEMO_PRODUCTS:
            product = clean_page(DEMO_PRODUCTS[asin])
        if product:
            push_event(s, "receipt", "🧾 Saheli's homework", build_receipt(s, product))
    elif atype == "open_search":
        text = "🔍 Searching: %s" % (action["query"] or "")
    elif atype == "open_product":
        text = "↗️ Opening: %s" % (action["product_name"] or asin)
    elif atype == "back_to_results":
        text = "↩️ Back to your search results"
    else:
        text = "Saheli queued: %s" % atype
    push_event(s, "action_queued", text.strip(" —"))
    return {"ok": True, "queued": atype, "asin": asin}


_SORT_MAP = {
    "reviews": "review-rank",
    "price_low": "price-asc-rank",
    "price_high": "price-desc-rank",
}


def _search_url(query, min_price, max_price, sort=None) -> str:
    """Amazon search URL with the real price filter (low-price/high-price) + sort."""
    from urllib.parse import quote_plus

    def digits(v):
        v = (str(v) if v is not None else "").strip()
        return v if v.isdigit() else None

    url = "https://www.amazon.in/s?k=" + quote_plus((query or "").strip())
    lo, hi = digits(min_price), digits(max_price)
    if lo:
        url += "&low-price=" + lo
    if hi:
        url += "&high-price=" + hi
    s = _SORT_MAP.get((str(sort) if sort is not None else "").strip().lower())
    if s:
        url += "&s=" + s
    return url


def _url_for_asin(s: dict, asin: str) -> str | None:
    if not asin:
        return None
    for p in s["history"]:
        if p.get("asin") == asin and p.get("url"):
            return p["url"]
    if s["current_search"]:
        for r in s["current_search"]["results"]:
            if r.get("asin") == asin and r.get("url"):
                return r["url"]
    if asin in DEMO_PRODUCTS:
        return DEMO_PRODUCTS[asin]["url"]
    return f"https://www.amazon.in/dp/{asin}"


@app.get("/action")
def get_action(session_id: str = DEFAULT_SESSION):
    s = session(session_id)
    q = s["pending_actions"]
    if not q:
        return Response(status_code=204)
    action = q.pop(0)  # FIFO: oldest first
    s["dispatched"] = {"type": action["type"], "at": time.time()}
    return action


@app.post("/action/result")
async def post_action_result(request: Request):
    body = await request.json()
    sid = body.get("session_id") or DEFAULT_SESSION
    s = session(sid)
    ok = bool(body.get("ok"))
    s["last_action_result"] = {
        "ok": ok,
        "type": body.get("type"),
        "asin": body.get("asin"),
        "error": body.get("error"),
        "reported_at": time.time(),
    }
    if body.get("type") == "add_to_cart":
        push_event(s, "action_done", "✓ Added to cart" if ok else "✗ Couldn't add to cart")
    return {"ok": True}


@app.get("/events")
def get_events(session_id: str = DEFAULT_SESSION, after: int = 0):
    """Overlay feed for the extension. `after` = last event id already seen."""
    s = session(session_id)
    return {
        "events": [e for e in s["events"] if e["id"] > after],
        "last_id": s["event_seq"],
    }


@app.post("/mission")
async def post_mission(request: Request):
    """Saheli files what the user is actually shopping for (the Brief)."""
    body = await request.json()
    sid = body.get("session_id") or DEFAULT_SESSION
    s = session(sid)
    mission = (body.get("mission") or "").strip()[:300]
    if not mission:
        return {"ok": False, "error": "empty mission"}
    clean = lambda k, n: (body.get(k) or "").strip()[:n] or None
    s["mission"] = {
        "mission": mission,
        "budget": clean("budget", 60),
        "occasion": clean("occasion", 80),
        "for_whom": clean("for_whom", 80),
        "size": clean("size", 30),
        "set_at": time.time(),
    }
    push_event(s, "mission", "📝 Noted: %s" % mission[:80])
    return {"ok": True, "mission": s["mission"]}


@app.post("/shortlist")
async def post_shortlist(request: Request):
    """'Rakh lo side mein' — pin a product as a finalist."""
    body = await request.json()
    sid = body.get("session_id") or DEFAULT_SESSION
    s = session(sid)
    asin = (body.get("asin") or "").strip()
    product = next((p for p in s["history"] if p.get("asin") == asin), None)
    if product is None and s["current_search"]:
        # "rakh lo woh teesra wala" — shortlisting straight off the results list
        r = next((r for r in s["current_search"]["results"] if r.get("asin") == asin), None)
        if r:
            product = {
                "title": r.get("name"), "price": r.get("price"), "rating": r.get("rating"),
                "review_count": r.get("review_count"), "asin": asin, "url": r.get("url"),
                "review_snippets": [], "key_specs": {}, "received_at": time.time(),
            }
    if product is None and asin in DEMO_PRODUCTS:
        product = clean_page(DEMO_PRODUCTS[asin])
    if product is None:
        return {"ok": False, "error": "product %s not seen this session" % asin}
    s["shortlist"] = [p for p in s["shortlist"] if p.get("asin") != asin]
    s["shortlist"].append(product)
    s["shortlist"] = s["shortlist"][-5:]
    push_event(s, "shortlist", "📌 Shortlisted: %s" % (product.get("title") or asin)[:60])
    return {"ok": True, "shortlist_size": len(s["shortlist"])}


@app.post("/call")
def trigger_call(session_id: str = DEFAULT_SESSION):
    """Extension's 📞 button: place the outbound Saheli call to the demo phone."""
    key = os.environ.get("BOLNA_API_KEY")
    number = os.environ.get("CALL_NUMBER", "+919919837374")
    agent = os.environ.get("BOLNA_AGENT_ID", "fd1aa41c-d854-46c1-96ac-b9c9eba8cb49")
    if not key:
        return {"ok": False, "error": "BOLNA_API_KEY not set on the server"}
    SESSIONS.pop(session_id, None)  # fresh call = fresh session (clear old brief/finalists)
    req = urllib.request.Request(
        "https://api.bolna.ai/call",
        data=json.dumps({"agent_id": agent, "recipient_phone_number": number}).encode(),
        headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            data = json.loads(r.read().decode() or "{}")
        push_event(session(session_id), "call", "📞 Saheli is calling your phone…")
        return {"ok": True, "execution_id": data.get("execution_id")}
    except urllib.error.HTTPError as e:
        return {"ok": False, "error": e.read().decode()[:200]}
    except urllib.error.URLError as e:
        return {"ok": False, "error": str(e)[:200]}


@app.post("/reset")
def reset(session_id: str = DEFAULT_SESSION):
    """Wipe a session between rehearsals."""
    SESSIONS.pop(session_id, None)
    return {"ok": True}
