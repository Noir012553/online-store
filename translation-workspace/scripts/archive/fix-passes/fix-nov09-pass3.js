// Fix nov09 pass 3 — remaining leaks:
//  1. "việt nam" → per-lang name of country (c63a, c63b)
//  2. "độ phân giải" → resolution (c6c8, c88c, c891, c89c)
//  3. ROG brand missing in name+desc (c6ca) — inject ROG into name/desc
//  4. c6ca/nl leak "wireless aimpoint white vẫn" — rewrite that phrase
//  5. c8c3 "night over the rhône" — proper painting name per lang
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

const VIETNAM = {
  en: "Vietnam",
  fr: "Vietnam",
  it: "Vietnam",
  nl: "Vietnam",
  sv: "Vietnam",
  pt: "Vietname",
  es: "Vietnam",
  de: "Vietnam",
};
const RESOLUTION = {
  en: "resolution",
  fr: "résolution",
  it: "risoluzione",
  nl: "resolutie",
  sv: "upplösning",
  pt: "resolução",
  es: "resolución",
  de: "Auflösung",
};
const RHONE = {
  en: "Starry Night Over the Rhône",
  fr: "La nuit étoilée sur le Rhône",
  it: "Notte stellata sul Rodano",
  nl: "Sterrennacht over de Rhône",
  sv: "Stjärnklar natt över Rhône",
  pt: "Noite Estrelada sobre o Ródano",
  es: "Noche estrellada sobre el Ródano",
  de: "Sternennacht über der Rhône",
};

let fixed = 0;
for (const rec of d.records) {
  const lang = rec.targetLang;
  const t = rec.translations;
  let changed = false;
  const apply = (text) => {
    let out = text;
    out = out.replace(/việt nam/gi, VIETNAM[lang] || "Vietnam");
    out = out.replace(/độ phân giải/gi, RESOLUTION[lang] || "resolution");
    out = out.replace(/night over the rhône/gi, RHONE[lang] || RHONE.en);
    // c6ca/nl specific: 'vẫn' leftover after aimpoint phrase
    if (rec.productId.endsWith("c6ca") && lang === "nl") {
      out = out.replace(
        /wireless aimpoint white vẫn/gi,
        "wireless aimpoint white",
      );
      out = out.replace(/\bvẫn\b/gi, "nog steeds");
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
  (t.descriptionImages || []).forEach((im) => {
    if (im.alt) {
      const a = apply(im.alt);
      if (a !== im.alt) {
        im.alt = a;
        changed = true;
      }
    }
  });

  // c6ca: ROG brand missing — the product IS an ASUS ROG product; inject ROG
  if (rec.productId.endsWith("c6ca") && t.brand === "ASUS") {
    if (t.name && !/\bROG\b/.test(t.name)) {
      // ROG appears in product model? check source name - inject before ASUS
      t.name = t.name.replace(/\bASUS\b/, "ASUS ROG");
      changed = true;
    }
    if (t.description && !/\bROG\b/.test(t.description)) {
      t.description = t.description.replace(/\bASUS\b/, "ASUS ROG");
      changed = true;
    }
  }

  if (changed) {
    fixed++;
    const h = hand[rec.productId] && hand[rec.productId][lang];
    if (h) {
      for (const f of ["name", "description", "technicalDescription"])
        h[f] = t[f];
      h.specs = t.specs;
      h.imageAlts = (t.descriptionImages || []).map((im) => im.alt);
      h.brand = t.brand;
    }
  }
}
console.log("records fixed:", fixed);
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
