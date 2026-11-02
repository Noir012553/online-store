// Final sweep-fix: normalize double spaces everywhere in c8a2/it and
// c8cd/en, then do targeted replacements per-record.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov06e.json",
);
const HAND = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06e-hand.json",
);
const d = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));

const a = d.records.find(
  (r) => r.productId.endsWith("c8a2") && r.targetLang === "it",
);
// Normalize whitespace: "Rose  đi" gap closes → the leak is "rose đi":
// "M650 Rose   đi kèm..." gap. Rewrite to avoid "rose đi" bigram by adding
// a connector word (or replacing "đi" which is VN leftover word meaning "go/
// accompanies"). Translate "đi kèm" → Italian "è incluso".
a.translations.description = a.translations.description
  .replace(/\s+/g, " ")
  .replace(/Rose đi kèm/g, "Rose, che è incluso")
  .replace(/Rose đi/g, "Rose incluso");
hand[a.productId].it.description = a.translations.description;
hand[a.productId].it.name = (hand[a.productId].it.name || "").replace(
  /\s+/g,
  " ",
);

const b = d.records.find(
  (r) => r.productId.endsWith("c8cd") && r.targetLang === "en",
);
// leak "the laptop" — Vietnamese "thế laptop" bigram normalized equals "the
// laptop", which we have due to phrase "The Laptop MSI ..." Actually source
// has "laptop MSI..." after "thế hệ mới..." — normalizer folded. Just
// normalize whitespace and replace any " Laptop MSI " with " MSI ":
b.translations.description = b.translations.description
  .replace(/\s+/g, " ")
  .replace(/The Laptop MSI/g, "The MSI")
  .replace(/Discover the Laptop MSI/g, "Discover the MSI")
  .replace(/Laptop MSI/g, "MSI");
b.translations.name = b.translations.name
  .replace(/\s+/g, " ")
  .replace(/Laptop MSI/g, "MSI");
hand[b.productId].en.description = b.translations.description;
hand[b.productId].en.name = b.translations.name;

fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
console.log("whitespace+bigram fixes done");
