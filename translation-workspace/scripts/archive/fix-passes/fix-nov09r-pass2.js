// Fix pass 2: c891 tech JSON labels ("kết nối", "độ phân giải") and c7ca
// "tương thích" leaks, per-language.
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov09.json",
);
const HAND = path.join(
  WS,
  "data",
  "translations",
  "translations-nov09-hand.json",
);
const d = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));

const MAP = {
  "kết nối": {
    en: "connection",
    fr: "connexion",
    it: "connessione",
    nl: "verbinding",
    sv: "anslutning",
    pt: "ligação",
    es: "conexión",
    de: "verbindung",
  },
  "độ phân giải": {
    en: "resolution",
    fr: "résolution",
    it: "risoluzione",
    nl: "resolutie",
    sv: "upplösning",
    pt: "resolução",
    es: "resolución",
    de: "auflösung",
  },
  "tương thích": {
    en: "compatible",
    fr: "compatible",
    it: "compatibile",
    nl: "compatibel",
    sv: "kompatibel",
    pt: "compatível",
    es: "compatible",
    de: "kompatibel",
  },
  "loại pin": {
    en: "battery type",
    fr: "type de pile",
    it: "tipo di batteria",
    nl: "batterijtype",
    sv: "batterityp",
    pt: "tipo de bateria",
    es: "tipo de batería",
    de: "batterietyp",
  },
};

const TAILS = ["c891", "c7ca", "c88c"];
let n = 0;
for (const rec of d.records) {
  if (!TAILS.includes(rec.productId.slice(-4))) continue;
  const lang = rec.targetLang;
  const t = rec.translations;
  let changed = false;
  const apply = (text) => {
    let out = String(text);
    for (const [vn, words] of Object.entries(MAP)) {
      if (words[lang]) out = out.replace(new RegExp(vn, "gi"), words[lang]);
    }
    return out;
  };
  for (const f of ["name", "description", "technicalDescription"]) {
    if (t[f]) {
      const a = apply(t[f]);
      if (a !== t[f]) {
        t[f] = a;
        changed = true;
      }
    }
  }
  for (const k of Object.keys(t.specs || {})) {
    const a = apply(t.specs[k]);
    if (a !== t.specs[k]) {
      t.specs[k] = a;
      changed = true;
    }
  }
  if (hand[rec.productId] && hand[rec.productId][lang]) {
    const h = hand[rec.productId][lang];
    for (const f of ["name", "description", "technicalDescription"]) {
      if (h[f]) h[f] = apply(h[f]);
    }
    for (const k of Object.keys(h.specs || {})) h.specs[k] = apply(h.specs[k]);
  }
  if (changed) n++;
}
console.log("records fixed:", n);
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");

