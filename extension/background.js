// Saheli background service worker — owns all network I/O to the context
// server (avoids page CORS/CSP entirely) and orchestrates cart actions,
// search navigation, and the overlay event feed.

importScripts("config.js");
const C = SAHELI_CONFIG;
const BASE = C.SERVER_URL.replace(/\/$/, "");
// ngrok free tier serves an HTML warning page to browser-UA requests unless
// this header is present; harmless for any other host.
const GET_HEADERS = { "ngrok-skip-browser-warning": "1" };

async function post(path, body) {
  try {
    const res = await fetch(BASE + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...GET_HEADERS },
      body: JSON.stringify({ session_id: C.SESSION_ID, ...body }),
    });
    return res.ok ? await res.json() : null;
  } catch (e) {
    console.warn("saheli: POST " + path + " failed", e);
    return null;
  }
}

function reportResult(action, ok, error) {
  return post("/action/result", {
    ok,
    type: action.type,
    asin: action.asin,
    error: error || null,
  });
}

async function clickInTab(tabId, action) {
  let resp = null;
  try {
    resp = await chrome.tabs.sendMessage(tabId, { type: "click_add_to_cart" });
  } catch (e) {
    // content script not ready / tab gone
  }
  await reportResult(action, !!(resp && resp.ok), resp && resp.error);
}

async function handleAction(action, tab, currentAsin) {
  if (action.type === "open_search") {
    if (!action.query) return reportResult(action, false, "empty search query");
    // server-built URL carries the real price filter; fall back to bare query
    const url = action.url || "https://www.amazon.in/s?k=" + encodeURIComponent(action.query);
    await chrome.tabs.update(tab.id, { url });
    return reportResult(action, true);
  }

  if (action.type === "open_product") {
    if (!action.url) return reportResult(action, false, "no url for product");
    await chrome.tabs.update(tab.id, { url: action.url });
    return reportResult(action, true);
  }

  if (action.type === "highlight") {
    const asins = (action.asins || "").split(",").map((a) => a.trim()).filter(Boolean);
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "highlight_products", asins });
    } catch (e) {
      // content script not ready
    }
    return reportResult(action, true);
  }

  if (action.type === "add_to_cart") {
    if (action.asin && currentAsin === action.asin) {
      return clickInTab(tab.id, action);
    }
    // wrong page: remember the action, navigate, finish when the new page reports in
    await chrome.storage.session.set({
      pending_action: { ...action, stored_at: Date.now() },
    });
    const url = action.url || `https://www.amazon.in/dp/${action.asin}`;
    await chrome.tabs.update(tab.id, { url });
    return;
  }

  return reportResult(action, false, "unknown action type: " + action.type);
}

// Complete a navigate-then-click add_to_cart once the target page scrapes in.
async function resumePendingAction(payload, tab) {
  const { pending_action } = await chrome.storage.session.get("pending_action");
  if (!pending_action) return;
  if (Date.now() - pending_action.stored_at > C.ACTION_TIMEOUT_MS) {
    await chrome.storage.session.remove("pending_action");
    return reportResult(pending_action, false, "timed out waiting for product page");
  }
  if (payload.asin === pending_action.asin) {
    await chrome.storage.session.remove("pending_action");
    return clickInTab(tab.id, pending_action);
  }
}

// ----------------------------------------------------- overlay event feed

let lastEventId = null; // hydrated from storage; null = unknown (skip backlog)

async function pollEvents(tabId) {
  if (lastEventId === null) {
    const stored = await chrome.storage.session.get("last_event_id");
    if (typeof stored.last_event_id === "number") {
      lastEventId = stored.last_event_id;
    } else {
      // first run: sync to the server's current position, don't replay history
      try {
        const res = await fetch(`${BASE}/events?session_id=${C.SESSION_ID}&after=999999999`, { headers: GET_HEADERS });
        lastEventId = (await res.json()).last_id || 0;
      } catch (e) {
        return;
      }
      await chrome.storage.session.set({ last_event_id: lastEventId });
      return;
    }
  }
  try {
    const res = await fetch(`${BASE}/events?session_id=${C.SESSION_ID}&after=${lastEventId}`, { headers: GET_HEADERS });
    const data = await res.json();
    if (data.events && data.events.length) {
      // deliver FIRST, advance the cursor only on success — the cart click
      // navigates the page, and events delivered mid-navigation vanish
      await chrome.tabs.sendMessage(tabId, { type: "saheli_events", events: data.events });
      lastEventId = data.last_id;
      await chrome.storage.session.set({ last_event_id: lastEventId });
    }
  } catch (e) {
    // tab navigating or server unreachable; next poll redelivers
  }
}

// persistent panel state (brief / finalists / cart) for the HUD
async function pollState(tabId) {
  try {
    const res = await fetch(`${BASE}/context?session_id=${C.SESSION_ID}&silent=1`, { headers: GET_HEADERS });
    if (!res.ok) return;
    const d = await res.json();
    chrome.tabs.sendMessage(tabId, {
      type: "saheli_state",
      state: {
        mission: d.shopping_mission || null,
        shortlist: d.shortlist || [],
        cart: d.cart || null,
      },
    }).catch(() => {});
  } catch (e) {
    // tab navigating or server unreachable; next poll retries
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "call_me") {
    post("/call", {}).then((resp) => sendResponse(resp || { ok: false, error: "server unreachable" }));
    return true; // async sendResponse
  }
  if (msg.type === "reset_session") {
    post("/reset", {});
    return;
  }
  if (msg.type === "page_context") {
    post("/context", msg.payload).then(() => resumePendingAction(msg.payload, sender.tab));
  } else if (msg.type === "poll_action") {
    pollEvents(sender.tab.id);
    pollState(sender.tab.id);
    fetch(`${BASE}/action?session_id=${C.SESSION_ID}`, { headers: GET_HEADERS })
      .then(async (res) => {
        if (res.status !== 200) return; // 204 = nothing pending
        const action = await res.json();
        console.log("saheli: action received", action);
        await handleAction(action, sender.tab, msg.current_asin);
      })
      .catch(() => {});
  }
});
