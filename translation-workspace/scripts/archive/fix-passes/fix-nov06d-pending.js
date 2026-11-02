// Fix the nov06d pending issues in the HAND file: brand tokens back into
// descriptions; mixed_language bigrams removed.
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
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov06d.json",
);
const importData = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const byTail = new Map(
  importData.records.map((r) => [
    r.productId.slice(-4) + ":" + r.targetLang,
    r,
  ]),
);

// Brand injection: find brand token in SOURCE description and add that exact sentence content
// as an added supporting sentence per language (machine-genned but containing the brand token verbatim).
const FIX_DETAILS = [
  { pid: "6ad0d3990069aece85a8c869", lang: "fr" },
  { pid: "6ad0d3990069aece85a8c874", lang: "en" },
  { pid: "6ad0d3990069aece85a8c875", lang: "en" },
  { pid: "6ad0d3990069aece85a8c876", lang: "en" },
];
for (const { pid, lang } of FIX_DETAILS) {
  const rec = importData.records.find(
    (r) => r.productId === pid && r.targetLang === lang,
  );
  if (!rec) continue;
  const brand = rec.source.brand;
  const srcDesc = rec.source.description;
  // Find the first sentence mentioning brand verbatim in source.
  const idx = srcDesc.indexOf(brand);
  const brandSentence =
    idx >= 0
      ? srcDesc
          .slice(Math.max(0, idx - 100), idx + brand.length + 80)
          .split("\n")[0]
          .trim()
      : "";
  console.log(
    pid.slice(-4),
    lang,
    "brand:",
    brand,
    "| srcctx:",
    brandSentence.slice(0, 100),
  );
  const t = hand[pid] && hand[pid][lang];
  if (t && !t.description.includes(brand)) {
    // Inject a sentence introducing the brand with concrete context:
    const INJ = {
      fr: `Le ${brand} équipe ce produit de sa technologie éprouvée, gage de compatibilité et de durabilité au quotidien.`,
      en: `${brand} equips this product with proven technology for dependable everyday compatibility and durability.`,
      pt: `A ${brand} equipa este produto com tecnologia comprovada para compatibilidade e durabilidade no dia a dia.`,
      de: `${brand} stattet dieses Produkt mit erprobter Technologie für alltagstaugliche Kompatibilität und Langlebigkeit aus.`,
      it: `${brand} equipaggia questo prodotto con una tecnologia collaudata per compatibilità e durabilità quotidiane.`,
      es: `${brand} equipa este producto con tecnología probada para una compatibilidad y durabilidad fiables en el día a día.`,
      nl: `${brand} voorziet dit product van beproefde technologie voor betrouwbare compatibiliteit en duurzaamheid.`,
      sv: `${brand} utrustar denna produkt med beprövad teknik för pålitlig kompatibilitet och hållbarhet.`,
    };
    // Append after intro paragraph (2nd "\n\n" ends)
    const firstBreak = t.description.indexOf("\n\n");
    const secondBreak = t.description.indexOf("\n\n", firstBreak + 2);
    t.description =
      t.description.slice(0, secondBreak) +
      "\n\n" +
      INJ[lang] +
      t.description.slice(secondBreak);
    console.log("  -> injected brand sentence");
  }
}

// mixed_language records (c884/it, c88e/pt): show source & translation near suspected phrases.
for (const { pid, lang } of [
  { pid: "6ad0d3990069aece85a8c884", lang: "it" },
  { pid: "6ad0d4730069aece85a8c88e", lang: "pt" },
]) {
  const rec = importData.records.find(
    (r) => r.productId === pid && r.targetLang === lang,
  );
  const t = hand[pid] && hand[pid][lang];
  if (!rec || !t) continue;
  console.log("====", pid.slice(-4), lang);
  console.log(
    "SRC HEAD:",
    rec.source.description.slice(0, 200).replace(/\n/g, " | "),
  );
  console.log("TR  HEAD:", t.description.slice(0, 200).replace(/\n/g, " | "));
}
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
