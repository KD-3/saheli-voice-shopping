// Saheli content script — runs on amazon.in pages.
// Scrapes product AND search-results pages, drives the 2s action poll (keeps
// the service worker awake via messaging), executes add-to-cart clicks, and
// renders the on-screen presence overlay ("Saheli is looking…").

(() => {
  const C = SAHELI_CONFIG;

  const asinFromUrl = (url) => {
    const m = url.match(/(?:\/dp\/|\/gp\/product\/|\/product\/)([A-Z0-9]{10})(?:[/?]|$)/);
    return m ? m[1] : null;
  };

  const isSearchPage = () =>
    location.pathname === "/s" || location.pathname.startsWith("/s/");

  const isCartPage = () =>
    location.pathname.startsWith("/gp/cart") || location.pathname.startsWith("/cart");

  const pickEl = (selectors, root = document) => {
    for (const sel of selectors) {
      const el = root.querySelector(sel);
      if (el) return el;
    }
    return null;
  };

  // first candidate whose match has non-empty text — server HTML often ships
  // empty .a-offscreen nodes that only hydrate later
  const pickText = (selectors, root = document) => {
    for (const sel of selectors) {
      for (const el of root.querySelectorAll(sel)) {
        const t = el.textContent.trim();
        if (t) return t;
      }
    }
    return null;
  };

  const scrapePrice = () => {
    const price = pickText(C.SELECTORS.price);
    if (price) return price;
    // construct from the whole-number node ("437" -> "₹437")
    const whole = pickText(C.SELECTORS.price_whole_fallback);
    if (whole) return "₹" + whole.replace(/[.\s]+$/, "");
    return pickText(C.SELECTORS.price_last_resort); // may be MRP — last resort only
  };

  const scrapeSpecs = () => {
    const specs = {};
    const addPair = (k, v) => {
      k = k.replace(/[‎‏:]+/g, " ").trim();
      v = v.replace(/[‎‏]+/g, " ").trim();
      if (/return|warranty|days from delivery/i.test(k)) return; // policy-table junk
      if (k && v && Object.keys(specs).length < C.MAX_SPECS) specs[k] = v;
    };
    const fromRows = (selectors) => {
      for (const sel of selectors) {
        for (const row of document.querySelectorAll(sel)) {
          const cells = row.querySelectorAll("td, th");
          if (cells.length >= 2) addPair(cells[0].textContent, cells[1].textContent);
        }
        if (Object.keys(specs).length) return true;
      }
      return false;
    };
    if (fromRows(C.SELECTORS.specs_table_rows)) return specs;
    for (const li of document.querySelectorAll(C.SELECTORS.specs_bullets[0])) {
      const parts = li.textContent.split(":");
      if (parts.length >= 2) addPair(parts[0], parts.slice(1).join(":"));
    }
    if (!Object.keys(specs).length) fromRows(C.SELECTORS.specs_table_last_resort);
    return specs;
  };

  // ------------------------------------------------------------ scraping

  function scrapeProduct() {
    const asin = asinFromUrl(location.href);
    const title = pickText(C.SELECTORS.title);
    if (!asin || !title) return null; // not a (loaded) product page

    let rating = null;
    const ratingEl = pickEl(C.SELECTORS.rating);
    if (ratingEl) rating = ratingEl.getAttribute("title") || ratingEl.textContent.trim();

    const junkSnippet = (t) => /double tap to read|brief content visible/i.test(t);
    const snippets = [];
    for (const sel of C.SELECTORS.review_snippets) {
      document.querySelectorAll(sel).forEach((el) => {
        const t = el.textContent.trim().replace(/\s+/g, " ");
        if (t && !junkSnippet(t) && snippets.length < C.MAX_REVIEW_SNIPPETS) {
          snippets.push(t.slice(0, C.SNIPPET_MAX_CHARS));
        }
      });
      if (snippets.length) break;
    }

    const critical = pickText(C.SELECTORS.critical_review);

    return {
      session_id: C.SESSION_ID,
      page_type: "product",
      url: location.href.split("?")[0],
      asin,
      title,
      price: scrapePrice(),
      mrp: pickText(C.SELECTORS.mrp),
      rating,
      review_count: pickText(C.SELECTORS.review_count),
      review_snippets: snippets,
      critical_review: critical ? critical.replace(/\s+/g, " ").slice(0, 250) : null,
      seller: pickText(C.SELECTORS.seller),
      key_specs: scrapeSpecs(),
      scraped_at: Date.now() / 1000,
    };
  }

  function scrapeSearch() {
    const cards = document.querySelectorAll(C.SELECTORS.search_card[0]);
    if (!cards.length) return null;
    const results = [];
    for (const card of cards) {
      if (results.length >= C.MAX_SEARCH_RESULTS) break;
      const asin = card.getAttribute("data-asin");
      if (!asin || asin.length !== 10) continue;
      if (pickEl(C.SELECTORS.search_sponsored_marker, card)) continue; // organic only
      const titleEl = pickEl(C.SELECTORS.search_title, card);
      const name = titleEl ? titleEl.textContent.trim() : null;
      if (!name) continue;
      // the title h2 is wrapped BY the anchor, so climb from the title first
      const linkEl = (titleEl && titleEl.closest("a")) || pickEl(C.SELECTORS.search_link, card);
      results.push({
        position: results.length + 1,
        name,
        price: pickText(C.SELECTORS.search_price, card),
        rating: pickText(C.SELECTORS.search_rating, card),
        review_count: pickText(C.SELECTORS.search_review_count, card),
        asin,
        url: linkEl ? linkEl.href.split("?")[0] : `https://www.amazon.in/dp/${asin}`,
      });
    }
    if (!results.length) return null;

    const query =
      new URLSearchParams(location.search).get("k") ||
      (document.querySelector("#twotabsearchtextbox") || {}).value ||
      "";
    return {
      session_id: C.SESSION_ID,
      page_type: "search_results",
      query,
      url: location.href,
      results,
      scraped_at: Date.now() / 1000,
    };
  }

  // --- deep reviews: mine the structured review blocks on the product page
  // itself. (The dedicated /product-reviews page is sign-in-walled against
  // fetch, even with cookies.) Amazon lazy-loads the reviews section, so a
  // watcher re-ships the page whenever more reviews hydrate (e.g. on scroll).

  const DR = C.DEEP_REVIEW_SELECTORS;

  function scrapeOnPageReviews() {
    let blocks = [];
    for (const sel of DR.review_block) {
      blocks = document.querySelectorAll(sel);
      if (blocks.length) break;
    }
    const reviews = [];
    const seen = new Set();
    for (const block of blocks) {
      if (reviews.length >= C.MAX_DEEP_REVIEWS) break;
      const text = (pickText(DR.body, block) || "").replace(/\s+/g, " ").slice(0, 400);
      if (!text || seen.has(text) || /double tap to read|brief content visible/i.test(text)) continue;
      seen.add(text);
      reviews.push({
        rating: pickText(DR.rating, block),
        date: pickText(DR.date, block),
        text,
      });
    }
    return reviews;
  }

  function scrapeCart() {
    const items = [];
    for (const card of document.querySelectorAll(C.SELECTORS.cart_item[0] + ", " + C.SELECTORS.cart_item.slice(1).join(", "))) {
      if (items.length >= 10) break;
      const name = pickText(C.SELECTORS.cart_item_title, card);
      if (!name) continue;
      items.push({
        name: name.slice(0, 70),
        price: pickText(C.SELECTORS.cart_item_price, card),
        asin: card.getAttribute("data-asin"),
      });
    }
    if (!items.length) return null;
    return {
      session_id: C.SESSION_ID,
      page_type: "cart",
      items,
      subtotal: pickText(C.SELECTORS.cart_subtotal),
      url: location.href.split("?")[0],
      scraped_at: Date.now() / 1000,
    };
  }

  let retries = 0;
  let enriched = null;
  let lastSearchScrolled = null;

  function scrapeAndSend() {
    const page = isCartPage() ? scrapeCart() : isSearchPage() ? scrapeSearch() : scrapeProduct();
    if (!page) {
      // pages can hydrate late; retry a few times
      if ((isSearchPage() || isCartPage() || asinFromUrl(location.href)) && retries < 3) {
        retries++;
        setTimeout(scrapeAndSend, 1200);
      }
      return;
    }
    retries = 0;
    if (page.page_type === "product" && C.DEEP_REVIEWS) {
      const deep = scrapeOnPageReviews();
      if (deep.length) page.deep_reviews = deep;
      console.log("saheli: on-page reviews mined", page.asin, deep.length);
    }
    chrome.runtime.sendMessage({ type: "page_context", payload: page });

    // on a fresh search, scroll PAST the sponsored ads (which ignore the price
    // filter and sit on top) to the first real result, so the user sees the
    // actual in-range options Saheli is talking about — not ads
    if (page.page_type === "search_results" && page.query && page.query !== lastSearchScrolled) {
      lastSearchScrolled = page.query;
      setTimeout(scrollToFirstOrganic, 600);
    }

    if (page.page_type === "product" && enriched !== page.asin) {
      enriched = page.asin;
      // reviews lazy-load (often only on scroll) — watch for them hydrating
      // and re-ship the page each time more arrive
      let lastCount = (page.deep_reviews || []).length;
      let ticks = 0;
      const watcher = setInterval(() => {
        ticks++;
        const gone = asinFromUrl(location.href) !== page.asin;
        if (gone || ticks > 40) return clearInterval(watcher);
        const count = scrapeOnPageReviews().length;
        if (count > lastCount) {
          lastCount = count;
          const fresh = scrapeProduct();
          if (fresh) {
            const deep = scrapeOnPageReviews();
            if (deep.length) fresh.deep_reviews = deep;
            console.log("saheli: reviews hydrated, re-shipping", page.asin, deep.length);
            chrome.runtime.sendMessage({ type: "page_context", payload: fresh });
          }
        }
      }, 1500);
    }
  }

  // --- triggers: initial load + defensive URL-change watch (SPA/pushState) ---
  scrapeAndSend();
  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      retries = 0;
      setTimeout(scrapeAndSend, 1000); // give the new page a beat to render
    }
  }, 1000);

  // --- action poll: content script drives it so the MV3 worker stays awake ---
  setInterval(() => {
    if (document.visibilityState !== "visible") return;
    chrome.runtime.sendMessage({
      type: "poll_action",
      current_asin: asinFromUrl(location.href),
    });
  }, C.ACTION_POLL_MS);

  // ------------------------------------------------------ Saheli companion HUD
  // A persistent panel docked right — Saheli's "body" on screen. Renders her
  // status, the brief, the finalists, and her homework from data we already
  // push via /events (saheli_events) and /context (saheli_state).

  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const HUD = {
    host: null, shadow: null, el: {},
    feed: [], shortlist: [], mission: null, cart: null,
    cartedName: null, callStart: 0, lastActivity: 0, collapsed: false,
  };
  const CALL_IDLE_MS = 120000; // no activity this long → assume call ended

  function buildPanel() {
    if (HUD.host && document.contains(HUD.host)) return;
    const host = document.createElement("div");
    host.id = "saheli-hud-host";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        * { box-sizing: border-box; }
        .panel { position: fixed; top: 0; right: 0; width: 320px; height: 100vh;
                 z-index: 2147483647; background: #16162a; color: #fff;
                 font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
                 display: flex; flex-direction: column;
                 box-shadow: -8px 0 40px rgba(0,0,0,.35);
                 transition: transform .32s cubic-bezier(.4,0,.2,1); }
        .panel.collapsed { transform: translateX(100%); }
        .reopen { position: fixed; bottom: 20px; right: 20px; z-index: 2147483647;
                  display: none; align-items: center; gap: 9px; cursor: pointer;
                  background: #16162a; color: #fff; border: none; border-radius: 999px;
                  padding: 8px 16px 8px 8px; box-shadow: 0 6px 24px rgba(0,0,0,.4);
                  font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
                  font-size: 14px; font-weight: 600; }
        .reopen.show { display: flex; }
        .orb { position: relative; width: 38px; height: 38px; flex: none; }
        .orb .face { position: absolute; inset: 0; border-radius: 50%; background: #e94560;
                     display: flex; align-items: center; justify-content: center;
                     font-size: 17px; font-weight: 600; color: #fff; }
        .orb .ring { position: absolute; inset: -4px; border-radius: 50%;
                     border: 2px solid #e9456066; animation: hud-pulse 2s ease-out infinite; }
        .head { padding: 15px 16px 13px; border-bottom: 1px solid rgba(255,255,255,.08);
                display: flex; align-items: center; gap: 11px; }
        .head .name { font-size: 16px; font-weight: 600; line-height: 1.1; }
        .head .status { font-size: 12px; color: #9d9cb8; margin-top: 3px;
                        display: flex; align-items: center; gap: 6px; }
        .sdot { width: 7px; height: 7px; border-radius: 50%; background: #9d9cb8; flex: none; }
        .sdot.live { background: #2ecc71; animation: hud-dot 1.6s infinite; }
        .sdot.look { background: #e94560; animation: hud-dot 1.6s infinite; }
        .x { margin-left: auto; background: none; border: none; color: #9d9cb8;
             cursor: pointer; font-size: 20px; line-height: 1; padding: 2px 6px; }
        .x:hover { color: #fff; }
        .body { flex: 1; overflow-y: auto; padding: 13px 15px; display: flex;
                flex-direction: column; gap: 13px; }
        .body::-webkit-scrollbar { width: 6px; }
        .body::-webkit-scrollbar-thumb { background: rgba(255,255,255,.12); border-radius: 3px; }
        .cap { font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase;
               color: #7f7e9c; margin-bottom: 7px; }
        .brief { background: rgba(255,255,255,.05); border-radius: 12px; padding: 11px 13px; }
        .brief .m { font-size: 14px; font-weight: 500; line-height: 1.35; }
        .pills { margin-top: 8px; display: flex; gap: 6px; flex-wrap: wrap; }
        .pill { font-size: 11px; border-radius: 20px; padding: 3px 10px;
                background: rgba(255,255,255,.08); color: #c9c8dd; }
        .pill.budget { background: #e9456022; color: #ff8ba3; }
        .fin { background: rgba(255,255,255,.05); border-radius: 10px; padding: 8px 11px;
               display: flex; align-items: center; gap: 9px; margin-bottom: 7px; }
        .fin.win { background: #e9456014; border: 1px solid #e9456055; }
        .fin .t { flex: 1; min-width: 0; }
        .fin .t .n { font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .fin .t .s { font-size: 11px; color: #9d9cb8; margin-top: 2px; }
        .fin.win .t .s { color: #ffb3c2; }
        .incart { font-size: 10px; font-weight: 600; background: #2ecc71; color: #04341f;
                  border-radius: 20px; padding: 3px 8px; white-space: nowrap; flex: none; }
        .receipt { background: #fffdf7; color: #1a1a2e; border-radius: 12px;
                   border-top: 4px solid #e94560; padding: 12px 14px; display: none; }
        .receipt.show { display: block; }
        .receipt h4 { margin: 0 0 9px; font-size: 13px; font-weight: 600; }
        .receipt .r { display: flex; justify-content: space-between; gap: 10px;
                      font-size: 12.5px; margin: 4px 0; }
        .receipt .r .k { color: #8a8a94; flex: none; }
        .receipt .r .v { text-align: right; font-weight: 500; }
        .receipt .r .v.flag { color: #c0392b; }
        .receipt .r .v.warn { color: #b9770e; }
        .receipt .r .v.good { color: #1e9e5a; }
        .feed { font-size: 12px; color: #b6b5cc; display: flex; flex-direction: column; gap: 5px; }
        .feed .old { color: #7f7e9c; }
        .foot { padding: 11px 15px; border-top: 1px solid rgba(255,255,255,.08); }
        .callbtn { width: 100%; background: #e94560; color: #fff; border: none; cursor: pointer;
                   border-radius: 999px; padding: 11px; font-size: 14.5px; font-weight: 600;
                   font-family: inherit; }
        .callbtn:hover { filter: brightness(1.08); }
        .callbtn:disabled { opacity: .6; cursor: default; }
        .oncall { display: flex; align-items: center; gap: 9px; }
        .oncall .lbl { font-size: 13px; color: #c9c8dd; flex: 1; }
        .oncall .tmr { font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; }
        @keyframes hud-pulse { 0%{transform:scale(1);opacity:.8} 70%{transform:scale(1.4);opacity:0} 100%{opacity:0} }
        @keyframes hud-dot { 0%{box-shadow:0 0 0 0 #2ecc7166} 70%{box-shadow:0 0 0 7px #2ecc7100} 100%{box-shadow:0 0 0 0 #2ecc7100} }
        @keyframes hud-fadein { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:none} }
        .fadein { animation: hud-fadein .25s ease-out; }
      </style>
      <div class="panel">
        <div class="head">
          <div class="orb"><div class="ring"></div><div class="face">S</div></div>
          <div>
            <div class="name">Saheli</div>
            <div class="status"><span class="sdot" id="sdot"></span><span id="stext">Ready when you are</span></div>
          </div>
          <button class="x" id="clear" title="New session" style="font-size:16px">⟲</button>
          <button class="x" id="collapse" title="Hide">›</button>
        </div>
        <div class="body">
          <div id="briefWrap" style="display:none">
            <div class="cap">🎯 Your brief</div>
            <div class="brief"><div class="m" id="briefM"></div><div class="pills" id="briefP"></div></div>
          </div>
          <div id="finWrap" style="display:none">
            <div class="cap">📌 Your finalists</div>
            <div id="finList"></div>
          </div>
          <div class="receipt" id="receipt"></div>
          <div>
            <div class="cap">Activity</div>
            <div class="feed" id="feed"></div>
          </div>
        </div>
        <div class="foot" id="foot">
          <button class="callbtn" id="callbtn">📞 Call Saheli</button>
        </div>
      </div>
      <button class="reopen" id="reopen"><span class="orb" style="width:30px;height:30px"><span class="face" style="font-size:14px">S</span></span>Saheli</button>`;
    document.documentElement.appendChild(host);
    HUD.host = host; HUD.shadow = shadow;
    const $ = (id) => shadow.getElementById(id);
    HUD.el = {
      panel: shadow.querySelector(".panel"), reopen: $("reopen"),
      sdot: $("sdot"), stext: $("stext"),
      briefWrap: $("briefWrap"), briefM: $("briefM"), briefP: $("briefP"),
      finWrap: $("finWrap"), finList: $("finList"),
      receipt: $("receipt"), feed: $("feed"), foot: $("foot"), callbtn: $("callbtn"),
    };
    $("collapse").addEventListener("click", () => setCollapsed(true));
    $("clear").addEventListener("click", clearSession);
    HUD.el.reopen.addEventListener("click", () => setCollapsed(false));
    wireCallButton();
    setInterval(tickTimer, 1000);
  }

  // wipe the panel + server session — for rehearsals / starting a new shopper
  function clearSession() {
    HUD.mission = null; HUD.shortlist = []; HUD.cart = null;
    HUD.cartedName = null; HUD.feed = [];
    renderBrief(); renderFinalists();
    if (HUD.el.feed) HUD.el.feed.innerHTML = "";
    if (HUD.el.receipt) HUD.el.receipt.classList.remove("show");
    setStatus("Ready when you are", "");
    chrome.runtime.sendMessage({ type: "reset_session" });
  }

  function setCollapsed(c) {
    HUD.collapsed = c;
    HUD.el.panel.classList.toggle("collapsed", c);
    HUD.el.reopen.classList.toggle("show", c);
  }

  function wireCallButton() {
    HUD.el.callbtn.addEventListener("click", () => {
      HUD.el.callbtn.disabled = true;
      HUD.el.callbtn.textContent = "📞 Calling…";
      chrome.runtime.sendMessage({ type: "call_me" }, (resp) => {
        if (resp && resp.ok) {
          markCallActive();
        } else {
          HUD.el.callbtn.disabled = false;
          HUD.el.callbtn.textContent = "📞 Call Saheli";
          setStatus("couldn't start the call", "");
        }
      });
    });
  }

  // call is live (started by the button OR dialled externally — any real
  // activity event proves it). Flip the footer to the on-call timer.
  function markCallActive() {
    HUD.lastActivity = Date.now();
    if (!HUD.callStart) {
      HUD.callStart = Date.now();
      renderFooter();
    }
  }

  function renderCallButton() {
    HUD.el.foot.innerHTML = `<button class="callbtn" id="callbtn">📞 Call Saheli</button>`;
    HUD.el.callbtn = HUD.shadow.getElementById("callbtn");
    wireCallButton();
  }

  function fmtTimer(ms) {
    const s = Math.floor(ms / 1000);
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }

  function renderFooter() {
    if (!HUD.callStart) return;
    HUD.el.foot.innerHTML =
      `<div class="oncall"><span class="sdot live"></span><span class="lbl">On the call</span><span class="tmr" id="tmr">0:00</span></div>`;
  }

  function tickTimer() {
    if (!HUD.callStart || !HUD.shadow) return;
    if (HUD.lastActivity && Date.now() - HUD.lastActivity > CALL_IDLE_MS) {
      HUD.callStart = 0; // call went quiet — assume it ended, allow re-dial
      setStatus("Ready when you are", "");
      renderCallButton();
      return;
    }
    const t = HUD.shadow.getElementById("tmr");
    if (t) t.textContent = fmtTimer(Date.now() - HUD.callStart);
  }

  buildPanel();

  function setStatus(text, kind) {
    if (!HUD.el.stext) return;
    HUD.el.stext.textContent = text;
    HUD.el.sdot.className = "sdot" + (kind ? " " + kind : "");
  }

  function renderBrief() {
    const m = HUD.mission;
    if (!m || !m.mission) { HUD.el.briefWrap.style.display = "none"; return; }
    HUD.el.briefWrap.style.display = "";
    HUD.el.briefM.textContent = m.mission;
    const pills = [];
    if (m.budget) pills.push(`<span class="pill budget">${esc(m.budget)}</span>`);
    if (m.occasion) pills.push(`<span class="pill">${esc(m.occasion)}</span>`);
    if (m.for_whom) pills.push(`<span class="pill">${esc(m.for_whom)}</span>`);
    if (m.size) pills.push(`<span class="pill">size ${esc(m.size)}</span>`);
    HUD.el.briefP.innerHTML = pills.join("");
  }

  function renderFinalists() {
    const list = HUD.shortlist || [];
    if (!list.length) { HUD.el.finWrap.style.display = "none"; return; }
    HUD.el.finWrap.style.display = "";
    HUD.el.finList.innerHTML = list.map((p) => {
      const carted = HUD.cartedName && (p.name || "").slice(0, 18) === HUD.cartedName.slice(0, 18);
      const sub = [p.price, p.rating, p.review_count].filter(Boolean).join(" · ");
      return `<div class="fin${carted ? " win" : ""}"><div class="t"><div class="n">${esc(p.name)}</div>` +
             `<div class="s">${esc(sub)}</div></div>${carted ? '<span class="incart">✓ in cart</span>' : ""}</div>`;
    }).join("");
  }

  function pushFeed(text) {
    if (!text) return;
    HUD.feed.unshift(text);
    HUD.feed = HUD.feed.slice(0, 5);
    HUD.el.feed.innerHTML = HUD.feed
      .map((t, i) => `<div class="${i > 0 ? "old" : ""}">${esc(t)}</div>`)
      .join("");
  }

  // Saheli's homework, persistent in the panel — shown when she carts something
  function showReceipt(r) {
    HUD.cartedName = r.name || HUD.cartedName;
    const row = (k, v, cls) =>
      v ? `<div class="r"><span class="k">${esc(k)}</span><span class="v ${cls || ""}">${esc(v)}</span></div>` : "";
    const budgetCls = r.budget_note && r.budget_note.startsWith("✓") ? "good" : "flag";
    HUD.el.receipt.innerHTML =
      `<h4>🧾 Saheli did the homework</h4>` +
      row("item", r.name) +
      row("price", [r.price, r.unit_price].filter(Boolean).join(" · ")) +
      row("rating", [r.rating, r.review_count].filter(Boolean).join(" · ")) +
      row("reviews read", r.reviews_analyzed ? r.reviews_analyzed + " analyzed" : null) +
      (r.complaints || []).map((c) => row("complaint", c, "flag")).join("") +
      (r.red_flags || []).map((f) => row("red flag", f, "flag")).join("") +
      row("sizing", r.size_advice, "warn") +
      row("budget", r.budget_note, budgetCls);
    HUD.el.receipt.classList.add("show", "fadein");
    renderFinalists();
  }

  function applyState(s) {
    if (!s) return;
    HUD.mission = s.mission;
    HUD.shortlist = s.shortlist || [];
    HUD.cart = s.cart;
    renderBrief();
    renderFinalists();
  }

  // spotlight a search-result card while Saheli talks about it — built to be
  // unmistakable from the back of a room (outline + glow + tint)
  function flashCard(el) {
    const s = el.style;
    const prev = {
      o: s.outline, off: s.outlineOffset, r: s.borderRadius,
      t: s.transition, bg: s.backgroundColor, bs: s.boxShadow,
    };
    s.transition = "box-shadow .3s ease, background-color .3s ease";
    s.outline = "3px solid #e94560";
    s.outlineOffset = "2px";
    s.borderRadius = "10px";
    s.backgroundColor = "rgba(233,69,96,.06)";
    s.boxShadow = "0 0 0 5px rgba(233,69,96,.22)";
    setTimeout(() => {
      s.outline = prev.o; s.outlineOffset = prev.off; s.borderRadius = prev.r;
      s.transition = prev.t; s.backgroundColor = prev.bg; s.boxShadow = prev.bs;
    }, 7000);
  }

  function highlightProducts(asins) {
    let first = true;
    for (const a of asins || []) {
      const card =
        document.querySelector(`div[data-component-type='s-search-result'][data-asin="${a}"]`) ||
        document.querySelector(`[data-asin="${a}"]`);
      if (!card) continue;
      if (first) {
        card.scrollIntoView({ block: "center", behavior: "smooth" });
        first = false;
      }
      flashCard(card);
    }
  }

  // scroll the first NON-sponsored result to just below Amazon's sticky header,
  // pushing the price-filter-ignoring ads above the viewport
  function scrollToFirstOrganic() {
    const cards = document.querySelectorAll("div[data-component-type='s-search-result'][data-asin]");
    let target = null;
    for (const c of cards) {
      const sponsored = c.querySelector(C.SELECTORS.search_sponsored_marker.join(", "));
      if (!sponsored && c.getAttribute("data-asin")) {
        target = c;
        break;
      }
    }
    target = target || cards[0];
    if (target) {
      const y = target.getBoundingClientRect().top + window.scrollY - 120;
      window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
    }
  }

  // -------------------------------------------------------- message handling

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "saheli_state") {
      applyState(msg.state);
      return;
    }

    if (msg.type === "highlight_products") {
      highlightProducts(msg.asins);
      return;
    }

    if (msg.type === "saheli_events") {
      for (const ev of msg.events) {
        markCallActive(); // any real event means she's on a live call
        if (ev.type === "highlight" && ev.data && ev.data.asins) {
          highlightProducts(ev.data.asins);
          setStatus("pointing at options", "live");
          continue;
        }
        if (ev.type === "receipt" && ev.data) showReceipt(ev.data);
        else pushFeed(ev.text);
        // status line + call timer, driven by the event stream
        if (ev.type === "looked") setStatus("looking at this page", "look");
        else if (ev.type === "action_queued") setStatus(ev.text.replace(/^\S+\s*/, "").toLowerCase(), "live");
        else if (ev.type === "action_done") setStatus(ev.text.startsWith("✓") ? "done" : "couldn't do that", "live");
        else if (ev.type === "mission") setStatus("got your brief", "live");
        else if (ev.type === "shortlist") setStatus("shortlisted a finalist", "live");
        else if (ev.type === "receipt") setStatus("added to cart", "live");
        else if (ev.type === "call") {
          if (!HUD.callStart) { HUD.callStart = Date.now(); renderFooter(); }
          setStatus("calling your phone…", "live");
        }
      }
      return;
    }

    if (msg.type !== "click_add_to_cart") return;
    const btn = pickEl(C.SELECTORS.add_to_cart_button);
    if (!btn) {
      sendResponse({ ok: false, error: "add-to-cart button not found" });
      return;
    }
    // Respond NOW — the click often navigates the page, which destroys this
    // script before a delayed sendResponse (was misreported as failure).
    sendResponse({ ok: true, clicked: "scheduled" });
    // get the panel out of the buy box's way for the money shot, then restore
    const wasCollapsed = HUD.collapsed;
    setCollapsed(true);
    btn.scrollIntoView({ block: "center", behavior: "smooth" });
    const prevShadow = btn.style.boxShadow;
    btn.style.transition = "box-shadow .3s";
    btn.style.boxShadow = "0 0 0 6px rgba(233,69,96,.65)";
    setTimeout(() => {
      btn.style.boxShadow = prevShadow;
      btn.click();
      if (!wasCollapsed) setTimeout(() => setCollapsed(false), 1600);
    }, 900);
  });
})();
