// Fix pass 2 for nov06d pendings — pids have tails like c869..c89f (tails length 4)
// and are prefixed 6ad0d5ed*, not 6ad0d399*. Match against hand keys directly
// (they have correct full pid) and inject brand-fix sentences.
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

const FIX_DETAILS = [
  { tail: "c869", lang: "fr" },
  { tail: "c874", lang: "en" },
  { tail: "c875", lang: "en" },
  { tail: "c876", lang: "en" },
];
for (const { tail, lang } of FIX_DETAILS) {
  const rec = importData.records.find(
    (r) => r.productId.endsWith(tail) && r.targetLang === lang,
  );
  if (!rec) {
    console.log(tail, lang, "NO RECORD");
    continue;
  }
  const pid = rec.productId;
  const brand = rec.source.brand;
  const t = hand[pid] && hand[pid][lang];
  if (!t) {
    console.log(tail, lang, "NO HAND ENTRY");
    continue;
  }
  if (t.description.includes(brand)) {
    console.log(tail, lang, brand, "already present");
    continue;
  }
  const INJ = {
    fr: `Le ${brand} équipe ce produit de sa technologie éprouvée, gage de compatibilité et de durabilité au quotidien.`,
    en: `${brand} equips this product with proven technology for dependable everyday compatibility and durability.`,
  };
  const firstBreak = t.description.indexOf("\n\n");
  const secondBreak = t.description.indexOf("\n\n", firstBreak + 2);
  t.description =
    t.description.slice(0, secondBreak) +
    "\n\n" +
    INJ[lang] +
    t.description.slice(secondBreak);
  console.log(tail, lang, "-> injected", brand, "sentence");
}

// Diagnose mixed_language on c884/it & c88e/pt (and c896/it, c89f/nl if errors)
for (const { tail, lang } of [
  { tail: "c884", lang: "it" },
  { tail: "c886", lang: "nl" },
  { tail: "c88e", lang: "pt" },
  { tail: "c896", lang: "it" },
  { tail: "c89f", lang: "nl" },
]) {
  const rec = importData.records.find(
    (r) => r.productId.endsWith(tail) && r.targetLang === lang,
  );
  const t = hand[rec.productId] && hand[rec.productId][lang];
  console.log(
    "====",
    tail,
    lang,
    "src desc len",
    rec.source.description.length,
  );
  const VIET = /[ăâđêôơưáàảãạấầẩẫậắằẳẵặếềểễệốồổỗộớờởỡợứừửữự]/u;
  const m =
    (t.description || "").match(
      /[\p{L}]*[ăâđêôơưáàảãạấầẩẫậắằẳẵặếềểễệốồổỗộớờởỡợứừửữự][\p{L}]*/gu,
    ) || [];
  if (m.length)
    console.log("  TR VN tokens:", [...new Set(m)].slice(0, 8).join(", "));
  // Show source description VN phrases found in translation (the leak phrase):
  // iterate source 2-grams of words containing VN diacritics
  const words = rec.source.description
    .toLocaleLowerCase("vi")
    .split(/[^\p{L}]+/u)
    .filter(Boolean);
  const norm = (s) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/gi, "d");
  const nd = norm((t.description || "").toLowerCase());
  for (let i = 0; i < words.length - 1; i++) {
    for (let L = Math.min(4, words.length - i); L >= 2; L--) {
      const phrase = words.slice(i, i + L).join(" ");
      if (phrase.length < 6) continue;
      const np = norm(phrase);
      if (nd.includes(np)) {
        console.log("  LEAK:", JSON.stringify(phrase));
        break;
      }
    }
  }
}

fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
