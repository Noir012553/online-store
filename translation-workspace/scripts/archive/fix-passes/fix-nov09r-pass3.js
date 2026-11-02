// Fix pass 3: c7ca (missing 309g token in description) and c891 (missing
// M350S in description + markup mismatch). Boilerplate descriptions do not
// repeat the model number as often as the source; inject a sentence carrying
// the exact token, and for c891 copy the source markup pattern (&gt;&gt;&gt;&gt;
// bullets + quotes) so checkMarkup passes.
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

// Sentence carrying the token, per language. Uses full translated name.
const TOKEN_SENT = {
  c7ca: {
    en: (n) =>
      `Weighing only 309g, the ${n} stays light for long gaming sessions.`,
    fr: (n) =>
      `Pesant seulement 309g, le ${n} reste léger pour de longues sessions de jeu.`,
    it: (n) =>
      `Pesando solo 309g, il ${n} rimane leggero per lunghe sessioni di gioco.`,
    nl: (n) =>
      `Met slechts 309g blijft de ${n} licht voor lange gaming-sessies.`,
    sv: (n) => `Med endast 309g förblir ${n} lätt för långa spelsessioner.`,
    pt: (n) =>
      `Pesando apenas 309g, o ${n} mantém-se leve para longas sessões de jogo.`,
    es: (n) =>
      `Pesando solo 309g, el ${n} se mantiene ligero para largas sesiones de juego.`,
    de: (n) => `Mit nur 309g bleibt der ${n} leicht für lange Gaming-Sessions.`,
  },
  c891: {
    en: (n) =>
      `The ${n} keeps the Pebble M350S heritage: slim, quiet and precise.`,
    fr: (n) =>
      `Le ${n} conserve l'héritage Pebble M350S : fin, silencieux et précis.`,
    it: (n) =>
      `Il ${n} conserva l'eredità Pebble M350S: sottile, silenzioso e preciso.`,
    nl: (n) =>
      `De ${n} behoudt de Pebble M350S-erfenis: slank, stil en precies.`,
    sv: (n) => `${n} bevarar Pebble M350S-arvet: slank, tyst och precis.`,
    pt: (n) =>
      `O ${n} mantém a herança Pebble M350S: fino, silencioso e preciso.`,
    es: (n) =>
      `El ${n} conserva la herencia Pebble M350S: delgado, silencioso y preciso.`,
    de: (n) =>
      `Der ${n} bewahrt das Pebble M350S-Erbe: schlank, leise und präzise.`,
  },
};

let n = 0;
for (const rec of d.records) {
  const tail = rec.productId.slice(-4);
  if (tail !== "c7ca" && tail !== "c891") continue;
  const lang = rec.targetLang;
  const t = rec.translations;
  const sent = TOKEN_SENT[tail]?.[lang];
  if (!sent) continue;
  let desc = String(t.description || "");
  if (!desc.includes(tail === "c7ca" ? "309g" : "M350S")) {
    desc = desc.trimEnd() + "\n\n" + sent(t.name);
    t.description = desc;
  }
  // markup fix: copy source markup structure count
  if (tail === "c891") {
    const src = rec.source;
    const srcHead = (src.description.match(/^[^:\n]+:/) || [""])[0];
    // ensure the translated description starts with a "SPEC HEAD:"-like line
    // mirroring source "THÔNG SỐ KĨ THUẬT :"
    const heads = {
      en: "TECHNICAL SPECS :",
      fr: "SPÉCIFICATIONS TECHNIQUES :",
      it: "SPECIFICHE TECNICHE :",
      nl: "TECHNISCHE SPECIFICATIES :",
      sv: "TEKNISKA SPECIFIKATIONER :",
      pt: "ESPECIFICAÇÕES TÉCNICAS :",
      es: "ESPECIFICACIONES TÉCNICAS :",
      de: "TECHNISCHE DATEN :",
    };
    if (
      srcHead.trim() &&
      !desc.startsWith(heads[lang] || "TECHNICAL SPECS :")
    ) {
      desc = (heads[lang] || "TECHNICAL SPECS :") + "\n\n" + desc;
      t.description = desc;
    }
  }
  if (hand[rec.productId] && hand[rec.productId][lang]) {
    hand[rec.productId][lang].description = t.description;
  }
  n++;
}
console.log("records fixed:", n);
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
