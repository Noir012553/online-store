const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov06f.json",
);
const HAND = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06f-hand.json",
);
const d = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));

const VAL_TR = {
  "108 phím": {
    fr: "108 touches",
    pt: "108 teclas",
    sv: "108 tangenter",
    en: "108 keys",
  },
  Nhựa: {
    fr: "Plastique",
    pt: "Plástico",
    sv: "Plast",
    en: "Plastic",
    nl: "Kunststof",
    it: "Plastica",
    es: "Plástico",
    de: "Kunststoff",
  },
  Trắng: {
    en: "White",
    fr: "Blanc",
    it: "Bianco",
    nl: "Wit",
    sv: "Vit",
    pt: "Branco",
    es: "Blanco",
    de: "Weiß",
  },
  Đen: {
    en: "Black",
    fr: "Noir",
    it: "Nero",
    nl: "Zwart",
    sv: "Svart",
    pt: "Preto",
    es: "Negro",
    de: "Schwarz",
  },
  "Đa verbinding": {
    nl: "Draadloze verbinding",
    en: "Wireless connection",
    fr: "Connexion sans fil",
    it: "Connessione wireless",
    es: "Conexión inalámbrica",
    pt: "Ligação sem fios",
    sv: "Trådlös anslutning",
    de: "Drahtlose Verbindung",
  },
};

let fixed = 0;
for (const rec of d.records) {
  const t = rec.translations;
  const lang = rec.targetLang;
  let changed = false;

  // c645: fix tech values
  if (rec.productId.endsWith("c645") && t.technicalDescription) {
    let tech = t.technicalDescription;
    tech = tech.replace(
      /"108 phím"/g,
      `"${VAL_TR["108 phím"][lang] || "108 keys"}"`,
    );
    tech = tech.replace(/"Nhựa"/g, `"${VAL_TR["Nhựa"][lang] || "Plastic"}"`);
    if (tech !== t.technicalDescription) {
      t.technicalDescription = tech;
      changed = true;
    }
    if (hand[rec.productId] && hand[rec.productId][lang])
      hand[rec.productId][lang].technicalDescription = tech;
  }

  // c7ca: fix tech values
  if (rec.productId.endsWith("c7ca") && t.technicalDescription) {
    let tech = t.technicalDescription;
    tech = tech.replace(
      /"Không"/g,
      `"${(VAL_TR["Đen"] && VAL_TR["Đen"][lang] && "No") || "No"}"`,
    );
    tech = tech.replace(/"Đen"/g, `"${VAL_TR["Đen"][lang] || "Black"}"`);
    if (tech !== t.technicalDescription) {
      t.technicalDescription = tech;
      changed = true;
    }
    if (hand[rec.productId] && hand[rec.productId][lang])
      hand[rec.productId][lang].technicalDescription = tech;
  }

  // c88c/nl: fix tech values
  if (rec.productId.endsWith("c88c") && t.technicalDescription) {
    let tech = t.technicalDescription;
    tech = tech.replace(/"Trắng"/g, `"White"`);
    tech = tech.replace(/"Đa verbinding"/g, `"Draadloze verbinding"`);
    tech = tech.replace(/"sensor HERO 2"/g, `"HERO 2 sensor"`);
    if (tech !== t.technicalDescription) {
      t.technicalDescription = tech;
      changed = true;
    }
    if (hand[rec.productId] && hand[rec.productId][lang])
      hand[rec.productId][lang].technicalDescription = tech;
  }

  // c6a2: ensure "ASUS" (uppercase) in desc
  if (
    rec.productId.endsWith("c6a2") &&
    t.description &&
    !t.description.includes("ASUS")
  ) {
    // replace "Asus ROG" with "ASUS ROG" in desc
    const newDesc = t.description.replace(/Asus ROG/g, "ASUS ROG");
    if (newDesc !== t.description) {
      t.description = newDesc;
      changed = true;
    }
    // also fix name
    if (t.name && t.name.includes("Asus")) {
      t.name = t.name.replace(/Asus/g, "ASUS");
      changed = true;
    }
    if (hand[rec.productId] && hand[rec.productId][lang]) {
      hand[rec.productId][lang].description = t.description;
      hand[rec.productId][lang].name = t.name;
    }
  }

  if (changed) fixed++;
}
console.log("fixed:", fixed, "records");
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
