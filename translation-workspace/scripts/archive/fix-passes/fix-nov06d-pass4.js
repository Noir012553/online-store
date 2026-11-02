// Fix pass 4: hunt remaining VN words inside tech-JSON (only non-pt langs):
// translate typical VN tokens globally inside tech of all records.
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

const TOKEN_MAP = [
  [
    /tương thích/gi,
    {
      en: "compatible",
      it: "compatibile",
      fr: "compatible",
      de: "kompatibel",
      es: "compatible",
      nl: "compatibel",
      sv: "kompatibel",
      pt: "compatível",
    },
  ],
  [
    /loại pin/gi,
    {
      en: "battery type",
      it: "tipo di batteria",
      fr: "type de pile",
      de: "Batterietyp",
      es: "tipo de batería",
      nl: "batterijtype",
      sv: "batterityp",
      pt: "tipo de bateria",
    },
  ],
  [
    /loại/gi,
    {
      en: "type",
      it: "tipo",
      fr: "type",
      de: "Typ",
      es: "tipo",
      nl: "type",
      sv: "typ",
      pt: "tipo",
    },
  ],
  [
    /pin/gi,
    {
      en: "battery",
      it: "batteria",
      fr: "pile",
      de: "Batterie",
      es: "batería",
      nl: "batterij",
      sv: "batteri",
      pt: "bateria",
    },
  ],
  [
    /kết nối/gi,
    {
      en: "connection",
      it: "connessione",
      fr: "connexion",
      de: "Verbindung",
      es: "conexión",
      nl: "verbinding",
      sv: "anslutning",
      pt: "ligação",
    },
  ],
  [
    /tốc độ/gi,
    {
      en: "speed",
      it: "velocità",
      fr: "vitesse",
      de: "Geschwindigkeit",
      es: "velocidad",
      nl: "snelheid",
      sv: "hastighet",
      pt: "velocidade",
    },
  ],
  [
    /trắng/gi,
    {
      en: "white",
      it: "bianco",
      fr: "blanc",
      de: "weiß",
      es: "blanco",
      nl: "wit",
      sv: "vit",
      pt: "branco",
    },
  ],
  [
    /đen/gi,
    {
      en: "black",
      it: "nero",
      fr: "noir",
      de: "schwarz",
      es: "negro",
      nl: "zwart",
      sv: "svart",
      pt: "preto",
    },
  ],
  [
    /hồng/gi,
    {
      en: "pink",
      it: "rosa",
      fr: "rose",
      de: "rosa",
      es: "rosa",
      nl: "roze",
      sv: "rosa",
      pt: "rosa",
    },
  ],
  [
    /xanh/gi,
    {
      en: "blue",
      it: "blu",
      fr: "bleu",
      de: "blau",
      es: "azul",
      nl: "blauw",
      sv: "blå",
      pt: "azul",
    },
  ],
  [
    /màu/gi,
    {
      en: "color",
      it: "colore",
      fr: "couleur",
      de: "Farbe",
      es: "color",
      nl: "kleur",
      sv: "färg",
      pt: "cor",
    },
  ],
];

for (const [pid, langs] of Object.entries(hand)) {
  for (const [lang, t] of Object.entries(langs)) {
    if (lang === "vi") continue;
    let tech = t.technicalDescription || "";
    for (const [re, words] of TOKEN_MAP)
      tech = tech.replace(re, words[lang] || "");
    t.technicalDescription = tech;
    let desc = t.description || "";
    // don't apply token hunt to description aggressively for pt (VN legit words in pt?)
    for (const [re, words] of TOKEN_MAP) {
      if (lang === "pt") continue;
      desc = desc.replace(re, words[lang] || "");
    }
    t.description = desc;
  }
}
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
console.log("pass4 done");
