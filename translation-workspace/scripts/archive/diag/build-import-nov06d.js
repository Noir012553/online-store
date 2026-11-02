// Build the nov06d batch: fills translations-nov06d-hand.json + per-language
// workspace files + archive. Output: assistant-batch-import-nov06d.json
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
  path.join(DATA, "translations", "translations-nov06d-hand.json"),
);
const HAND_LAPTOP = load(
  path.join(DATA, "translations", "translations-nov06c-laptop-hand.json"),
);
const HAND_C848 = load(
  path.join(DATA, "translations", "translations-nov06d-c848-it.json"),
);
const HAND_LAPTOP2 = load(
  path.join(DATA, "translations", "translations-nov06d-laptop2.json"),
);
const HAND_C802 = load(
  path.join(DATA, "translations", "translations-nov06d-c802-de.json"),
);
const HAND_C806 = load(
  path.join(DATA, "translations", "translations-nov06d-c806-fr.json"),
);
const HAND_C807 = load(
  path.join(DATA, "translations", "translations-nov06d-c807-de.json"),
);
const HAND_GEN = load(
  path.join(DATA, "translations", "translations-nov06d-gen.json"),
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
    tmap.set(`${pid}:${lang}`, { t, file: "translations-nov06d-hand.json" });
}
for (const [pid, langs] of Object.entries(HAND_LAPTOP)) {
  for (const [lang, t] of Object.entries(langs))
    tmap.set(`${pid}:${lang}`, {
      t,
      file: "translations-nov06c-laptop-hand.json",
    });
}
for (const [pid, langs] of Object.entries(HAND_C848)) {
  for (const [lang, t] of Object.entries(langs))
    tmap.set(`${pid}:${lang}`, {
      t,
      file: "translations-nov06d-c848-it.json",
    });
}
for (const [pid, langs] of Object.entries(HAND_LAPTOP2)) {
  for (const [lang, t] of Object.entries(langs))
    tmap.set(`${pid}:${lang}`, {
      t,
      file: "translations-nov06d-laptop2.json",
    });
}
for (const [pid, langs] of Object.entries(HAND_C802)) {
  for (const [lang, t] of Object.entries(langs))
    tmap.set(`${pid}:${lang}`, {
      t,
      file: "translations-nov06d-c802-de.json",
    });
}
for (const [pid, langs] of Object.entries(HAND_C806)) {
  for (const [lang, t] of Object.entries(langs))
    tmap.set(`${pid}:${lang}`, {
      t,
      file: "translations-nov06d-c806-fr.json",
    });
}
for (const [pid, langs] of Object.entries(HAND_C807)) {
  for (const [lang, t] of Object.entries(langs))
    tmap.set(`${pid}:${lang}`, {
      t,
      file: "translations-nov06d-c807-de.json",
    });
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
const outPath = path.join(DATA, "import", "assistant-batch-import-nov06d.json");
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
  path.join(WS, "logs", "nov06d-sources.txt"),
  sources.join("\n"),
  "utf8",
);
