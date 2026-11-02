// Build the nov10 batch (40 records / 5 final products) from
// translations-nov10-hand.json → assistant-batch-import-nov10.json
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const DATA = path.join(WS, "data");
const load = (p) => {
  let raw = fs.readFileSync(p, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  return JSON.parse(raw);
};
const exportData = load(path.join(DATA, "export", "assistant-batch-next.json"));
const PROMO = require("./promo-templates-next.js");
const HAND = load(
  path.join(DATA, "translations", "translations-nov10-hand.json"),
);

const records = exportData.records.map((rec) => {
  const t = HAND[rec.productId]?.[rec.targetLang];
  if (!t) return rec;
  return {
    productId: rec.productId,
    targetLang: rec.targetLang,
    sourceHash: rec.sourceHash,
    source: rec.source,
    translations: {
      name: t.name,
      description: t.description,
      brand: t.brand || rec.source.brand,
      specs:
        t.specs && Object.keys(t.specs).length ? t.specs : rec.source.specs,
      technicalDescription: t.technicalDescription,
      descriptionImages: (rec.source.descriptionImages || []).map((img) => ({
        url: img.url,
        alt: "",
      })),
      promotions: (rec.source.promotions || []).map((p) => {
        const translated = PROMO.translate(p, rec.targetLang);
        return translated ? { ...p, ...translated } : p;
      }),
    },
  };
});

const missing = records.filter((r) => !r.translations.name);
const out = { workflow: "assistant_batch", records };
fs.writeFileSync(
  path.join(DATA, "import", "assistant-batch-import-nov10.json"),
  JSON.stringify(out, null, 2),
  "utf8",
);
console.log("filled:", records.length - missing.length, "/", records.length);
if (missing.length)
  console.log("MISSING:", missing.map((r) => r.targetLang).join(","));
