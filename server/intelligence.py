"""
Deterministic product intelligence for Saheli — no LLM, no external APIs.

- analyze_reviews: complaint themes WITH COUNTS, recent-vs-overall rating
  drift, and scam signals, mined from deep-fetched reviews (extension ships
  ~20-40 from the product's recent + critical review pages).
- extract_unit_price: quantity parsing ("1kg", "24 bars", "pack of 2") and
  ₹-per-unit math, so Saheli can say "the refill works out costlier per kilo".
"""

from __future__ import annotations

import re
from collections import Counter

# theme -> keywords (matched as substrings, lowercase). Order = display priority.
ASPECTS = {
    "build/durability": ["stitch", "tear", "rip", "broke", "broken", "crack",
                         "durab", "fell apart", "came apart", "damage", "bent"],
    "quality/material": ["quality", "material", "fabric", "cloth", "flimsy",
                         "cheap quality", "thin", "plastic"],
    "size/fit": ["size", "fit ", "fits", "fitting", "too small", "too large",
                 "tight", "loose"],
    "authenticity": ["fake", "original", "genuine", "duplicate", "counterfeit",
                     "seal", "tamper"],
    "taste/mixability": ["taste", "flavor", "flavour", "sweet", "bitter",
                         "mixab", "dissolv", "lumps", "smell"],
    "comfort/grip": ["comfort", "grip", "soft", "itchy", " itch", "rash", "hurts"],
    "delivery/packaging": ["packag", "box was", "damaged in", "late deliver",
                           "leaked", "spill"],
    "seller/returns": ["return", "refund", "seller", "replace", "no response",
                       "not responding"],
    "effectiveness": ["useless", "waste of", "doesn't work", "does not work",
                      "no result", "no effect"],
    "battery": ["battery", "charge", "charging"],
    "sound": ["sound", "bass", "volume", "mic "],
}

_RATING_RE = re.compile(r"(\d+(?:\.\d+)?)")
_DATE_RE = re.compile(r"on (\d{1,2} \w+ \d{4})")


def _parse_rating(value) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    m = _RATING_RE.search(str(value or ""))
    return float(m.group(1)) if m else None


def analyze_reviews(deep_reviews: list, overall_rating) -> dict | None:
    """deep_reviews: [{rating, date?, text}] — returns mined evidence or None."""
    reviews = []
    for r in deep_reviews or []:
        text = (r.get("text") or "").strip()
        rating = _parse_rating(r.get("rating"))
        if text and rating is not None:
            reviews.append({"rating": rating, "text": text,
                            "date": (r.get("date") or "").strip()})
    if len(reviews) < 5:
        return None

    ratings = [r["rating"] for r in reviews]
    recent_avg = round(sum(ratings) / len(ratings), 1)
    overall = _parse_rating(overall_rating)

    # complaint themes: count distinct negative reviews mentioning each theme
    negatives = [r for r in reviews if r["rating"] <= 3]
    complaints = []
    for theme, keywords in ASPECTS.items():
        hits = [r for r in negatives
                if any(k in r["text"].lower() for k in keywords)]
        if len(hits) >= 2:
            example = min(hits, key=lambda r: len(r["text"]))["text"][:120]
            complaints.append({"theme": theme, "count": len(hits), "example": example})
    complaints.sort(key=lambda c: -c["count"])

    red_flags = []
    # rating drift: recent buyers measurably unhappier than the lifetime average
    drift = None
    if overall:
        drift = round(recent_avg - overall, 1)
        if drift <= -0.5:
            red_flags.append(
                "recent reviews average %.1f vs %.1f overall — recent buyers are unhappier" % (recent_avg, overall))
    # five-star burst: several 5-star reviews on the same date
    dates = Counter(m.group(1) for r in reviews if r["rating"] >= 5
                    for m in [_DATE_RE.search(r["date"])] if m)
    for date, n in dates.items():
        if n >= 4:
            red_flags.append("%d five-star reviews posted on the same day (%s)" % (n, date))
            break
    # generic spam: lots of very short 5-star texts
    five = [r for r in reviews if r["rating"] >= 5]
    if len(five) >= 6:
        short = [r for r in five if len(r["text"]) < 35]
        if len(short) / len(five) >= 0.5:
            red_flags.append("many five-star reviews are one-liners — possible padding")

    return {
        "reviews_analyzed": len(reviews),
        "recent_avg_rating": recent_avg,
        "rating_drift": drift,
        "negative_share": round(len(negatives) / len(reviews), 2),
        "top_complaints": complaints[:3],
        "red_flags": red_flags,
        "size_advice": _size_advice(reviews),
    }


_SIZE_UP = ["size up", "runs small", "too small", "too tight", "order one size larger",
            "order a size up", "snug", "smaller than expected"]
_SIZE_DOWN = ["size down", "runs large", "runs big", "too large", "too loose", "too big",
              "order a size down", "bigger than expected", "very loose"]


def _size_advice(reviews: list) -> str | None:
    """Direction of fit complaints across ALL reviews (happy buyers flag fit too)."""
    up = down = 0
    for r in reviews:
        text = r["text"].lower()
        if any(k in text for k in _SIZE_UP):
            up += 1
        if any(k in text for k in _SIZE_DOWN):
            down += 1
    if up >= 2 and up > down:
        return "runs small — %d reviews say size up" % up
    if down >= 2 and down > up:
        return "runs large — %d reviews say size down" % down
    if up >= 2 and down >= 2:
        return "fit complaints both ways — sizing is inconsistent"
    return None


# ---------------------------------------------------------------- unit price

_PRICE_RE = re.compile(r"([\d,]+(?:\.\d+)?)")
_QTY_RE = re.compile(
    r"(\d+(?:\.\d+)?)\s*(kg|kilo|g\b|gm\b|gram|l\b|ltr|litre|liter|ml|"
    r"bars?\b|pieces?\b|pcs\b|tablets?\b|capsules?\b|sachets?\b|count\b)",
    re.IGNORECASE)
_PACK_RE = re.compile(r"pack of (\d+)|set of (\d+)|combo of (\d+)", re.IGNORECASE)

_TO_BASE = {  # unit -> (base unit, multiplier to base)
    "kg": ("kg", 1), "kilo": ("kg", 1), "g": ("kg", 0.001), "gm": ("kg", 0.001),
    "gram": ("kg", 0.001), "l": ("litre", 1), "ltr": ("litre", 1),
    "litre": ("litre", 1), "liter": ("litre", 1), "ml": ("litre", 0.001),
    "bar": ("piece", 1), "bars": ("piece", 1), "piece": ("piece", 1),
    "pieces": ("piece", 1), "pcs": ("piece", 1), "tablet": ("piece", 1),
    "tablets": ("piece", 1), "capsule": ("piece", 1), "capsules": ("piece", 1),
    "sachet": ("piece", 1), "sachets": ("piece", 1), "count": ("piece", 1),
}


def parse_price(price_str) -> float | None:
    m = _PRICE_RE.search(str(price_str or "").replace(",", ""))
    return float(m.group(1)) if m else None


def discount_note(price_str, mrp_str) -> dict | None:
    """MRP theatre detector: huge 'discounts' off inflated MRPs are marketing."""
    price, mrp = parse_price(price_str), parse_price(mrp_str)
    if not price or not mrp or mrp <= price:
        return None
    pct = round((mrp - price) / mrp * 100)
    out = {"mrp": mrp_str, "claimed_discount": "%d%% off" % pct}
    if pct >= 55:
        out["note"] = ("discount looks inflated — a %d%% markdown usually means "
                       "the MRP is theatre, judge the selling price on its own" % pct)
    return out


def extract_unit_price(title: str, specs: dict, price_str) -> dict | None:
    """Best-effort ₹-per-unit from title/specs. Returns {quantity, unit_price}."""
    price = parse_price(price_str)
    if not price:
        return None
    haystack = " ".join([title or ""] + [str(v) for v in (specs or {}).values()])

    qty_base = unit_base = None
    for m in _QTY_RE.finditer(haystack):
        num, unit = float(m.group(1)), m.group(2).lower().rstrip(".")
        base, mult = _TO_BASE.get(unit, (None, None))
        if not base:
            continue
        value = num * mult
        # prefer weight/volume over piece counts; prefer larger quantities
        if unit_base is None or (unit_base == "piece" and base != "piece"):
            qty_base, unit_base = value, base
        elif base == unit_base and value > qty_base:
            qty_base = value
    if not qty_base:
        return None

    pack = 1
    pm = _PACK_RE.search(haystack)
    if pm:
        pack = int(next(g for g in pm.groups() if g))
    # "Pack of N" + a weight is ambiguous (weight may be per-unit OR total);
    # being 10x wrong out loud is worse than staying quiet
    if pack > 1 and unit_base != "piece":
        return None
    total = qty_base * pack

    per = price / total
    if unit_base == "piece":
        unit_price = "about ₹%d per piece" % round(per)
        quantity = "%d piece%s" % (total, "s" if total > 1 else "")
    else:
        unit_price = "about ₹%d per %s" % (round(per), unit_base)
        quantity = ("%.1f %s" % (total, unit_base)).replace(".0 ", " ")
    return {"quantity": quantity, "unit_price": unit_price}
