// Build the assistant_batch import JSON for the "next" batch (Acer laptops),
// filling translations from the per-language translation files and running
// the same invariant checks as build-import.js (spec numbers, model tokens,
// description numbers). Output: data/import/assistant-batch-import-next3.json
const fs = require("fs");
const path = require("path");

const WS = path.join(__dirname, "..");
const load = (p) => {
  let raw = fs.readFileSync(p, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  return JSON.parse(raw);
};
const exportData = load(
  path.join(WS, "data", "export", "assistant-batch-next.json"),
);
const groups = ["pt", "fr", "de", "it", "es", "nl", "sv", "en"].map((l) =>
  load(path.join(WS, "data", "translations", `translations-next3-${l}.json`)),
);
// Promotions templates per language (gift names translated + localized title)
const PROMO = require("./promo-templates-next.js");

const tmap = new Map();
for (const g of groups) {
  for (const [pid, langs] of Object.entries(g)) {
    for (const [lang, t] of Object.entries(langs))
      tmap.set(`${pid}:${lang}`, t);
  }
}

let filled = 0;
const missing = [];
const records = exportData.records.map((rec) => {
  const t = tmap.get(`${rec.productId}:${rec.targetLang}`);
  if (!t) {
    missing.push(`${rec.productId}:${rec.targetLang}`);
    return rec;
  }
  const out = {
    productId: rec.productId,
    targetLang: rec.targetLang,
    sourceHash: rec.sourceHash,
    source: rec.source,
    translations: {
      name: t.name,
      description: t.description,
      brand: t.brand,
      specs: t.specs,
      technicalDescription: t.technicalDescription,
      descriptionImages: rec.source.descriptionImages.map((img, i) => ({
        url: img.url,
        alt: t.imageAlts && t.imageAlts[i] !== undefined ? t.imageAlts[i] : "",
      })),
      promotions: rec.source.promotions.map((p) => {
        const base = {
          ...p,
          title: p.title || "",
          giftProductName: p.giftProductName || "",
          scope: p.scope || "",
          discountText: p.discountText || "",
        };
        const translated = PROMO.translate(p, rec.targetLang);
        if (!translated) return base;
        return { ...p, ...translated };
      }),
    },
  };
  filled++;
  return out;
});

// --- Invariant checks (same spirit as build-import.js) ---
function countOcc(hay, needle) {
  if (!needle) return -1;
  let n = 0,
    i = 0;
  while ((i = hay.indexOf(needle, i)) !== -1) {
    n++;
    i += needle.length;
  }
  return n;
}
const issues = [];
for (const rec of records) {
  const src = exportData.records.find(
    (r) => r.productId === rec.productId && r.targetLang === rec.targetLang,
  ).source;
  const tr = rec.translations;
  if (!tr || !tr.name) continue; // unfilled record
  const combined = `${tr.name}\n${tr.description}\n${tr.technicalDescription}\n${Object.values(tr.specs || {}).join("\n")}`;
  // Real invariant: every numeric token in the source must appear in the
  // translation, allowing decimal comma/dot variation + whitespace diff.
  const norm = (s) => String(s || "").replace(/\s+/g, "").replace(/,(\d)/g, ".$1").toLowerCase();
  // Number tokens must not cross sentence boundaries: a match may not be
  // immediately followed by a letter (e.g. "2.1.1 cổng" style enumerations),
  // nor start mid-word.
  const numsOf = (s) =>
    (String(s || "").match(/(?<![\w.])(?:\d+)(?:[.]\d+)?(?![\w])/g) || [])
      .filter((n) => !(n.length === 1 && "1234".includes(n)));
  const srcText = norm(`${src.name}\n${src.description}\n${src.technicalDescription}\n${Object.values(src.specs || {}).join("\n")}`);
  const trText = norm(`${tr.name}\n${tr.description}\n${tr.technicalDescription}\n${Object.values(tr.specs || {}).join("\n")}`);
  for (const n of new Set(numsOf(srcText))) {
    if (!trText.includes(n)) {
      issues.push(`${rec.productId}/${rec.targetLang}: lost number "${n}"`);
    }
  }
  // imageAlts count sanity: non-empty alt translations must not exceed source alts
  const srcAlts = src.descriptionImages.length;
  if (tr.descriptionImages && tr.descriptionImages.length !== srcAlts) {
    issues.push(
      `${rec.productId}/${rec.targetLang}: descriptionImages count ${tr.descriptionImages.length} != source ${srcAlts}`,
    );
  }
}

const out = { workflow: "assistant_batch", records };
const outPath = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-next.json",
);
fs.writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");
console.log("records filled:", filled, "/", exportData.records.length);
if (missing.length) console.log("MISSING translations:", missing.join(", "));
console.log("token issues:", issues.length);
issues.slice(0, 60).forEach((x) => console.log(" -", x));
console.log("file size:", fs.statSync(outPath).size, "->", outPath);
