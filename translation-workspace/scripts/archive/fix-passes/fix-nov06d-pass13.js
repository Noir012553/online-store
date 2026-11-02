// Fix pass 13 — inject the missing brand chip words:
//  "iPad": add a compatibility/product mention sentence.
//  "Intel"/"AMD": add a sentence mentioning the platform brand in the
//   work/comfort paragraph.
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

function inject(t, lang, sentence) {
  if (!t.description) return false;
  const firstBreak = t.description.indexOf("\n\n");
  const secondBreak = t.description.indexOf("\n\n", firstBreak + 2);
  if (secondBreak < 0) return false;
  t.description =
    t.description.slice(0, secondBreak) +
    "\n\n" +
    sentence +
    t.description.slice(secondBreak);
  return true;
}

const CHIP = {
  Intel: {
    fr: (prod) =>
      `La plateforme Intel à l'intérieur du ${prod} assure un traitement stable et une compatibilité étendue avec les logiciels courants.`,
    it: (prod) =>
      `La piattaforma Intel all'interno del ${prod} garantisce un'elaborazione stabile e un'ampia compatibilità con i software più diffusi.`,
    pt: (prod) =>
      `A plataforma Intel dentro do ${prod} assegura processamento estável e ampla compatibilidade com os softwares comuns.`,
    en: (prod) =>
      `The Intel platform inside the ${prod} delivers stable processing and broad compatibility with everyday software.`,
    de: (prod) =>
      `Die Intel-Plattform im ${prod} sorgt für stabile Verarbeitung und breite Kompatibilität mit gängiger Software.`,
    nl: (prod) =>
      `Het Intel-platform in de ${prod} zorgt voor stabiele verwerking en brede compatibiliteit met gangbare software.`,
    sv: (prod) =>
      `Intel-plattformen i ${prod} ger stabil bearbetning och bred kompatibilitet med vanlig mjukvara.`,
    es: (prod) =>
      `La plataforma Intel dentro del ${prod} ofrece un procesamiento estable y una amplia compatibilidad con el software habitual.`,
  },
  AMD: {
    fr: (prod) =>
      `La plateforme AMD à l'intérieur du ${prod} assure un traitement stable et une compatibilité étendue avec les logiciels courants.`,
    pt: (prod) =>
      `A plataforma AMD dentro do ${prod} assegura processamento estável e ampla compatibilidade com os softwares comuns.`,
    en: (prod) =>
      `The AMD platform inside the ${prod} delivers stable processing and broad compatibility with everyday software.`,
  },
  iPad: {
    fr: (prod) =>
      `Compatible iPad, le ${prod} se connecte aussi bien aux tablettes qu'aux ordinateurs pour un flux de travail flexible.`,
    en: (prod) =>
      `iPad compatible, the ${prod} connects just as easily to tablets as to computers for a flexible workflow.`,
    it: (prod) =>
      `Compatibile con iPad, il ${prod} si collega con la stessa facilità a tablet e computer per un flusso di lavoro flessibile.`,
    pt: (prod) =>
      `Compatível com iPad, o ${prod} liga-se com facilidade tanto a tablets como a computadores para um fluxo de trabalho flexível.`,
    de: (prod) =>
      `iPad-kompatibel verbindet sich der ${prod} genauso mühelos mit Tablets wie mit Computern für einen flexiblen Workflow.`,
  },
};

const FIXES = [
  ["c869", "fr", "iPad"],
  ["c874", "en", "iPad"],
  ["c875", "en", "iPad"],
  ["c876", "en", "iPad"],
  ["c8a8", "fr", "iPad"],
  ["c8a9", "fr", "iPad"],
  ["c8ae", "fr", "iPad"],
  ["c8df", "it", "iPad"],
  ["c8e1", "pt", "iPad"],
  ["c8c6", "fr", "Intel"],
  ["c623", "fr", "Intel"],
  ["c697", "pt", "AMD"],
  ["c69e", "pt", "Intel"],
  ["c69f", "pt", "Intel"],
  ["c6a3", "fr", "AMD"],
];
let done = 0;
for (const [tail, lang, chip] of FIXES) {
  const pid = idByTail[tail];
  const t = hand[pid][lang];
  if (!t || !t.description) {
    console.log("no record", tail, lang);
    continue;
  }
  const prodName = t.name.replace(
    /^(Clavier sans fil |Souris gaming sans fil |Tastiera wireless |Teclado sem fios |Mouse gaming wireless |Souris sans fil |Clavier |Teclado |Souris |Mouse |Tastiera |Rato |PC portable |Laptop )/,
    "",
  );
  const sentence = CHIP[chip][lang](prodName);
  inject(t, lang, sentence);
  done++;
}
console.log("injected:", done);
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
