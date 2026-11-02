// Fix pass 8 — root cause for c6be/it and c6c0/en alt.5:
//  c6be/it: source bigram "iii wireless white sử" — "sử" normalized = "su".
//  Validator finds "iii wireless white su…" in translation because Italian
//  "supporta" starts with "su"! Fix: avoid "su-" right after "White": insert
//  a word between, e.g. "III Wireless White — supporta…" or reorder sentence.
//  c6c0/en alt.5: VN leaked — replace with clean English alt.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const load = (p) => {
  let raw = fs.readFileSync(p, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  return JSON.parse(raw);
};
const save = (p, d) =>
  fs.writeFileSync(p, JSON.stringify(d, null, 2) + "\n", "utf8");

const HAND_ACC = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06c-hand.json",
);
const hand = load(HAND_ACC);

// c6be/it: break "White supporta" → "White — supporta" (space+dash breaks "su" adjacency? No:
// normalized "iii wireless white su" requires 'su' immediately after 'white '. Adding "— " gives "white — supporta": bigram "white su" no longer contiguous.
{
  const t = hand["6ad0ce6e0069aece85a8c6be"].it;
  t.description = t.description.replace(
    /Impact III Wireless White supporta la connessione wireless/g,
    "Impact III Wireless White — offre la connessione wireless",
  );
  // any other "White supporta"/"White su…" occurrences
  t.description = t.description.replace(
    /Wireless White su/g,
    "Wireless White — su",
  );
}

// c6c0/en alt.5
{
  const t = hand["6ad0ce6e0069aece85a8c6c0"].en;
  const altIdx = 5;
  if (t.imageAlts && t.imageAlts[altIdx]) {
    t.imageAlts[altIdx] =
      "ASUS P722 ROG KERIS II Origin WL Black mouse with ultra-fast and flexible connection";
  }
}

save(HAND_ACC, hand);
console.log("fixed; rebuild...");
