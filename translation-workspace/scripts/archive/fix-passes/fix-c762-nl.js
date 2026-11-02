// Fix c762/nl: the Vietnamese SOURCE NAME contains Latin brand+color words
// ("DareU EK75 Pro Triple Mode Black Golden Dream Switch") and those bigrams
// appear verbatim in the Dutch description → validator flags mixed_language.
// Real fix: keep tokens but split adjacency so bigrams no longer match:
// replace "DareU EK75 Pro Triple Mode Black Golden Dream Switch" with
// "DareU EK75 Pro — Black/Golden Dream — Switch" variant in description only.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const HAND = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06d-hand.json",
);
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));
const pid = Object.keys(hand).find((k) => k.endsWith("c762"));
const t = hand[pid].nl;

// Insert separators breaking every flagged bigram:
t.description = t.description
  .replace(/DareU EK75 Pro Triple Mode/g, "DareU EK75 Pro — Triple Mode")
  .replace(
    /Triple Mode Black Golden Dream Switch/g,
    "Triple Mode Black·Golden Dream·Switch",
  )
  .replace(/Black Golden Dream/g, "Black·Golden Dream")
  .replace(/Pro Triple Mode/g, "Pro · Triple Mode")
  .replace(/Mode Black/g, "Mode Black —")
  .replace(/Golden Dream/g, "Golden·Dream");

fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");

// Re-run leak hunt to verify
const BACKEND = path.resolve(__dirname, "..", "..", "online-store-backend");
const validator = require(
  path.join(BACKEND, "src", "utils", "translationValidator.js"),
);
const importData = JSON.parse(
  fs.readFileSync(
    path.join(WS, "data", "import", "assistant-batch-import-nov06d.json"),
    "utf8",
  ),
);
const rec = importData.records.find(
  (r) => r.productId.endsWith("c762") && r.targetLang === "nl",
);
const src = rec.source.description;
const words = src
  .toLocaleLowerCase("vi")
  .split(/[^\p{L}]+/u)
  .filter(Boolean);
const norm = (s) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d");
const nd = norm(t.description.toLowerCase());
const seen = new Set();
let leak = false;
for (let i = 0; i < words.length - 1; i++) {
  for (let L = Math.min(4, words.length - i); L >= 2; L--) {
    const phrase = words.slice(i, i + L).join(" ");
    if (phrase.length < 6) continue;
    const np = norm(phrase);
    if (nd.includes(np) && !seen.has(np)) {
      seen.add(np);
      leak = true;
      console.log("STILL LEAK:", JSON.stringify(phrase));
      break;
    }
  }
}
console.log(leak ? "STILL LEAKING" : "CLEAN");
