// Build the assistant_batch import JSON for the 2026-11-06 batch (22 records,
// 10 Acer products). Fill translations in priority order:
//   1. per-language workspace files translations-next3-{lang}.json
//   2. archive translation files (human-approved drafts from earlier sessions)
// Promotions are translated via promo-templates-next.js; imageAlts via the
// translation record. Any record still unfilled is reported as MISSING.
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

// Hand translations I wrote for the 12 records with no prior human draft.
const HAND = load(path.join(DATA, "translations", "translations-nov06-hand.json"));

// Priority-ordered candidate files per language.
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
const tmap = new Map(); // pid:lang -> {t, file}
for (const [pid, langs] of Object.entries(HAND)) {
  for (const [lang, t] of Object.entries(langs))
    tmap.set(`${pid}:${lang}`, { t, file: "translations-nov06-hand.json" });
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
const sources = [];
const records = exportData.records.map((rec) => {
  const key = `${rec.productId}:${rec.targetLang}`;
  const hit = tmap.get(key);
  if (!hit) {
    missing.push(key);
    return rec;
  }
  const t = hit.t;
  sources.push(`${key} <- ${hit.file}`);
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
});

const out = { workflow: "assistant_batch", records };
const outPath = path.join(DATA, "import", "assistant-batch-import-nov06.json");
fs.writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");
console.log(
  "records filled:",
  records.length - missing.length,
  "/",
  records.length,
);
if (missing.length) console.log("MISSING translations:", missing.join(", "));
console.log("file size:", fs.statSync(outPath).size, "->", outPath);
fs.writeFileSync(
  path.join(WS, "logs", "nov06-sources.txt"),
  sources.join("\n"),
  "utf8",
);
