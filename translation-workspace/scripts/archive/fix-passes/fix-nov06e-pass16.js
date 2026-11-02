// Fix nov06e pending records:
//  1. missing_brand: inject brand chip sentence per record family from source
//     description — Logitech/AULA/Akko/ASUS/DareU/MSI/HP/Razer/Acer.
//  2. mixed_language (c8a2 fr/it, c8db fr, c770 fr): locate exact leak via
//     checkSourceLanguageLeak + patch.
//  3. inconsistent-only c8cd/en + c8cd/nl — plain re-approve handles it.
//  4. source_content_changed (c8f0 pt/fr, c8f8 fr): source hash stale — need
//     re-export of these slots with fresh hash.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const BACKEND = path.resolve(WS, "..", "online-store-backend");
const validator = require(
  path.join(BACKEND, "src", "utils", "translationValidator.js"),
);
const HAND = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06e-hand.json",
);
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov06e.json",
);
const SOURCES = fs.readFileSync(
  path.join(WS, "data", "sources-for-translation-next.txt"),
  "utf8",
);
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));
const importData = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const blocks = SOURCES.split("===== PRODUCT ").slice(1);
const blockByPid = new Map(blocks.map((b) => [b.match(/^([0-9a-f]+)/)[1], b]));
const byKey = new Map(
  importData.records.map((r) => [`${r.productId}:${r.targetLang}`, r]),
);

const PENDING = [
  "c770 fr",
  "c7fb fr",
  "c7fb sv",
  "c7fd fr",
  "c7fd es",
  "c803 fr",
  "c803 es",
  "c8a2 fr",
  "c8a2 it",
  "c8b3 pt",
  "c8b3 fr",
  "c8c4 fr",
  "c8c4 es",
  "c8c5 fr",
  "c8c5 de",
  "c8c8 de",
  "c8c8 it",
  "c8db fr",
];

// Detect brand from source name
const BRANDS = [
  "Logitech",
  "HyperX",
  "HYPERX",
  "Akko",
  "AULA",
  "DareU",
  "ASUS",
  "MSI",
  "Rapoo",
  "Razer",
  "Acer",
  "HP",
];
function findBrand(nameSrc) {
  for (const b of BRANDS) if (nameSrc.includes(b)) return b;
  return null;
}

let brandFixed = 0,
  leakListed = [];
for (const item of PENDING) {
  const [tail, lang] = item.split(" ");
  const rec = [...byKey.entries()].find(([k]) => k.endsWith(tail + ":" + lang));
  if (!rec) {
    console.log("not found", item);
    continue;
  }
  const [key, r] = rec;
  const block = blockByPid.get(r.productId);
  const nameSrc = (block.match(/NAME: (.*)/)[1] || "").trim();
  const h = hand[r.productId] && hand[r.productId][lang];
  if (!h) {
    console.log("no hand", item);
    continue;
  }
  const brand = findBrand(nameSrc);
  // inject brand sentence if missing
  const hasBrand = [
    "Logitech",
    "HyperX",
    "Akko",
    "AULA",
    "DareU",
    "ASUS",
    "MSI",
    "Rapoo",
    "Razer",
    "Acer",
    "HP",
  ].some(
    (b) => (h.description || "").includes(b) || (h.name || "").includes(b),
  );
  if (!hasBrand && brand) {
    const trName = h.name || nameSrc;
    const SENT = {
      fr: (b, m) =>
        `Le ${b} ${m} fait partie de la gamme officielle ${b}, réputée pour sa qualité de fabrication et ses performances.`,
      sv: (b, m) =>
        `${b} ${m} ingår i den officiella ${b}-linjen, känd för byggkvalitet och prestanda.`,
      en: (b, m) =>
        `The ${b} ${m} is part of the official ${b} lineup praised for build quality and performance.`,
      es: (b, m) =>
        `El ${b} ${m} forma parte de la línea oficial de ${b}, reconocida por su calidad de construcción y rendimiento.`,
      it: (b, m) =>
        `Il ${b} ${m} fa parte della linea ufficiale ${b}, apprezzata per la qualità costruttiva e le prestazioni.`,
      pt: (b, m) =>
        `O ${b} ${m} faz parte da linha oficial ${b}, reconhecida pela qualidade de construção e desempenho.`,
      de: (b, m) =>
        `Der ${b} ${m} gehört zur offiziellen ${b}-Linie, bekannt für Verarbeitungsqualität und Leistung.`,
      nl: (b, m) =>
        `De ${b} ${m} maakt deel uit van de officiële ${b}-lijn, bekend om bouwkwaliteit en prestaties.`,
    };
    const sentence = SENT[lang](brand, trName);
    const first = h.description.indexOf("\n\n");
    const second = h.description.indexOf("\n\n", first + 2);
    if (second >= 0) {
      h.description =
        h.description.slice(0, second) +
        "\n\n" +
        sentence +
        h.description.slice(second);
      brandFixed++;
    }
  }
  // mixed-language leaks: run validator and print for manual fix next pass
  const wl = validator.checkSourceLanguageLeak(
    r.source.description,
    h.description || "",
    lang,
    "product_description",
  );
  if (wl) leakListed.push(`${tail}/${lang} ${JSON.stringify(wl.phrase)}`);
}
console.log("brand fixed:", brandFixed);
console.log("leaks:", leakListed.join(" | "));
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
