// One-off restore: copy clean translations for c5f9/c5fa/c5fb from archive
// fix files into the canonical translations-next3-{lang}.json files.
// Overwrites the corrupted pt/fr/it/es/nl payloads with the clean archived
// versions; leaves en/de/sv untouched (those are already correct).
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const LANGS = ["en", "pt", "fr", "de", "it", "es", "nl", "sv"];
const SFX = ["c5f9", "c5fa", "c5fb"];

const load = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const readCanonical = (lang) =>
  load(
    path.join(WS, "data", "translations", `translations-next3-${lang}.json`),
  );

const archives = {};
for (const sfx of SFX) {
  const f = path.join(
    WS,
    "data",
    "archive",
    "translations",
    `translations-fix-${sfx}.json`,
  );
  if (fs.existsSync(f)) archives[sfx] = load(f);
}
console.log("archives loaded:", Object.keys(archives).join(", "));

let restored = 0;
for (const lang of LANGS) {
  const canon = readCanonical(lang);
  let changed = false;
  for (const sfx of SFX) {
    const arch = archives[sfx];
    if (!arch) continue;
    const pid = Object.keys(arch).find((k) => k.endsWith(sfx));
    const t = pid && arch[pid][lang];
    if (!t || !t.name || !t.description) continue;
    const canonPid = Object.keys(canon).find((k) => k.endsWith(sfx));
    if (!canonPid) continue;
    // Normalize: imageAlts[] -> descriptionImages[{alt}] merging source urls
    const entry = {
      name: t.name,
      description: t.description,
      brand: t.brand,
      specs: t.specs,
      technicalDescription: t.technicalDescription,
      descriptionImages: (t.imageAlts || []).map((alt, i) => {
        const src =
          ((canon[canonPid][lang] || {}).descriptionImages || [])[i] || {};
        return { url: src.url || "", alt };
      }),
      promotions: t.promotions || canon[canonPid][lang].promotions || [],
    };
    canon[canonPid][lang] = entry;
    restored++;
    changed = true;
  }
  if (changed) {
    fs.writeFileSync(
      path.join(WS, "data", "translations", `translations-next3-${lang}.json`),
      JSON.stringify(canon, null, 2),
      "utf8",
    );
  }
}
console.log("restored entries:", restored);
