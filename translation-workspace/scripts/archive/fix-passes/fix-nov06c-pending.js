// Fix the 9 pending records based on diagnosis:
//  - c638/c639/c654/c658 missing_brand: check which brand token is missing and
//    restore it in description.
//  - c6be/it mixed_language: locate + remove VN phrase.
//  - c6c0/en, c6c2/it: inconsistent-only → approved on re-run (nothing to fix).
//  - c6c1/nl: errors=[] score 100 → likely transient, plain re-approve works.
//  - c6f8/it markup_mismatch: source vs translation markup mismatch — align.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const load = (p) => {
  let raw = fs.readFileSync(p, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  return JSON.parse(raw);
};

const IMPORT_PATH = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov06c.json",
);
const HAND_ACC = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06c-hand.json",
);
const importData = load(IMPORT_PATH);
const hand = load(HAND_ACC);

const byKey = new Map(
  importData.records.map((r) => [`${r.productId}:${r.targetLang}`, r]),
);

// Diagnostic helper: which brand tokens exist in source but not in translation?
const BRANDS = [
  "AULA",
  "ASUS",
  "ROG",
  "Akko",
  "Corsair",
  "DareU",
  "VEEKOS",
  "Veekos",
  "AKKO",
  "Logitech",
  "Razer",
  "Keychron",
  "Kinbas",
  "Xiaomi",
  "MSI",
  "Lenovo",
  "HP",
  "Dell",
  "Acer",
  "UGREEN",
  "Baseus",
  "Lofree",
  "Attack Shark",
  "AttackShark",
  "VXE",
  "ATK",
  "Iron Cat",
  "IronCat",
  "Pulsar",
  "Fantech",
  "Sig",
  "Kemove",
  "MCHOSE",
  "MCHOSE AX75",
  "Motospeed",
];
for (const key of [
  "6ad0cc010069aece85a8c638:en",
  "6ad0cc010069aece85a8c639:en",
  "6ad0cc440069aece85a8c654:it",
  "6ad0cc440069aece85a8c658:it",
]) {
  const rec = byKey.get(key);
  if (!rec) {
    console.log("MISSING", key);
    continue;
  }
  const src = rec.source.description;
  const tr = rec.translations.description;
  for (const b of BRANDS) {
    if (src.includes(b) && !tr.includes(b))
      console.log(key.slice(-9), "MISSING BRAND:", b);
  }
}
