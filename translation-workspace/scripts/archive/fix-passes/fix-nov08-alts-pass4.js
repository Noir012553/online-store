// Fix pass 6 — residual VN in alts: specific phrases + "con" preposition
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov08.json",
);
const HAND = path.join(
  WS,
  "data",
  "translations",
  "translations-nov08-hand.json",
);
const d = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));

const TOKENS = [
  [/con RTX/gi, { nl: "met RTX", sv: "med RTX", pt: "com RTX", it: "con RTX" }],
  [/con RAM/gi, { nl: "met RAM", sv: "med RAM", pt: "com RAM" }],
  [/con pantalla/gi, { nl: "met scherm", sv: "med skärm", pt: "com ecrã" }],
  [
    /con diseño simetría cómoda y versátil/gi,
    { en: "with symmetrical comfortable and versatile design" },
  ],
  [
    /con batería/gi,
    { nl: "met batterij", sv: "med batteri", pt: "com bateria" },
  ],
  [/con SSD/gi, { nl: "met SSD", sv: "med SSD", pt: "com SSD" }],
  [/con/gi, { nl: "met", sv: "med", pt: "com" }],
  [
    /portátil GPU/gi,
    {
      en: "laptop GPU",
      fr: "GPU laptop",
      it: "GPU laptop",
      nl: "laptop GPU",
      sv: "laptop GPU",
      pt: "GPU laptop",
      es: "GPU portátil",
      de: "Laptop-GPU",
    },
  ],
  [
    /horas de uso cuando conexión inalámbrico/gi,
    { en: "hours of use with wireless connection" },
  ],
  [/nhạy/gi, { nl: "sensitief", es: "sensible" }],
  [/cho thời lượng/gi, { nl: "voor batterijduur" }],
  [/batterij lên đến/gi, { nl: "batterij tot" }],
  [/giờ/gi, { nl: "uur", es: "horas" }],
  [
    /tăng tốc độ phản hồi/gi,
    { en: "for faster response", sv: "för snabbare respons" },
  ],
];

let n = 0;
for (const rec of d.records) {
  const lang = rec.targetLang;
  const images = rec.translations.descriptionImages || [];
  let changed = false;
  for (const im of images) {
    if (!im.alt) continue;
    let out = im.alt;
    for (const [re, words] of TOKENS) {
      if (words[lang]) out = out.replace(re, words[lang]);
    }
    if (out !== im.alt) {
      im.alt = out;
      changed = true;
    }
  }
  if (changed) {
    n++;
    const h = hand[rec.productId] && hand[rec.productId][lang];
    if (h) h.imageAlts = images.map((im) => im.alt);
  }
}
console.log("records fixed:", n);
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
