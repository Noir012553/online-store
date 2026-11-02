// Fix pass 27 — replace "X su GearVN" → "X presso GearVN" for all it records;
// also "X su GearVN" in other languages that use "su" preposition. Also fix
// the duplicate "Tastiera" prefix left over in c907/it name/desc.
const path = require("path");
const fs = require("fs");
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

let n = 0;
for (const rec of d.records) {
  const lang = rec.targetLang;
  const t = rec.translations;
  const SUBS = [];
  if (lang === "it") SUBS.push([/\bsu GearVN\b/gi, "presso GearVN"]);
  if (lang === "es") SUBS.push([/\bcon GearVN\b/gi, "en GearVN"]);
  if (!SUBS.length) continue;
  for (const [re, w] of SUBS) {
    for (const f of ["name", "description", "technicalDescription"]) {
      if (t[f] && t[f].match(re)) {
        t[f] = t[f].replace(re, w);
        n++;
      }
    }
    if (hand[rec.productId] && hand[rec.productId][lang]) {
      const h = hand[rec.productId][lang];
      for (const f of ["name", "description", "technicalDescription"]) {
        if (h[f] && h[f].match(re)) h[f] = h[f].replace(re, w);
      }
    }
  }
}
console.log("substitutions:", n);

// c907/it — fix the duplicated "Tastiera" prefix
const r = d.records.find(
  (x) => x.productId.endsWith("c907") && x.targetLang === "it",
);
r.translations.description = r.translations.description.replace(
  "Il Tastiera Razer Reclusa X Mini 65",
  "La tastiera Razer Reclusa X Mini 65",
);
r.translations.name = r.translations.name.replace(
  "Tastiera Razer",
  "Tastiera Razer",
);
hand[r.productId].it.description = r.translations.description;
hand[r.productId].it.name = r.translations.name;
console.log("c907/it Tastiera prefix fixed");

fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
console.log("pass27 done");
