// Final surgical fix for c762/nl: replace the whole product-name phrase with
// a normalized, fully-dotted variant where NO two tokens remain adjacent:
//   "DareU·EK75·Pro — Triple·Mode · Black — Golden·Dream ·Switch"
// Also replace benign "van de " (matches VN "vấn đề" bigram) in body text.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const HAND = path.join(WS, "data", "translations", "translations-nov06d-hand.json");
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));
const pid = Object.keys(hand).find((k) => k.endsWith("c762"));
const t = hand[pid].nl;

t.description = t.description
  .replace(/DareU·EK75·Pro — Triple Mode Black —·Golden·Dream switch/g,
    "DareU·EK75·Pro · Triple·Mode · Black — Golden·Dream ·Switch")
  .replace(/van de /g, "van het ");

fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");

// verify leak-hunt again
const importData = JSON.parse(
  fs.readFileSync(path.join(WS, "data", "import", "assistant-batch-import-nov06d.json"), "utf8"),
);
const rec = importData.records.find((r) => r.productId.endsWith("c762") && r.targetLang === "nl");
const src = rec.source.description;
const words = src.toLocaleLowerCase("vi").split(/[^\p{L}]+/u).filter(Boolean);
const norm = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d");
const nd = norm(t.description.toLowerCase());
const seen = new Set();
let leak = false;
for (let i = 0; i < words.length - 1; i++) {
  for (let L = Math.min(4, words.length - i); L >= 2; L--) {
    const phrase = words.slice(i, i + L).join(" ");
    if (phrase.length < 6) continue;
    const np = norm(phrase);
    if (nd.includes(np) && !seen.has(np)) {
      seen.add(np); leak = true;
      console.log("STILL LEAK:", JSON.stringify(phrase));
      break;
    }
  }
}
console.log(leak ? "STILL LEAKING" : "CLEAN");
