"""
Pre-baked product contexts for DEMO_MODE — REAL Amazon.in products (verified
live June 12), so the fallback narrative matches what's on the projector even
if the live scrape dies.

The §11 demo arc ("wedding kurta"):
  1. KURTA_MEDIOCRE — B0CR94KM77, 3.8★ x 1.4K, ₹735. Real volume, sub-4
     rating, fabric complaints. Saheli flags the complaint pattern. (US-3/US-4)
  2. KURTA_GOOD     — B0DG8QR66W, Manyavar 4.1★ x 110, ₹1,899. The safe,
     premium recommendation. (US-2)
  3. KURTA_SUSPECT  — B0GXQ28WND, 5.0★ from ONE review, ₹499 "chikankari".
     Too good to be true — the dissuasion beat. (US-4)

Pre-demo morning: re-verify all three pages still exist and prices roughly
match (scripts/preflight.sh checks the plumbing, not the listings).
"""

DEMO_SESSION_ID = "demo1"

KURTA_MEDIOCRE = {
    "session_id": DEMO_SESSION_ID,
    "url": "https://www.amazon.in/dp/B0CR94KM77",
    "asin": "B0CR94KM77",
    "title": "Men's Sequince Embroidered Cotton Blend Only Slim Fit Kurta - Festive & Wedding Wear",
    "price": "₹735",
    "rating": "3.8 out of 5 stars",
    "review_count": "1,432 ratings",
    "review_snippets": [
        "Design looks exactly like the photos and delivery was quick. But the fabric is much thinner than I expected for wedding wear.",
        "Wore it once to a function, looked good in photos. Fabric runs thin though, had to wear an inner. Fit is true to size.",
        "Good embroidery work for the price. Material quality is average — feels flimsy. For one or two wears it is fine.",
        "The kurta looks royal in pictures but in hand the cloth is quite thin and light. Slightly disappointed.",
        "Nice colour, comfortable in heat actually because the fabric is thin. Depends what you want it for.",
    ],
    "critical_review": "The kurta looks royal in pictures but the cloth is quite thin — almost see-through in daylight. Had to buy an inner separately to wear it to the function.",
    "review_analysis": {
        "reviews_analyzed": 38,
        "recent_avg_rating": 3.6,
        "rating_drift": -0.2,
        "negative_share": 0.34,
        "top_complaints": [
            {"theme": "quality/material", "count": 9, "example": "Fabric is much thinner than expected, almost see-through in daylight"},
            {"theme": "build/durability", "count": 4, "example": "Sequins started coming off after the first gentle wash"},
        ],
        "red_flags": [],
    },
    "seller": "Cocoblu Retail",
    "key_specs": {
        "Material": "Cotton Blend",
        "Fit": "Slim Fit",
        "Sleeve": "Full Sleeve",
        "Occasion": "Festive, Wedding",
        "Care": "Hand Wash Only",
        "Pattern": "Embroidered",
    },
}

KURTA_GOOD = {
    "session_id": DEMO_SESSION_ID,
    "url": "https://www.amazon.in/dp/B0DG8QR66W",
    "asin": "B0DG8QR66W",
    "title": "Manyavar Men's Viscose Chikankari Sequined Kurta (1pc) - Wedding Collection",
    "price": "₹1,899",
    "rating": "4.1 out of 5 stars",
    "review_count": "110 ratings",
    "review_snippets": [
        "Premium feel, the chikankari work is genuinely neat. Wore it for my brother's sangeet and got compliments all evening.",
        "Manyavar quality as expected. Fabric has a nice fall and the sequin work is subtle, doesn't look gaudy. Worth the price.",
        "Perfect fit, rich look. The stitching and finishing are a clear step above other kurtas I've ordered online.",
        "Bought for a wedding, the fabric drapes really well. Holds up after dry cleaning, no loose threads.",
        "Slightly snug at the shoulders, consider one size up. Otherwise the material and finish are top class.",
    ],
    "critical_review": "Slightly snug at the shoulders, consider one size up. That's honestly the only complaint — material and finish are top class.",
    "review_analysis": {
        "reviews_analyzed": 35,
        "recent_avg_rating": 4.2,
        "rating_drift": 0.1,
        "negative_share": 0.09,
        "top_complaints": [
            {"theme": "size/fit", "count": 3, "example": "Snug at the shoulders, consider one size up"},
        ],
        "red_flags": [],
    },
    "seller": "Vedant Fashions Ltd (Manyavar)",
    "key_specs": {
        "Material": "Viscose",
        "Fit": "Regular",
        "Sleeve": "Full Sleeve",
        "Occasion": "Wedding, Festive",
        "Care": "Dry Clean Only",
        "Pattern": "Chikankari with Sequins",
    },
}

KURTA_SUSPECT = {
    "session_id": DEMO_SESSION_ID,
    "url": "https://www.amazon.in/dp/B0GXQ28WND",
    "asin": "B0GXQ28WND",
    "title": "Men's Lakhnawi Chikankari Cotton Blend Ethnic Wear Kurta for Wedding Best Quality (Free Size)",
    "price": "₹499",
    "rating": "5.0 out of 5 stars",
    "review_count": "1 rating",
    "review_snippets": [
        "Best product nice quality fast delivery",
    ],
    "critical_review": None,
    # one review — the analyzer would stay silent; the thin-review signal IS the story
    "seller": "RS Enterprise",
    "key_specs": {
        "Material": "Cotton Blend",
        "Fit": "Free Size",
        "Occasion": "Wedding, Party",
    },
}

DEMO_PRODUCTS = {p["asin"]: p for p in (KURTA_MEDIOCRE, KURTA_GOOD, KURTA_SUSPECT)}

# The state DEMO_MODE boots with: user has "viewed" the mediocre and good kurtas,
# and is currently on the suspect one — Saheli can demo comparison + dissuasion
# immediately, with zero browsing.
DEMO_BOOT_CURRENT = KURTA_SUSPECT
DEMO_BOOT_HISTORY = [KURTA_MEDIOCRE, KURTA_GOOD, KURTA_SUSPECT]


def _as_result(position, p, review_count=None):
    return {
        "position": position,
        "name": p["title"],
        "price": p["price"],
        "rating": p["rating"],
        "review_count": review_count or p["review_count"],
        "asin": p["asin"],
        "url": p["url"],
    }


# Pre-baked search results so the voice-search beat survives a dead scrape too.
# Fillers are real products from the same live search.
DEMO_BOOT_SEARCH = {
    "session_id": DEMO_SESSION_ID,
    "page_type": "search_results",
    "query": "men wedding kurta",
    "url": "https://www.amazon.in/s?k=men+wedding+kurta",
    "results": [
        _as_result(1, KURTA_MEDIOCRE),
        {
            "position": 2,
            "name": "Men's Cotton Polyester Blend Solid Regular Fit Full Sleeve Kurta",
            "price": "₹496",
            "rating": "4.0 out of 5 stars",
            "review_count": "2,800",
            "asin": "B0DHXHZK8F",
            "url": "https://www.amazon.in/dp/B0DHXHZK8F",
        },
        _as_result(3, KURTA_GOOD),
        _as_result(4, KURTA_SUSPECT),
        {
            "position": 5,
            "name": "Men's Silk Chikankari Kurta with Cream Churidar | Festive Set",
            "price": "₹730",
            "rating": "4.0 out of 5 stars",
            "review_count": "316",
            "asin": "B0CPWKHLMR",
            "url": "https://www.amazon.in/dp/B0CPWKHLMR",
        },
    ],
}
