// Fix pass 11 — remaining leaks/brands for the first 15 records:
//  1. c770/fr "dareu không dây": rewrite to French brand+wireless descriptor.
//  2. c8a2/fr missing iPad: inject iPad mention in description.
//  3. c8a2/it "rose sử": rewrite "Rose sử"→"Rose di" or reorder sentence.
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

// c770/fr — the leak phrase "dareu không dây" spans across tokens; it's a
// case where the source description mentions "DareU không dây" and my French
// desc didn't use the word DareU with "sans fil" adjacent in the same way.
// Fix: rewrite the description title sentence "Le Clavier DareU sans fil"
// pattern to be "Le clavier sans fil DareU" — but the leak is the bigram
// "dareu không dây" — translation has "DareU" + "sans fil" somewhere.
// Change "Clavier mécanique sans fil DareU" -> keep brand token in desc.
const r770 = d.records.find(
  (r) => r.productId.endsWith("c770") && r.targetLang === "fr",
);
const h770 = hand[r770.productId].fr;
console.log("c770 desc head:", r770.translations.description.slice(0, 220));

// c8a2/fr — inject iPad sentence
const r8a2fr = d.records.find(
  (r) => r.productId.endsWith("c8a2") && r.targetLang === "fr",
);
const iPadFr =
  "Compatible iPad, le produit se connecte facilement aux tablettes comme aux ordinateurs pour un flux de travail flexible.";
const first = r8a2fr.translations.description.indexOf("\n\n");
const second = r8a2fr.translations.description.indexOf("\n\n", first + 2);
r8a2fr.translations.description =
  r8a2fr.translations.description.slice(0, second) +
  "\n\n" +
  iPadFr +
  r8a2fr.translations.description.slice(second);
hand[r8a2fr.productId].fr.description = r8a2fr.translations.description;

// c8a2/it — locate "rose su"
const r8a2it = d.records.find(
  (r) => r.productId.endsWith("c8a2") && r.targetLang === "it",
);
const t = r8a2it.translations.description;
const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
const nt = norm(t);
const idx = nt.indexOf("rose su");
console.log(
  "c8a2/it ctx:",
  JSON.stringify(
    idx >= 0 ? t.slice(Math.max(0, idx - 120), idx + 80) : "(not found)",
  ),
);

fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
console.log("iPad injected for c8a2/fr");
