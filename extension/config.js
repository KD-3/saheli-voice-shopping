// Saheli extension config — the 60-second-fix surface.
// If Amazon's DOM shifts on demo morning, fix selectors HERE only.
// After changing SERVER_URL (new ngrok URL), reload the extension at chrome://extensions.

const SAHELI_CONFIG = {
  SERVER_URL: "https://saporous-nonimitative-rozanne.ngrok-free.dev", // ← current ngrok URL; update if the tunnel restarts
  SESSION_ID: "demo1",
  ACTION_POLL_MS: 2000,
  ACTION_TIMEOUT_MS: 10000,

  // Each field takes a list of candidate selectors, tried in order.
  // (Verified against live amazon.in HTML on June 11 — empty-text matches are skipped.)
  SELECTORS: {
    title: ["#productTitle"],
    // priceToPay only — looser matches hit the strikethrough MRP. If empty
    // (pre-hydration), price is built from price_whole, then last_resort.
    price: [
      "#corePriceDisplay_desktop_feature_div .priceToPay .a-offscreen",
      ".priceToPay .a-offscreen",
    ],
    price_whole_fallback: ["#corePriceDisplay_desktop_feature_div span.a-price-whole", "span.a-price-whole"],
    price_last_resort: ["#corePriceDisplay_desktop_feature_div .a-price .a-offscreen", ".a-price .a-offscreen"],
    // strikethrough MRP — fuels the fake-discount callout
    mrp: [
      "#corePriceDisplay_desktop_feature_div .basisPrice .a-price .a-offscreen",
      ".basisPrice .a-price .a-offscreen",
      "span.a-price.a-text-price .a-offscreen",
    ],
    rating: ["span[data-hook='rating-out-of-text']", "#acrPopover"],
    review_count: ["#acrCustomerReviewText"],
    review_snippets: [
      "[data-hook='reviewText']",
      "div[data-hook='review-collapsed'] span",
      "span[data-hook='review-body']",
      "div.review-text-content span",
    ],
    critical_review: [
      "#cr-medley-top-critical-review span[data-hook='review-body']",
      "div[data-hook='cr-medley-top-critical-review'] span[data-hook='review-body']",
      ".critical-review span[data-hook='review-body']",
      "div[data-hook='cm-cr-dp-most-helpful-critical'] span",
    ],
    seller: ["#sellerProfileTriggerId", "#merchant-info"],
    add_to_cart_button: ["#add-to-cart-button", "input[name='submit.add-to-cart']"],
    // a-keyvalue last: it also matches the returns-policy table
    specs_table_rows: ["#productOverview_feature_div table tr", "#poExpander table tr"],
    specs_bullets: ["#detailBullets_feature_div li"],
    specs_table_last_resort: ["#productDetails_techSpec_section_1 tr", "table.a-keyvalue tr"],

    // cart page (/gp/cart, /cart)
    cart_item: ["#sc-active-cart div[data-asin]", "div.sc-list-item[data-asin]", "#activeCartViewForm div[data-asin]"],
    cart_item_title: [".sc-product-title", "span.a-truncate-full", ".sc-grid-item-product-title"],
    cart_item_price: [".sc-product-price", ".sc-badge-price-to-pay .a-price .a-offscreen", ".a-price .a-offscreen"],
    cart_subtotal: ["#sc-subtotal-amount-activecart .a-price .a-offscreen", "#sc-subtotal-amount-activecart", "#sc-subtotal-amount-buybox"],

    // search results page (/s?k=...)
    search_card: ["div[data-component-type='s-search-result']"],
    search_sponsored_marker: [".puis-sponsored-label-text", "[data-component-type='sp-sponsored-result']"],
    // a-size-base-plus is the product title; a-size-mini h2 is the brand line
    search_title: ["h2.a-size-base-plus span", "h2[aria-label] span", "h2 span"],
    search_link: ["a:has(h2.a-size-base-plus)", "a:has(h2)", "h2 a", "a.a-link-normal"],
    search_price: [".a-price .a-offscreen", "span.a-price-whole"],
    search_rating: ["span.a-icon-alt"],
    search_review_count: ["span.s-underline-text", "a[aria-label$=' ratings']"],
  },

  MAX_REVIEW_SNIPPETS: 5,
  SNIPPET_MAX_CHARS: 200,
  MAX_SPECS: 6,
  MAX_SEARCH_RESULTS: 8,

  // deep reviews: mined from the product page's own review blocks (the
  // dedicated reviews page is sign-in-walled against fetch). A watcher
  // re-ships when reviews lazy-load — scrolling the page surfaces more.
  DEEP_REVIEWS: true,
  MAX_DEEP_REVIEWS: 40,
  // 2026 markup: review block hook is 'review'; body moved to 'reviewText';
  // rating/date hooks unchanged but element types vary — keep candidates loose
  DEEP_REVIEW_SELECTORS: {
    review_block: ["div[data-hook='review']", "[data-hook='reviewContainer']", "div[id^='customer_review']"],
    rating: [
      "[data-hook='review-star-rating'] .a-icon-alt",
      "[data-hook='review-star-rating']",
      "i[data-hook='cmps-review-star-rating'] span.a-icon-alt",
      ".review-rating span.a-icon-alt",
    ],
    date: ["[data-hook='review-date']"],
    body: [
      "[data-hook='reviewText']",
      "[data-hook='reviewTextContainer']",
      "span[data-hook='review-body']",
      ".review-text-content",
    ],
  },
};
