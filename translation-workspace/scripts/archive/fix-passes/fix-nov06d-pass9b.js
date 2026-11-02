// Fix pass 9b:
//  1. c6c7 de/sv: my injected sentence text has typo "Asus Rog" — restore
//     exact "Asus ROG Gladius III Wireless Aimpoint" casing.
//  2. Color leaks: descriptions contain VN color words ("xanh dương trắng tím",
//     "tím đậm", "xám be", "xám be xanh ngọc") because color values copied
//     verbatim from source — translate colors per language.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const HAND = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06d-hand.json",
);
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));
const idByTail = {};
for (const pid of Object.keys(hand)) idByTail[pid.slice(-4)] = pid;

// 1. casing fixes
{
  const de = hand[idByTail["c6c7"]].de;
  de.description = de.description
    .replace(/Asus Rog Gladius/g, "Asus ROG Gladius")
    .replace(/Maus Asus ROG/g, "Maus ASUS ROG");
  const sv = hand[idByTail["c6c7"]].sv;
  sv.description = sv.description
    .replace(/Asus Rog Gladius/g, "Asus ROG Gladius")
    .replace(/Mus Asus ROG/g, "Mus ASUS ROG");
}
// 2. color translations (case-preserving, longest first)
const COLOR_MAP = [
  [
    /xanh dương trắng tím/gi,
    {
      en: "blue white purple",
      pt: "azul branco roxo",
      fr: "bleu blanc violet",
      de: "blau weiß lila",
      it: "blu bianco viola",
      es: "azul blanco morado",
      nl: "blauw wit paars",
      sv: "blå vit lila",
    },
  ],
  [
    /tím đậm/gi,
    {
      en: "deep purple",
      pt: "roxo profundo",
      fr: "violet foncé",
      de: "dunkelviolett",
      it: "viola scuro",
      es: "morado oscuro",
      nl: "donkerpaars",
      sv: "mörklila",
    },
  ],
  [
    /xám be xanh ngọc/gi,
    {
      en: "gray beige teal",
      pt: "cinza bege turquesa",
      fr: "gris beige sarcelle",
      de: "grau beige türkis",
      it: "grigio beige turchese",
      es: "gris beige turquesa",
      nl: "grijs beige groenblauw",
      sv: "grå beige turkos",
    },
  ],
  [
    /xám be/gi,
    {
      en: "gray beige",
      pt: "cinza bege",
      fr: "gris beige",
      de: "grau beige",
      it: "grigio beige",
      es: "gris beige",
      nl: "grijs beige",
      sv: "grå beige",
    },
  ],
];
for (const [pid, langs] of Object.entries(hand)) {
  for (const [lang, t] of Object.entries(langs)) {
    let desc = t.description || "";
    for (const [re, words] of COLOR_MAP)
      desc = desc.replace(re, words[lang] || "");
    t.description = desc;
    let name = t.name || "";
    for (const [re, words] of COLOR_MAP)
      name = name.replace(re, words[lang] || "");
    t.name = name;
    t.imageAlts = (t.imageAlts || []).map((a) => {
      let out = a || "";
      for (const [re, words] of COLOR_MAP)
        out = out.replace(re, words[lang] || "");
      return out;
    });
    if (t.specs && t.specs["mau_sac"]) {
      let mv = t.specs["mau_sac"];
      for (const [re, words] of COLOR_MAP)
        mv = mv.replace(re, words[lang] || "");
      t.specs["mau_sac"] = mv;
    }
  }
}
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
console.log("pass9b done");
