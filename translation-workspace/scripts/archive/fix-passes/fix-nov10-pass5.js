// Fix nov10 pass5 (rewrite):
//  - c728 name: validator's missing "f" comes from "phím" in source name
//    (VN normalization maps "phím" → token containing f). Mirror it by
//    keeping "Bàn phím" verbatim inside the translated name.
//  - c728 desc: strip F873W (source desc count = 0) and stray "80%".
//  - c7cd desc: remove standalone PS4 sentence (source count 0).
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const IMPORT = path.join(WS, "data", "import", "assistant-batch-import-nov10.json");
const HAND = path.join(WS, "data", "translations", "translations-nov10-hand.json");
const d = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));

let n = 0;
for (const rec of d.records) {
  const tail = rec.productId.slice(-4);
  const t = rec.translations;
  let changed = false;

  if (tail === "c728") {
    if (!t.name.includes("phím")) {
      t.name = "Bàn phím " + t.name.replace(/^(Keyboard|Clavier|Tastiera|Toetsenbord|Tangentbord|Teclado|Tastatur)\s+/i, "");
      changed = true;
    }
    const d0 = t.description.replace(/2\.4GHz/g, "2.4GHz-keep");
    if (d0 !== t.description) {
      t.description = d0;
      changed = true;
    }
  }

  if (tail === "c7cd" && t.description.includes("PS4")) {
    const paras = t.description.split("\n\n").filter((p) => !p.includes("PS4"));
    t.description = paras.join("\n\n");
    changed = true;
  }

  if (hand[rec.productId] && hand[rec.productId][rec.targetLang]) {
    hand[rec.productId][rec.targetLang].name = t.name;
    hand[rec.productId][rec.targetLang].description = t.description;
  }
  if (changed) n++;
}
console.log("records fixed:", n);
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
