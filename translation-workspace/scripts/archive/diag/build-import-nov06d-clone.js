// Nov06d generator: fill the 59 missing records by CLONING same-product
// translations from other locales already present in hand/archive files +
// workspace per-language files (any pid:lang entry). Same product → same
// tokens/description body; only the language prose differs. This reuses the
// DIFFERENT-locale translation as a base and re-labels per target lang —
// only safe for accessory products (names mostly brand tokens), plus laptops
// where I keep the source-product name verbatim.
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

// Pool: all existing pid:lang translations from hand files + archive + per-lang files.
const pool = new Map(); // pid -> Map(lang -> t)
const addPool = (d, file) => {
  for (const [pid, langs] of Object.entries(d)) {
    if (!langs || typeof langs !== "object") continue;
    if (!pool.has(pid)) pool.set(pid, new Map());
    for (const [lang, t] of Object.entries(langs)) {
      if (!t || typeof t !== "object" || !t.name) continue;
      if (!pool.get(pid).has(lang)) pool.get(pid).set(lang, { t, file });
    }
  }
};
const HANDS = [
  "translations-nov06-hand.json",
  "translations-nov06b-hand.json",
  "translations-nov06c-hand.json",
  "translations-nov06c-laptop-hand.json",
  "translations-nov06d-hand.json",
  "translations-nov06d-c848-it.json",
  "translations-nov06d-laptop2.json",
  "translations-nov06d-c802-de.json",
  "translations-nov06d-c806-fr.json",
  "translations-nov06d-c807-de.json",
];
for (const f of HANDS) {
  const p = path.join(DATA, "translations", f);
  if (fs.existsSync(p)) addPool(load(p), f);
}
const archiveDir = path.join(DATA, "archive", "translations");
for (const f of fs.readdirSync(archiveDir).filter((f) => f.endsWith(".json"))) {
  try {
    addPool(load(path.join(archiveDir, f)), "archive/" + f);
  } catch (e) {}
}
for (const l of ["pt", "fr", "de", "it", "es", "nl", "sv", "en"]) {
  const p = path.join(DATA, "translations", `translations-next3-${l}.json`);
  if (fs.existsSync(p)) addPool(load(p), `translations-next3-${l}.json`);
}

// Fill: clone from another locale of the SAME pid (pool), else same-product
// name-match across pids, else NOTHING (report missing).
const missing = [];
const sources = [];
const records = exportData.records.map((rec) => {
  const pid = rec.productId;
  const lang = rec.targetLang;
  let hit = pool.get(pid)?.get(lang);
  let file = hit ? hit.file : null;
  let base = hit ? hit.t : null;
  if (!base) {
    // name-based fallback: find any pid with same source name + this lang
    const srcName = rec.source.name.replace(/\s+/g, " ").trim().slice(0, 40);
    for (const [otherPid, langs] of pool) {
      if (otherPid === pid) continue;
      for (const [l, v] of langs) {
        if (l !== lang) continue;
        // can't verify name w/o source name for pool entries; skip this path.
      }
    }
  }
  if (!base) {
    missing.push(`${pid.slice(-4)}:${lang}`);
    return rec;
  }
  sources.push(
    `${pid.slice(-4)}:${lang} <- clone[${(base && base.__from) || "same-pid"}] ${file}`,
  );
  const out = {
    productId: pid,
    targetLang: lang,
    sourceHash: rec.sourceHash,
    source: rec.source,
    translations: {
      name: base.name,
      description: base.description,
      brand: base.brand || rec.source.brand,
      specs:
        base.specs && Object.keys(base.specs).length
          ? base.specs
          : rec.source.specs,
      technicalDescription: base.technicalDescription,
      descriptionImages: rec.source.descriptionImages.map((img, i) => ({
        url: img.url,
        alt:
          base.imageAlts && base.imageAlts[i] !== undefined
            ? base.imageAlts[i]
            : "",
      })),
      promotions: rec.source.promotions.map((p) => {
        const b = {
          ...p,
          title: p.title || "",
          giftProductName: p.giftProductName || "",
          scope: p.scope || "",
          discountText: p.discountText || "",
        };
        const tr = PROMO.translate(p, lang);
        if (!tr) return b;
        return { ...p, ...tr };
      }),
    },
  };
  return out;
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
if (missing.length) console.log("MISSING:", missing.join(", "));
fs.writeFileSync(
  path.join(WS, "logs", "nov06d-sources.txt"),
  sources.join("\n"),
  "utf8",
);
