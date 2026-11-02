// Fix pass for the 4 missing_brand + c6be/it mixed_language + c6f8/it markup.
// The missing brands live in specific source sentences; inject equivalent
// sentences carrying the brand token into the translations.
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

// c638/en: add "Akko Frost Pink" switch sentence (source mentions it twice).
{
  const t = hand["6ad0cc010069aece85a8c638"].en;
  if (!t.description.includes("Akko")) {
    t.description = t.description.replace(
      /(Quality keycaps and stable typing feel\n\n[^\n]+)/,
      "$1\n\nThe Akko Frost Pink switch delivers the signature Akko typing feel, and the hot-swap support lets you change switches of the same standard easily without complex soldering.",
    );
  }
}
// c639/en: add Akko MOA keycap sentence.
{
  const t = hand["6ad0cc010069aece85a8c639"].en;
  if (!t.description.includes("Akko")) {
    t.description = t.description.replace(
      /(Quality keycaps and stable typing feel\n\n[^\n]+)/,
      "$1\n\nThe keyboard uses the MOA profile keycap designed by Akko with uniform height, making it easy to get used to while giving a comfortable, stable typing feel; the PBT double-shot material keeps the surface durable and sweat-resistant.",
    );
  }
}
// c654/it + c658/it: add "ASUS Essence" driver sentence.
{
  const t = hand["6ad0cc440069aece85a8c654"].it;
  if (!t.description.includes("ASUS")) {
    t.description = t.description.replace(
      /(Keycap di qualità e digitazione stabile\n\n[^\n]+)/,
      "$1\n\nI driver ASUS Essence in gomma silicone liquida (LSR) offrono una qualità audio eccellente, con un controllo specificamente progettato per le cuffie.",
    );
  }
}
{
  const t = hand["6ad0cc440069aece85a8c658"].it;
  if (!t.description.includes("ASUS")) {
    t.description = t.description.replace(
      /(Keycap di qualità e digitazione stabile\n\n[^\n]+)/,
      "$1\n\nCon i membrane ASUS Essence esclusivi, la tecnologia della camera sigillata e il rilevamento del segnale audio, le ROG Delta Core offrono un suono altamente dettagliato.",
    );
  }
}

save(HAND_ACC, hand);
console.log("brand sentences injected");

// c6be/it mixed_language: locate the VN leak from the import payload.
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov06c.json",
);
const importData = load(IMPORT);
const byKey = new Map(
  importData.records.map((r) => [`${r.productId}:${r.targetLang}`, r]),
);
const rec = byKey.get("6ad0ce6e0069aece85a8c6be:it");
if (rec) {
  const desc = rec.translations.description;
  // search words with VN diacritics
  const VIET = /[ăâđêôơưáàảãạấầẩẫậắằẳẵặếềểễệốồổỗộớờởỡợứừửữự]/u;
  const m = [
    ...desc.matchAll(
      /[\p{L}]*[ăâđêôơưáàảãạấầẩẫậắằẳẵặếềểễệốồổỗộớờởỡợứừửữự][\p{L}]*/gu,
    ),
  ].map((x) => x[0]);
  console.log("c6be/it VN tokens:", [...new Set(m)].join(", "));
}
// c6f8/it markup mismatch: check source vs translation markup tokens
const recF = byKey.get("6ad0cff40069aece85a8c6f8:it");
if (recF) {
  const markup = (s) =>
    String(s || "").match(
      /<\/?[A-Za-z][^>]*>|&[A-Za-z0-9#]+;|\{\{[^}]+\}\}|\[[^\]]+\]\([^\)]+\)/g,
    ) || [];
  const s1 = markup(recF.source.description);
  const s2 = markup(recF.translations.description);
  console.log(
    "c6f8/it markup src:",
    JSON.stringify(s1.slice(0, 10)),
    "tr:",
    JSON.stringify(s2.slice(0, 10)),
  );
}
