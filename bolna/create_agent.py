#!/usr/bin/env python3
"""
Create / update the Saheli agent on Bolna via API. Stdlib only.

Env:
  BOLNA_API_KEY   required
  SERVER_URL      public URL of the context server (ngrok/Railway), required
                  for anything that writes functions
  SESSION_ID      default "demo1"

Usage:
  python create_agent.py --get AGENT_ID
      Fetch an agent's full JSON (saved to agent_snapshot.json). Use this to
      inspect the exact Cartesia synthesizer block of a dashboard-made agent.

  python create_agent.py --from-existing AGENT_ID
      RECOMMENDED. Clone a dashboard-created agent (keeps its Cartesia voice,
      transcriber, telephony config verbatim), patch in the Saheli prompt +
      the three custom functions, and create it as a NEW agent.

  python create_agent.py --update AGENT_ID
      Re-push system_prompt.txt + functions onto an existing agent. This is
      the prompt-iteration loop: edit system_prompt.txt, run this, call again.

  python create_agent.py --create-from-template
      Last resort if no dashboard agent exists: create from
      agent_template.json (synthesizer block must be filled in first).
"""

import argparse
import copy
import json
import os
import sys
import urllib.error
import urllib.request

API_BASES = ["https://api.bolna.ai/v2", "https://api.bolna.ai"]
HERE = os.path.dirname(os.path.abspath(__file__))
SESSION_ID = os.environ.get("SESSION_ID", "demo1")


def api_key():
    key = os.environ.get("BOLNA_API_KEY")
    if not key:
        sys.exit("BOLNA_API_KEY is not set")
    return key


def server_url():
    url = os.environ.get("SERVER_URL", "").rstrip("/")
    if not url.startswith("http"):
        sys.exit("SERVER_URL is not set (your ngrok/Railway URL, e.g. https://x.ngrok.app)")
    return url


def request(method, path, body=None):
    """Try /v2 first, fall back to legacy base. Returns parsed JSON."""
    data = json.dumps(body).encode() if body is not None else None
    last_err = None
    for base in API_BASES:
        req = urllib.request.Request(
            base + path,
            data=data,
            method=method,
            headers={
                "Authorization": "Bearer " + api_key(),
                "Content-Type": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode() or "{}")
        except urllib.error.HTTPError as e:
            detail = e.read().decode()[:500]
            last_err = "%s %s%s -> HTTP %s: %s" % (method, base, path, e.code, detail)
            if e.code == 404:
                continue  # endpoint not on this base; try the next one
            sys.exit(last_err)
        except urllib.error.URLError as e:
            last_err = "%s %s%s -> %s" % (method, base, path, e)
    sys.exit(last_err)


# ---------------------------------------------------------------- functions

def saheli_functions(server):
    """The three custom_task functions, per SAHELI_SPEC.md §8.3 + Bolna tool format."""
    return [
        {
            "name": "get_current_page",
            "description": (
                "Fetch what the user is currently looking at in their browser — "
                "either a product page or a list of search results — plus a summary "
                "of products they viewed earlier in this call. Call this whenever "
                "the user refers to what they are seeing ('this one', 'the third "
                "one'), asks for an opinion or comparison, after you search, or "
                "whenever you suspect the page may have changed since your last look."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
            "key": "custom_task",
            "pre_call_message": "One sec, let me take a look...",
            "value": {
                "method": "GET",
                "param": {},
                "url": "%s/context?session_id=%s" % (server, SESSION_ID),
                "headers": {},
            },
        },
        {
            "name": "add_to_cart",
            "description": (
                "Add a specific product to the user's cart. Only call AFTER the "
                "user has verbally confirmed the exact product and price. Never "
                "call this speculatively."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "asin": {"type": "string", "description": "Amazon ASIN of the product to add"},
                    "product_name": {"type": "string"},
                    "price": {"type": "string"},
                },
                "required": ["asin", "product_name"],
            },
            "key": "custom_task",
            "pre_call_message": "Haan, adding it to your cart...",
            "value": {
                "method": "POST",
                "param": {
                    "type": "add_to_cart",
                    "session_id": SESSION_ID,
                    "asin": "%(asin)s",
                    "product_name": "%(product_name)s",
                    "price": "%(price)s",
                },
                "url": server + "/action",
                "headers": {"Content-Type": "application/json"},
            },
        },
        {
            "name": "open_product",
            "description": (
                "Open a product page in the user's browser — a product viewed "
                "earlier in this call OR one from the current search results. Use "
                "when the user says things like 'open the third one', 'go back to "
                "the first one' or 'open the Manyavar one'. Pass that product's "
                "ASIN from the earlier-viewed list or the search results."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "asin": {"type": "string", "description": "Amazon ASIN of the product to open"},
                    "product_name": {"type": "string"},
                },
                "required": ["asin"],
            },
            "key": "custom_task",
            "pre_call_message": "Opening it on your screen...",
            "value": {
                "method": "POST",
                "param": {
                    "type": "open_product",
                    "session_id": SESSION_ID,
                    "asin": "%(asin)s",
                    "product_name": "%(product_name)s",
                },
                "url": server + "/action",
                "headers": {"Content-Type": "application/json"},
            },
        },
        {
            "name": "search_amazon",
            "description": (
                "Search Amazon.in for products. The results open in the user's "
                "browser; see the top results via get_current_page. Use when the "
                "user asks to find something. If they give a price range or budget, "
                "ALWAYS pass min_price and/or max_price (in rupees) — this applies "
                "the real price filter on Amazon, which putting numbers in the "
                "query text does NOT do. Keep the query about the product itself "
                "(e.g. 'wedding kurta men'), not the price."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Product query only, e.g. 'wedding kurta men' (no price)",
                    },
                    "min_price": {
                        "type": "string",
                        "description": "Lower price bound in rupees, digits only, e.g. '3000'. Omit if none.",
                    },
                    "max_price": {
                        "type": "string",
                        "description": "Upper price bound in rupees, digits only, e.g. '5000'. Omit if none.",
                    },
                    "sort": {
                        "type": "string",
                        "description": "Optional ordering: 'reviews' (best-reviewed first), 'price_low' (cheapest first), or 'price_high'. Omit for relevance.",
                    },
                },
                "required": ["query"],
            },
            "key": "custom_task",
            "pre_call_message": "Okay, searching...",
            "value": {
                "method": "POST",
                "param": {
                    "type": "open_search",
                    "session_id": SESSION_ID,
                    "query": "%(query)s",
                    "min_price": "%(min_price)s",
                    "max_price": "%(max_price)s",
                    "sort": "%(sort)s",
                },
                "url": server + "/action",
                "headers": {"Content-Type": "application/json"},
            },
        },
        {
            "name": "set_mission",
            "description": (
                "Write down what the user is actually shopping for — the thing, "
                "the purpose, the budget, any constraints — as soon as they tell "
                "you. It is echoed back to you on every get_current_page so you "
                "never lose track. Update it whenever the goal or budget changes."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "mission": {
                        "type": "string",
                        "description": "One line, e.g. 'wedding kurta under 2000 for himself'",
                    },
                    "budget": {
                        "type": "string",
                        "description": "Stated budget if any, e.g. 'under ₹2,000'",
                    },
                    "occasion": {
                        "type": "string",
                        "description": "The occasion if known, e.g. 'friend's wedding, evening function'",
                    },
                    "for_whom": {
                        "type": "string",
                        "description": "Who it's for if not the user, e.g. 'his mother, 60s, likes pastels'",
                    },
                    "size": {
                        "type": "string",
                        "description": "Size if apparel and known, e.g. 'L, usually 40'",
                    },
                },
                "required": ["mission"],
            },
            "key": "custom_task",
            "value": {
                "method": "POST",
                "param": {
                    "session_id": SESSION_ID,
                    "mission": "%(mission)s",
                    "budget": "%(budget)s",
                    "occasion": "%(occasion)s",
                    "for_whom": "%(for_whom)s",
                    "size": "%(size)s",
                },
                "url": server + "/mission",
                "headers": {"Content-Type": "application/json"},
            },
        },
        {
            "name": "shortlist_product",
            "description": (
                "Pin a product as a finalist — the 'keep this one aside' move. "
                "Use when the user says to shortlist/save/keep a product, or when "
                "you both agree it's a serious contender. Shortlisted products "
                "come back to you on every get_current_page under 'shortlist'; "
                "when the user asks to compare the shortlist, compare exactly "
                "those. Pass the product's ASIN."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "asin": {"type": "string", "description": "Amazon ASIN of the product to shortlist"},
                    "product_name": {"type": "string"},
                },
                "required": ["asin"],
            },
            "key": "custom_task",
            "pre_call_message": "Haan, keeping it aside...",
            "value": {
                "method": "POST",
                "param": {
                    "session_id": SESSION_ID,
                    "asin": "%(asin)s",
                    "product_name": "%(product_name)s",
                },
                "url": server + "/shortlist",
                "headers": {"Content-Type": "application/json"},
            },
        },
        {
            "name": "point_at_products",
            "description": (
                "Spotlight products on the user's screen — scrolls to them and "
                "outlines them — while you talk about them. Call this as you "
                "present or recommend options from the current search results, "
                "passing the ASINs of the ones you are naming, so the user SEES "
                "what you mean and not just hears it. Comma-separate up to three "
                "ASINs. This is silent and instant; keep talking as you call it."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "asins": {
                        "type": "string",
                        "description": "Comma-separated ASINs to spotlight, e.g. 'B0AAA11111,B0BBB22222'",
                    },
                },
                "required": ["asins"],
            },
            "key": "custom_task",
            "value": {
                "method": "POST",
                "param": {
                    "session_id": SESSION_ID,
                    "type": "highlight",
                    "asins": "%(asins)s",
                },
                "url": server + "/action",
                "headers": {"Content-Type": "application/json"},
            },
        },
        {
            "name": "show_search_results",
            "description": (
                "Navigate the user's browser BACK to the search results they were "
                "viewing. Use whenever they ask to see more options, other choices, "
                "go back, or 'what else is there' while they are on a single "
                "product page. This actually MOVES their screen to the results — "
                "always do this instead of only reading options aloud."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
            "key": "custom_task",
            "pre_call_message": "Haan, wapas options pe chalte hain...",
            "value": {
                "method": "POST",
                "param": {
                    "type": "back_to_results",
                    "session_id": SESSION_ID,
                },
                "url": server + "/action",
                "headers": {"Content-Type": "application/json"},
            },
        },
    ]


# ----------------------------------------------------------------- patching

def patch_agent(payload, prompt, functions):
    """Patch prompt + functions into a full {agent_config, agent_prompts} payload."""
    payload = copy.deepcopy(payload)
    cfg = payload.get("agent_config", payload)

    cfg["agent_name"] = "Saheli"
    cfg["agent_welcome_message"] = "Hi, Saheli here! What are we buying today?"

    prompts = payload.setdefault("agent_prompts", {})
    prompts.setdefault("task_1", {})["system_prompt"] = prompt

    # persona gold per spec §8.3: backchanneling + fillers ON when the plan has them
    try:
        task_config = cfg["tasks"][0].setdefault("task_config", {})
        task_config["backchanneling"] = True
        task_config["use_fillers"] = True
        # silence while browsing is normal — don't nag "are you there" at 10s
        task_config["trigger_user_online_message_after"] = 25
        # the agent must NEVER end the call itself (it was hanging up right after
        # "anything else?" without waiting). Only the user / silence / cap ends it.
        task_config["hangup_after_LLMCall"] = False
        # shoppers browse and read in silence — 30s default was killing calls
        # mid-think. She nudges at 25s ("still there?"), hangs up only after 5 min.
        task_config["hangup_after_silence"] = 300
        task_config["call_hangup_message"] = {
            "en": "Okay, I'll let you go! Call me anytime before you buy. Bye!",
            "hi": "Theek hai! Kuch bhi lene se pehle call karna. Bye!",
        }
    except (KeyError, IndexError, TypeError):
        pass

    # boost the shopping vocabulary so the transcriber stops mishearing Hindi
    # product words ("kurta" was coming through as "kutta"). Deepgram keyword
    # format: word:intensity, comma-separated. Keyword boosting only works on
    # nova-2 for Hindi (nova-3 ignores it), so pin nova-2/hi — also survives the
    # dashboard saves that keep reverting the transcriber to nova-3.
    try:
        transcriber = cfg["tasks"][0]["tools_config"]["transcriber"]
        model = str(transcriber.get("model", "")).lower()
        if "flux" in model:
            # Flux handles code-switching + interruptions natively. But Bolna left
            # its model-based turn-detection params null → it waited too long to
            # see end-of-turn and went SILENT mid-conversation. Tune responsive:
            # threshold 0.5-0.9 (lower = quicker), timeout 300-3000ms (shorter = quicker).
            transcriber["eot_threshold"] = 0.6
            transcriber["eot_timeout_ms"] = 700
        else:
            transcriber["provider"] = "deepgram"
            transcriber["model"] = "nova-2"
            transcriber["language"] = "hi"
            transcriber["keywords"] = (
                "kurta:3,kurti:2,kurtas:2,kurta pajama:2,shirt:2,shirts:2,"
                "shorts:2,jeans:1,trousers:1,Manyavar:3,sherwani:2,saree:1,"
                "lehenga:1,chikankari:2,dupatta:1,sequined:1,shortlist:1,"
                "cart:1,whey:1,protein:1,isolate:1"
            )
    except (KeyError, IndexError, TypeError):
        pass

    # Bolna's API splits each function into a definition (api_tools.tools) and
    # its request config keyed by name (api_tools.tools_params) — confirmed by
    # the API's own validation errors. Replace our functions, keep any others.
    try:
        tools_config = cfg["tasks"][0]["tools_config"]
    except (KeyError, IndexError, TypeError):
        sys.exit("Could not find tasks[0].tools_config in the agent payload — "
                 "inspect agent_snapshot.json and adjust.")
    our_names = {f["name"] for f in functions}
    api_tools = tools_config.get("api_tools")
    if not isinstance(api_tools, dict):
        api_tools = {}
    kept_tools = [
        t for t in (api_tools.get("tools") or [])
        if not (isinstance(t, dict) and t.get("name") in our_names)
    ]
    kept_params = {
        k: v for k, v in (api_tools.get("tools_params") or {}).items()
        if k not in our_names
    }
    tools_config["api_tools"] = {
        "tools": kept_tools + [{k: v for k, v in f.items() if k != "value"} for f in functions],
        "tools_params": {**kept_params, **{f["name"]: f["value"] for f in functions}},
    }
    return payload


def strip_readonly(payload):
    cfg = payload.get("agent_config", payload)
    for k in ("agent_id", "id", "created_at", "updated_at", "humanized_created_at",
              "agent_status", "status"):
        cfg.pop(k, None)
        payload.pop(k, None)
    # the API validates these as dicts but its own GET can return null or even
    # the string "null" — drop anything that isn't a dict
    for k in ("webhook_config", "webhook_headers"):
        if k in cfg and not isinstance(cfg[k], dict):
            cfg.pop(k)
    return payload


def load_prompt():
    with open(os.path.join(HERE, "system_prompt.txt")) as f:
        return f.read().strip()


def normalize_fetched(fetched):
    """GET responses may or may not wrap in agent_config — normalize to full payload."""
    if "agent_config" in fetched:
        return fetched
    prompts = fetched.pop("agent_prompts", {})
    return {"agent_config": fetched, "agent_prompts": prompts}


def save_snapshot(obj, name="agent_snapshot.json"):
    path = os.path.join(HERE, name)
    with open(path, "w") as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)
    print("saved " + path)


# ----------------------------------------------------------------- commands

def cmd_get(agent_id):
    agent = request("GET", "/agent/" + agent_id)
    save_snapshot(agent)
    print(json.dumps(agent, indent=2, ensure_ascii=False)[:4000])


def cmd_from_existing(agent_id):
    prompt, functions = load_prompt(), saheli_functions(server_url())
    fetched = request("GET", "/agent/" + agent_id)
    save_snapshot(fetched)
    payload = strip_readonly(patch_agent(normalize_fetched(fetched), prompt, functions))
    save_snapshot(payload, "agent_payload_sent.json")
    created = request("POST", "/agent", payload)
    print(json.dumps(created, indent=2)[:2000])
    print("\nSaheli agent created. Save its agent_id — use --update for prompt iteration.")


def cmd_update(agent_id):
    prompt, functions = load_prompt(), saheli_functions(server_url())
    fetched = request("GET", "/agent/" + agent_id)
    payload = strip_readonly(patch_agent(normalize_fetched(fetched), prompt, functions))
    save_snapshot(payload, "agent_payload_sent.json")
    updated = request("PUT", "/agent/" + agent_id, payload)
    print(json.dumps(updated, indent=2)[:2000])
    print("\nAgent %s updated with current system_prompt.txt + functions." % agent_id)


def cmd_create_from_template():
    prompt, functions = load_prompt(), saheli_functions(server_url())
    with open(os.path.join(HERE, "agent_template.json")) as f:
        template = json.load(f)
    template.pop("_README", None)
    if "REPLACE_ME" in json.dumps(template):
        sys.exit("agent_template.json still has REPLACE_ME placeholders — fill in the "
                 "Cartesia synthesizer block first (see --get), or use --from-existing.")
    payload = patch_agent(template, prompt, functions)
    save_snapshot(payload, "agent_payload_sent.json")
    created = request("POST", "/agent", payload)
    print(json.dumps(created, indent=2)[:2000])


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--get", metavar="AGENT_ID")
    g.add_argument("--from-existing", metavar="AGENT_ID")
    g.add_argument("--update", metavar="AGENT_ID")
    g.add_argument("--create-from-template", action="store_true")
    args = p.parse_args()

    if args.get:
        cmd_get(args.get)
    elif args.from_existing:
        cmd_from_existing(args.from_existing)
    elif args.update:
        cmd_update(args.update)
    else:
        cmd_create_from_template()


if __name__ == "__main__":
    main()
