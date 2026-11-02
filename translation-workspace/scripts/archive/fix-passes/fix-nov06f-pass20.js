// Fix pass 20 — full leak sweep of all remaining word pairs and colors
// across 8 languages. Builds a translation dict for every VN phrase reported.
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const HAND = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06f-hand.json",
);
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov06f.json",
);
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));
const d = JSON.parse(fs.readFileSync(IMPORT, "utf8"));

const MAP = {
  "orange switch sử": {
    en: "orange switch with",
    fr: "orange switch avec",
    it: "orange switch con",
    nl: "orange switch met",
    sv: "orange switch med",
    pt: "orange switch com",
    es: "orange switch con",
    de: "orange switch mit",
  },
  "để akko": {
    en: "for akko",
    fr: "pour akko",
    it: "per akko",
    nl: "voor akko",
    sv: "för akko",
    pt: "para akko",
    es: "para akko",
    de: "für akko",
  },
  "piano pro switch để": {
    en: "piano pro switch for",
    fr: "piano pro switch pour",
    it: "piano pro switch per",
    nl: "piano pro switch voor",
    sv: "piano pro switch för",
    pt: "piano pro switch para",
    es: "piano pro switch para",
    de: "piano pro switch für",
  },
  "không dây akko": {
    en: "wireless akko",
    fr: "akko sans fil",
    it: "akko wireless",
    nl: "akko draadloos",
    sv: "akko trådlös",
    pt: "akko sem fios",
    es: "akko inalámbrico",
    de: "akko kabellos",
  },
  "xám đen gradient": {
    en: "black gray gradient",
    fr: "dégradé noir gris",
    it: "gradiente nero grigio",
    nl: "grijs zwart gradient",
    sv: "grå svart gradient",
    pt: "gradiente preto cinza",
    es: "degradado negro gris",
    de: "schwarz grau verlauf",
  },
  "xanh dương be tím": {
    en: "blue beige purple",
    fr: "bleu beige violet",
    it: "blu beige viola",
    nl: "blauw beige paars",
    sv: "blå beige lila",
    pt: "azul bege roxo",
    es: "azul beige morado",
    de: "blau beige lila",
  },
  "có dây": {
    en: "wired",
    fr: "filaire",
    it: "cablato",
    nl: "bedraad",
    sv: "trådbunden",
    pt: "com fios",
    es: "con cable",
    de: "kabelgebunden",
  },
  "xanh dương": {
    en: "blue",
    fr: "bleu",
    it: "blu",
    nl: "blauw",
    sv: "blå",
    pt: "azul",
    es: "azul",
    de: "blau",
  },
  "tím nhạt": {
    en: "light purple",
    fr: "violet clair",
    it: "viola chiaro",
    nl: "lichtpaars",
    sv: "ljuslila",
    pt: "roxo claro",
    es: "morado claro",
    de: "helllila",
  },
  "hồng gradient": {
    en: "pink gradient",
    fr: "dégradé rose",
    it: "gradiente rosa",
    nl: "roze gradient",
    sv: "rosa gradient",
    pt: "gradiente rosa",
    es: "degradado rosa",
    de: "rosa verlauf",
  },
  "không dây": {
    en: "wireless",
    fr: "sans fil",
    it: "wireless",
    nl: "draadloos",
    sv: "trådlös",
    pt: "sem fios",
    es: "inalámbrico",
    de: "kabellos",
  },
  "gaming không dây dareu": {
    en: "wireless gaming dareu",
    fr: "gaming sans fil dareu",
    it: "gaming wireless dareu",
    nl: "gaming draadloos dareu",
    sv: "gaming trådlös dareu",
    pt: "gaming sem fios dareu",
    es: "gaming inalámbrico dareu",
    de: "gaming kabellos dareu",
  },
  "không dây dareu": {
    en: "wireless dareu",
    fr: "dareu sans fil",
    it: "dareu wireless",
    nl: "dareu draadloos",
    sv: "dareu trådlös",
    pt: "dareu sem fios",
    es: "dareu inalámbrico",
    de: "dareu kabellos",
  },
  "edifier không dây": {
    en: "edifier wireless",
    fr: "edifier sans fil",
    it: "edifier wireless",
    nl: "edifier draadloos",
    sv: "edifier trådlös",
    pt: "edifier sem fios",
    es: "edifier inalámbrico",
    de: "edifier kabellos",
  },
};

// apply to name+description+tech across all records
const translate = (lang, text) => {
  let out = text;
  for (const [vn, words] of Object.entries(MAP)) {
    if (words[lang]) out = out.replace(new RegExp(vn, "gi"), words[lang]);
  }
  return out;
};

let fixed = 0;
for (const rec of d.records) {
  const lang = rec.targetLang;
  const fields = ["name", "description", "technicalDescription"];
  let changed = false;
  for (const f of fields) {
    const before = rec.translations[f] || "";
    const after = translate(lang, before);
    if (after !== before) { rec.translations[f] = after; changed = true; }
    if (hand[rec.productId] && hand[rec.productId][lang]) {
      const hb = hand[rec.productId][lang][f] || "";
      const ha = translate(lang, hb);
      if (ha !== hb) { hand[rec.productId][lang][f] = ha; changed = true; }
    }
  }
  // specs + imageAlts
  for (const [k, v] of Object.entries(rec.translations.specs || {})) {
    const a = translate(lang, v);
    if (a !== v) { rec.translations.specs[k] = a; changed = true; }
    if (hand[rec.productId] && hand[rec.productId][lang] && hand[rec.productId][lang].specs) {
      const hs = hand[rec.productId][lang].specs[k];
      if (hs !== undefined && hs !== a) { hand[rec.productId][lang].specs[k] = a; changed = true; }
    }
  }
  if (changed) fixed++;
}
console.log("records fixed:", fixed);
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
