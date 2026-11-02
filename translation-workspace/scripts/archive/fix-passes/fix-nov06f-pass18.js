// Fix pass 18 — c8a2/it: source lists platforms incl. "iPad OS" but it translation
// omits it. Inject the Italian platform sentence into the description.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov06f.json",
);
const HAND = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06f-hand.json",
);
const d = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));
const pid = "6ad0d5ed0069aece85a8c8a2";
const r = d.records.find((x) => x.productId === pid && x.targetLang === "it");
const SENT =
  "Il Logitech M650 funziona in modo stabile su tutte le piattaforme: Windows, macOS, Linux, iPad OS, Android e altri.";
let t = r.translations.description;
if (!t.includes("iPad")) {
  // insert after the paragraph mentioning 10m connection, or append after first paragraph
  const anchor = t.indexOf("\n\n");
  const second = t.indexOf("\n\n", anchor + 2);
  const at = second >= 0 ? second : anchor;
  t = t.slice(0, at) + "\n\n" + SENT + t.slice(at);
  r.translations.description = t;
  hand[pid].it.description = t;
  fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
  fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
  console.log("iPad OS sentence injected into c8a2/it");
} else {
  console.log("already present, no change");
}
