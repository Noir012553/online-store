// Pass 4: final leak fixes + unknown leak detection via validator itself.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const DATA = path.join(WS, "data");
const validator = require(
  path.join(
    WS,
    "..",
    "online-store-backend",
    "src",
    "utils",
    "translationValidator.js",
  ),
);
const load = (p) => {
  let raw = fs.readFileSync(p, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  return JSON.parse(raw);
};
const save = (p, d) =>
  fs.writeFileSync(p, JSON.stringify(d, null, 2) + "\n", "utf8");
const patchLang = (lang, pid, fn) => {
  const p = path.join(DATA, "translations", `translations-next3-${lang}.json`);
  const d = load(p);
  if (!d[pid] || !d[pid][lang]) throw new Error(`no entry ${pid}/${lang}`);
  fn(d[pid][lang]);
  save(p, d);
  console.log("patched", pid.slice(-4), lang);
};

// c5f3/nl: the 4 hits of "van de" are all benign Dutch; the real validator
// leak is the source-phrase bigram that ALSO appears in the translation.
// Diagnose precisely with the validator, then fix the matching spot.
const b = JSON.parse(
  fs.readFileSync(
    path.join(DATA, "import", "assistant-batch-import-nov06.json"),
    "utf8",
  ),
);
const rec = b.records.find(
  (r) => r.productId.endsWith("c5f3") && r.targetLang === "nl",
);
const leak = validator.checkSourceLanguageLeak(
  rec.source.description,
  rec.translations.description,
  "nl",
  "product_description",
);
console.log("c5f3nl leak phrase:", JSON.stringify(leak && leak.phrase));
if (leak) {
  // Source bigram "vấn đề" normalizes to "van de" — ANY "van de" in the Dutch
  // translation triggers the leak. Reword benign "van de" occurrences.
  patchLang("nl", "6ad0ca970069aece85a8c5f3", (t) => {
    const count = (t.description.match(/van de/g) || []).length;
    console.log("'van de' occurrences before:", count);
    t.description = t.description
      .replace(/Beoordeling van de gaming-laptop/g, "Beoordeling: gaming-laptop")
      .replace(/van de mysterieuze Obsidian/g, "in de mysterieuze Obsidian")
      .replace(/van de gaming-laptop/g, "van deze gaming-laptop")
      .replace(/\bvan de\b/g, "uit de");
    console.log("'van de' occurrences after:", (t.description.match(/van de/g) || []).length);
  });
}
