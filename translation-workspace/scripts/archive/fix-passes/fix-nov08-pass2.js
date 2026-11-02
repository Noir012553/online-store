// Fix pass 2 — remaining 13 leaks from preflight.
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

const MAP = {
  "độ phân giải": {
    en: "resolution",
    fr: "résolution",
    it: "risoluzione",
    nl: "resolutie",
    sv: "upplösning",
    pt: "resolução",
    es: "resolución",
    de: "Auflösung",
  },
  "để cpu": {
    en: "CPU",
    fr: "CPU",
    it: "CPU",
    nl: "CPU",
    sv: "CPU",
    pt: "CPU",
    es: "CPU",
    de: "CPU",
  },
  "rtx đủ": {
    en: "RTX",
    fr: "RTX",
    it: "RTX",
    nl: "RTX",
    sv: "RTX",
    pt: "RTX",
    es: "RTX",
    de: "RTX",
  },
  "switch sử": {
    en: "switch with",
    fr: "switch avec",
    it: "switch con",
    nl: "switch met",
    sv: "switch med",
    pt: "switch com",
    es: "switch con",
    de: "switch mit",
  },
  "xanh lá": {
    en: "green",
    fr: "vert",
    it: "verde",
    nl: "groen",
    sv: "grön",
    pt: "verde",
    es: "verde",
    de: "grün",
  },
  "là ram": {
    en: "RAM",
    fr: "RAM",
    it: "RAM",
    nl: "RAM",
    sv: "RAM",
    pt: "RAM",
    es: "RAM",
    de: "RAM",
  },
};
const entries = Object.entries(MAP).sort((a, b) => b[0].length - a[0].length);

let n = 0;
for (const rec of d.records) {
  const lang = rec.targetLang;
  const apply = (t) => {
    let out = t;
    for (const [vn, w] of entries)
      if (w[lang]) out = out.replace(new RegExp(vn, "gi"), w[lang]);
    return out;
  };
  const t = rec.translations;
  let changed = false;
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
  if (hand[rec.productId]?.[lang]) {
    const h = hand[rec.productId][lang];
    for (const f of ["name", "description", "technicalDescription"]) {
      if (h[f]) h[f] = apply(h[f]);
    }
    if (h.specs)
      for (const k of Object.keys(h.specs)) h.specs[k] = apply(h.specs[k]);
  }
  if (changed) n++;
}
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
console.log("fixed:", n);
