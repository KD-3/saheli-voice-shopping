const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const Fa = require("react-icons/fa");

// ---- palette (Saheli's own brand) ----
const NAVY = "16162A", CARD = "23233C", CARD2 = "2C2C49";
const CORAL = "E94560", CORAL_SOFT = "FF8BA3";
const WHITE = "FFFFFF", ICE = "ECECF2", LAV = "9D9CB8", GREEN = "2ECC71";
const HEAD = "Georgia", BODY = "Calibri";
const W = 13.333, H = 7.5;

async function icon(IconComponent, color) {
  const svg = ReactDOMServer.renderToStaticMarkup(
    React.createElement(IconComponent, { color, size: "256" })
  );
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + png.toString("base64");
}

(async () => {
  const I = {};
  const need = {
    clock: [Fa.FaRegClock, CORAL], cart: [Fa.FaShoppingCart, CORAL], undo: [Fa.FaUndoAlt, CORAL],
    cam: [Fa.FaCamera, CORAL_SOFT], wa: [Fa.FaWhatsapp, CORAL_SOFT], phone: [Fa.FaPhoneAlt, CORAL_SOFT],
    hour: [Fa.FaHourglassHalf, CORAL_SOFT], eye: [Fa.FaEye, CORAL], heart: [Fa.FaHeart, CORAL],
    star: [Fa.FaStar, CORAL], hand: [Fa.FaHandPaper, CORAL], tag: [Fa.FaTag, CORAL], mic: [Fa.FaMicrophone, CORAL],
    bolt: [Fa.FaBolt, GREEN], chart: [Fa.FaChartLine, GREEN], undoG: [Fa.FaUndoAlt, GREEN],
    bullhorn: [Fa.FaBullhorn, CORAL_SOFT], lang: [Fa.FaLanguage, CORAL_SOFT],
    store: [Fa.FaStore, CORAL_SOFT], cubes: [Fa.FaCubes, CORAL_SOFT], arrow: [Fa.FaChevronRight, LAV],
  };
  for (const k in need) I[k] = await icon(need[k][0], "#" + need[k][1]);

  const pres = new pptxgen();
  pres.defineLayout({ name: "W", width: W, height: H });
  pres.layout = "W";
  pres.author = "Saheli"; pres.title = "Saheli — pitch";

  const bg = (s) => (s.background = { color: NAVY });
  // small "S" brand orb
  function orb(s, x, y, d, fs) {
    s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: CORAL } });
    s.addText("S", { x, y, w: d, h: d, align: "center", valign: "middle", fontFace: HEAD, bold: true, color: WHITE, fontSize: fs, margin: 0 });
  }
  function title(s, t) {
    orb(s, 0.6, 0.55, 0.5, 20);
    s.addText(t, { x: 1.25, y: 0.5, w: 11.4, h: 0.62, fontFace: HEAD, bold: true, color: WHITE, fontSize: 30, align: "left", valign: "middle", margin: 0 });
  }
  const sh = () => ({ type: "outer", color: "000000", blur: 9, offset: 3, angle: 90, opacity: 0.28 });

  // ---------- S1 Title ----------
  let s = pres.addSlide(); bg(s);
  orb(s, 6.06, 1.15, 1.2, 52);
  s.addText("Saheli", { x: 0, y: 2.5, w: W, h: 1.0, align: "center", fontFace: HEAD, bold: true, color: WHITE, fontSize: 60, margin: 0 });
  s.addText("the friend you call before you buy", { x: 0, y: 3.55, w: W, h: 0.6, align: "center", fontFace: HEAD, italic: true, color: CORAL_SOFT, fontSize: 26, margin: 0 });
  s.addText("A voice AI shopping companion that shops Amazon.in with you.", { x: 0, y: 4.35, w: W, h: 0.5, align: "center", fontFace: BODY, color: LAV, fontSize: 17, margin: 0 });
  s.addText("BOLNA  ×  CARTESIA   ·   VOC-A-THON 2026", { x: 0, y: 6.6, w: W, h: 0.4, align: "center", fontFace: BODY, color: LAV, fontSize: 12, charSpacing: 3, margin: 0 });

  // ---------- S2 Problem ----------
  s = pres.addSlide(); bg(s);
  title(s, "We don't buy alone.");
  s.addText([
    { text: "For anything that matters, the flow isn't browse-and-buy. It's: ", options: { color: ICE } },
    { text: "browse → screenshot → WhatsApp a friend → wait hours → maybe decide.", options: { color: WHITE, bold: true } },
  ], { x: 0.7, y: 1.42, w: 12, h: 1.05, fontFace: BODY, fontSize: 17, margin: 0, lineSpacingMultiple: 1.12 });
  s.addText("That 15 minutes of doubt on the product page is where carts die and bad buys are made — and no one serves it.", { x: 0.7, y: 2.62, w: 12, h: 0.7, fontFace: HEAD, italic: true, color: CORAL_SOFT, fontSize: 17, margin: 0 });
  const probCards = [
    ["clock", "15 minutes of doubt", "where the decision stalls and the buyer opens WhatsApp"],
    ["cart", "75% Carts abandoned", "to decision paralysis and unresolved doubt, not price"],
    ["undo", "Returns that hurt", "Apparel return rates hit 20-30%, destroying platform margins"],
  ];
  probCards.forEach((c, i) => {
    const x = 0.7 + i * 4.05;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 3.7, w: 3.75, h: 2.65, fill: { color: CARD }, rectRadius: 0.12, shadow: sh() });
    s.addImage({ data: I[c[0]], x: x + 0.35, y: 4.05, w: 0.62, h: 0.62 });
    s.addText(c[1], { x: x + 0.35, y: 4.85, w: 3.1, h: 0.5, fontFace: HEAD, bold: true, color: WHITE, fontSize: 19, margin: 0 });
    s.addText(c[2], { x: x + 0.35, y: 5.4, w: 3.1, h: 0.7, fontFace: BODY, color: LAV, fontSize: 14, margin: 0 });
  });

  // ---------- S3 Manual workflow ----------
  s = pres.addSlide(); bg(s);
  title(s, "Today, the fix is a person.");
  s.addText("The friend who knows electronics. The cousin who tells silk from polyester. In a store, the uncle who says “not this one.”", { x: 0.7, y: 1.5, w: 12, h: 0.7, fontFace: BODY, color: ICE, fontSize: 18, margin: 0 });
  const steps = [["cam", "Screenshot"], ["wa", "WhatsApp it"], ["phone", "Call who knows"], ["hour", "Wait hours"]];
  const sw = 2.6, gap = 0.55, startX = (W - (steps.length * sw + (steps.length - 1) * gap)) / 2;
  steps.forEach((st, i) => {
    const x = startX + i * (sw + gap);
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 2.9, w: sw, h: 1.85, fill: { color: CARD }, rectRadius: 0.1 });
    s.addImage({ data: I[st[0]], x: x + sw / 2 - 0.33, y: 3.2, w: 0.66, h: 0.66 });
    s.addText(st[1], { x, y: 4.0, w: sw, h: 0.5, align: "center", fontFace: BODY, bold: true, color: WHITE, fontSize: 16, margin: 0 });
    if (i < steps.length - 1) s.addImage({ data: I.arrow, x: x + sw + gap / 2 - 0.16, y: 3.62, w: 0.32, h: 0.32 });
  });
  s.addText("Real — and it's how India shops. But slow, unreliable, and it doesn't scale.", { x: 0.7, y: 5.35, w: 12, h: 0.6, align: "center", fontFace: HEAD, italic: true, color: LAV, fontSize: 17, margin: 0 });

  // ---------- S4 Meet Saheli ----------
  s = pres.addSlide(); bg(s);
  title(s, "Saheli digitizes that friend.");
  s.addText("A warm voice on a phone call while you browse Amazon. She sees the exact product on your screen, reads what you won't, and tells you the truth — on your side, never the seller's.", { x: 0.7, y: 1.9, w: 6.6, h: 3, fontFace: BODY, color: ICE, fontSize: 20, margin: 0, lineSpacingMultiple: 1.25 });
  const meet = [["phone", "On a live call", "she's on the phone while you shop"], ["eye", "Sees your screen", "aware of the exact page you're on"], ["heart", "On your side", "warm, sharp, never the seller's"]];
  meet.forEach((m, i) => {
    const y = 1.95 + i * 1.55;
    s.addShape(pres.shapes.OVAL, { x: 7.8, y, w: 0.95, h: 0.95, fill: { color: CARD2 } });
    s.addImage({ data: I[m[0]], x: 8.07, y: y + 0.27, w: 0.42, h: 0.42 });
    s.addText(m[1], { x: 8.95, y: y + 0.05, w: 4.2, h: 0.45, fontFace: HEAD, bold: true, color: WHITE, fontSize: 19, margin: 0 });
    s.addText(m[2], { x: 8.95, y: y + 0.5, w: 4.2, h: 0.4, fontFace: BODY, color: LAV, fontSize: 14, margin: 0 });
  });

  // ---------- S5 Live demo ----------
  s = pres.addSlide(); bg(s);
  s.addText("LIVE DEMO", { x: 0, y: 1.5, w: W, h: 0.5, align: "center", fontFace: BODY, color: CORAL, fontSize: 16, charSpacing: 6, margin: 0 });
  s.addText("Watch her shop with me.", { x: 0, y: 2.05, w: W, h: 1.0, align: "center", fontFace: HEAD, bold: true, color: WHITE, fontSize: 46, margin: 0 });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 1.9, y: 3.7, w: 9.53, h: 2.3, fill: { color: CARD }, line: { color: CORAL, width: 1.5 }, rectRadius: 0.12 });
  s.addText([
    { text: "“shaadi hai, kurta chahiye”", options: { color: CORAL_SOFT, italic: true } },
    { text: "   she takes a brief  →  searches  →  flags the bad buy  →  compares  →  adds the right one to cart  →  tells me I'm done.", options: { color: ICE } },
  ], { x: 2.35, y: 3.85, w: 8.6, h: 2.0, fontFace: BODY, fontSize: 17, align: "left", valign: "middle", margin: 0, lineSpacingMultiple: 1.3 });
  s.addText("Phone on speaker · Amazon on screen · everything she does shows live", { x: 0, y: 6.25, w: W, h: 0.4, align: "center", fontFace: BODY, color: LAV, fontSize: 13, margin: 0 });

  // ---------- S6 Homework / USPs ----------
  s = pres.addSlide(); bg(s);
  title(s, "A search box can't do this.");
  const rows = [
    ["star", "Reads the reviews you won't", "complaint counts and recency drift — and trust by volume: 4.2 from 8,000 beats 4.6 from 20"],
    ["hand", "Talks you out of bad buys", "the most trust-building move — the exact opposite of what e-commerce optimizes for"],
    ["tag", "Catches the traps", "size truth from real buyers, and fake-discount MRPs called out"],
    ["mic", "Acts on your screen, by voice", "searches with filters, shortlists, points at options, adds to cart"],
  ];
  rows.forEach((r, i) => {
    const y = 1.7 + i * 1.28;
    s.addShape(pres.shapes.OVAL, { x: 0.75, y, w: 0.92, h: 0.92, fill: { color: CARD2 } });
    s.addImage({ data: I[r[0]], x: 1.0, y: y + 0.24, w: 0.42, h: 0.42 });
    s.addText(r[1], { x: 1.95, y: y - 0.02, w: 10.6, h: 0.5, fontFace: HEAD, bold: true, color: WHITE, fontSize: 20, margin: 0 });
    s.addText(r[2], { x: 1.95, y: y + 0.48, w: 10.6, h: 0.5, fontFace: BODY, color: LAV, fontSize: 14.5, margin: 0 });
  });

  // ---------- S7 Impact ----------
  s = pres.addSlide(); bg(s);
  title(s, "From hours to ninety seconds.");
  s.addText([
    { text: "hours", options: { color: LAV, fontFace: HEAD } },
    { text: "  →  ", options: { color: WHITE, fontFace: BODY } },
    { text: "under 2 min", options: { color: GREEN, fontFace: HEAD, bold: true } },
  ], { x: 0, y: 1.55, w: W, h: 1.1, align: "center", fontSize: 48, margin: 0 });
  s.addText("time to a confident, well-informed decision", { x: 0, y: 2.75, w: W, h: 0.4, align: "center", fontFace: BODY, italic: true, color: ICE, fontSize: 16, margin: 0 });
  const mets = [
    ["bolt", "Decision time", "hours, or abandoned, → under 2 min — you just watched it happen"],
    ["chart", "Conversion ↑", "Drops the 75% cart abandonment rate by resolving hesitation live"],
    ["undoG", "Returns ↓", "Intercepts the #1 cause of returns (wrong size / specs) before checkout"],
  ];
  mets.forEach((m, i) => {
    const x = 0.7 + i * 4.05;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 3.5, w: 3.75, h: 2.5, fill: { color: CARD }, rectRadius: 0.12, shadow: sh() });
    s.addImage({ data: I[m[0]], x: x + 0.35, y: 3.82, w: 0.6, h: 0.6 });
    s.addText(m[1], { x: x + 0.35, y: 4.55, w: 3.1, h: 0.45, fontFace: HEAD, bold: true, color: WHITE, fontSize: 19, margin: 0 });
    s.addText(m[2], { x: x + 0.35, y: 5.05, w: 3.15, h: 0.85, fontFace: BODY, color: LAV, fontSize: 13.5, margin: 0 });
  });
  s.addText("The demo is the proof. Conversion up, returns down — the trust layer e-commerce never had.", { x: 0, y: 6.4, w: W, h: 0.4, align: "center", fontFace: HEAD, italic: true, color: CORAL_SOFT, fontSize: 15, margin: 0 });

  // ---------- S8 Why it wins + bigger play ----------
  s = pres.addSlide(); bg(s);
  title(s, "Novel category. Deeply Indian. Already working.");
  const cols = [
    ["Why it wins", [
      "A new category — an ambient voice companion on top of shopping, not another transactional bot",
      "Voice is load-bearing: the trust relationship fails with a robotic voice",
      "Live Bolna tool-calling reads your browser mid-conversation",
      "Built on a real behavioural insight, not a feature",
    ], CORAL],
    ["Where it goes", [
      "Proactive nudges when the page changes",
      "Full Hindi — a config change, not a rebuild",
      "Multi-site: Flipkart, Myntra adapters",
      "A B2B2C SDK platforms embed to save millions in reverse logistics",
    ], CORAL_SOFT],
  ];
  cols.forEach((c, i) => {
    const x = 0.7 + i * 6.2;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 1.7, w: 5.85, h: 4.7, fill: { color: CARD }, rectRadius: 0.12, shadow: sh() });
    s.addText(c[0], { x: x + 0.45, y: 2.05, w: 5, h: 0.55, fontFace: HEAD, bold: true, color: c[2], fontSize: 22, margin: 0 });
    s.addText(c[1].map((t, j) => ({ text: t, options: { bullet: { indent: 14 }, breakLine: true, paraSpaceAfter: 14, color: ICE } })),
      { x: x + 0.45, y: 2.75, w: 5.05, h: 3.4, fontFace: BODY, fontSize: 15, margin: 0, valign: "top" });
  });

  // ---------- S9 Close ----------
  s = pres.addSlide(); bg(s);
  orb(s, 6.16, 1.5, 1.0, 44);
  s.addText("The trust layer e-commerce never had.", { x: 0, y: 2.95, w: W, h: 1.0, align: "center", fontFace: HEAD, bold: true, color: WHITE, fontSize: 40, margin: 0 });
  s.addText("Saheli — the friend you call before you buy.", { x: 0, y: 4.05, w: W, h: 0.5, align: "center", fontFace: HEAD, italic: true, color: CORAL_SOFT, fontSize: 22, margin: 0 });
  s.addText("Bolna  ·  Cartesia  ·  Deepgram Flux  ·  GPT-4o  ·  Chrome MV3 + FastAPI", { x: 0, y: 6.25, w: W, h: 0.4, align: "center", fontFace: BODY, color: LAV, fontSize: 13, margin: 0 });
  s.addText("github.com/KD-3/saheli-voice-shopping", { x: 0, y: 6.7, w: W, h: 0.35, align: "center", fontFace: BODY, color: CORAL, fontSize: 12, margin: 0 });

  await pres.writeFile({ fileName: "Saheli.pptx" });
  console.log("wrote Saheli.pptx");
})();
