// Build the nov07 batch: fills translations-nov07-hand.json + workspace
// per-language files + archive. Output: assistant-batch-import-nov07.json
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
  path.join(DATA, "translations", "translations-nov07-hand.json"),
);

const LANGS = ["pt", "fr", "de", "it", "es", "nl", "sv", "en"];
const candidateFiles = [];
for (const l of LANGS)
  candidateFiles.push(
    path.join(DATA, "translations", `translations-next3-${l}.json`),
  );
const archiveDir = path.join(DATA, "archive", "translations");
if (fs.existsSync(archiveDir)) {
  for (const f of fs.readdirSync(archiveDir).filter((f) => f.endsWith(".json")))
    candidateFiles.push(path.join(archiveDir, f));
}
const tmap = new Map();
for (const [pid, langs] of Object.entries(HAND)) {
  for (const [lang, t] of Object.entries(langs))
    tmap.set(`${pid}:${lang}`, { t, file: "translations-nov07-hand.json" });
}
for (const f of candidateFiles) {
  let d;
  try {
    d = load(f);
  } catch (e) {
    continue;
  }
  for (const [pid, langs] of Object.entries(d)) {
    if (!langs || typeof langs !== "object") continue;
    for (const [lang, t] of Object.entries(langs)) {
      if (!t || typeof t !== "object" || !t.name) continue;
      const key = `${pid}:${lang}`;
      if (!tmap.has(key)) tmap.set(key, { t, file: path.basename(f) });
    }
  }
}

const missing = [];
const records = exportData.records.map((rec) => {
  const key = `${rec.productId}:${rec.targetLang}`;
  const hit = tmap.get(key);
  if (!hit) {
    missing.push(key);
    return rec;
  }
  const t = hit.t;
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
      descriptionImages: (rec.source.descriptionImages || []).map((img, i) => ({
        url: img.url,
        alt: t.imageAlts && t.imageAlts[i] !== undefined ? t.imageAlts[i] : "",
      })),
      promotions: (rec.source.promotions || []).map((p) => {
        const base = {
          ...p,
          title: p.title || "",
          giftProductName: p.giftProductName || "",
          scope: p.scope || "",
          discountText: p.discountText || "",
        };
        const translated = PROMO.translate(p, rec.targetLang);
        return translated ? { ...p, ...translated } : base;
      }),
    },
  };
});

const out = { workflow: "assistant_batch", records };
const outPath = path.join(DATA, "import", "assistant-batch-import-nov07.json");
fs.writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");
console.log(
  "records filled:",
  records.length - missing.length,
  "/",
  records.length,
);
if (missing.length) console.log("MISSING:", missing.join(", "));

