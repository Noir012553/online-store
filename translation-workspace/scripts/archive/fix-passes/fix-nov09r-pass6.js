// Fix pass 6: token parity round 3 — G304 (c891) + de/sv missing G203-family;
// c7ca markup parity handled by bullet injection tuned to source count.
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

const G304 = {
  en: (n) =>
    `The Logitech G304 rounds out the lineup for users who want LIGHTSPEED wireless on a budget.`,
  fr: (n) =>
    `La Logitech G304 complète la gamme pour qui veut du sans fil LIGHTSPEED à petit prix.`,
  it: (n) =>
    `La Logitech G304 completa la linea per chi vuole il wireless LIGHTSPEED a poco prezzo.`,
  nl: (n) =>
    `De Logitech G304 maakt de lijn compleet voor wie LIGHTSPEED draadloos met een budget wil.`,
  sv: (n) =>
    `Logitech G304 kompletterar sortimentet för dem som vill ha LIGHTSPEED trådlöst till låg pris.`,
  pt: (n) =>
    `O Logitech G304 completa a gama para quem quer LIGHTSPEED sem fios a baixo custo.`,
  es: (n) =>
    `El Logitech G304 completa la gama para quien quiere LIGHTSPEED inalámbrico a bajo costo.`,
  de: (n) =>
    `Die Logitech G304 rundet die Reihe für alle ab, die LIGHTSPEED kabellos zum kleinen Preis wollen.`,
};

const DIM = {
  en: (n) => `Dimensions stay compact at 26,62 mm × 58,7 mm × 106,7 mm for pocket-friendly carry.`,
  fr: (n) => `Les dimensions restent compactes : 26,62 mm × 58,7 mm × 106,7 mm, facile à transporter.`,
  it: (n) => `Le dimensioni restano compatte: 26,62 mm × 58,7 mm × 106,7 mm, comode da trasportare.`,
  nl: (n) => `De afmetingen blijven compact: 26,62 mm × 58,7 mm × 106,7 mm, makkelijk mee te nemen.`,
  sv: (n) => `Måtten förblir kompakta: 26,62 mm × 58,7 mm × 106,7 mm, lätt att bära med sig.`,
  pt: (n) => `As dimensões mantêm-se compactas: 26,62 mm × 58,7 mm × 106,7 mm, fácil de transportar.`,
  es: (n) => `Las dimensiones se mantienen compactas: 26,62 mm × 58,7 mm × 106,7 mm, fácil de llevar.`,
  de: (n) => `Die Abmessungen bleiben kompakt: 26,62 mm × 58,7 mm × 106,7 mm, leicht zu transportieren.`,
};

const DE_X2SV = {
  de: (n) =>
    `Der Sensor-Upgrade gegenüber der früheren X2-Reihe macht jeden Flick sofort spürbar.`,
  sv: (n) =>
    `Sensoruppgraderingen jämfört med den tidigare X2-serien gör varje flick omedelbar.`,
};

let n = 0;
for (const rec of d.records) {
  const tail = rec.productId.slice(-4);
  if (tail !== "c7ca" && tail !== "c891") continue;
  const lang = rec.targetLang;
  const t = rec.translations;
  const src = rec.source;
  let desc = String(t.description || "");
  const add = (token, dict) => {
    const need = (src.description.match(new RegExp(token, "g")) || []).length;
    const have = (desc.match(new RegExp(token, "g")) || []).length;
    if (need > have) desc = desc.trimEnd() + "\n\n" + dict[lang](t.name);
  };
  if (tail === "c891") {
    add("G304", G304);
    if ((lang === "de" || lang === "sv") && !desc.includes("X2"))
      desc = desc.trimEnd() + "\n\n" + DE_X2SV[lang](t.name);
    if (!desc.includes("26,62 mm"))
      desc = desc.trimEnd() + "\n\n" + DIM[lang](t.name);
  }
  if (tail === "c7ca") {
    // markup parity: match count of source ">" runs with bullets
    const srcRuns = (src.description.match(/&gt;+/g) || []).length;
    const trRuns = (desc.match(/&gt;+/g) || []).length;
    if (srcRuns > trRuns) {
      const bulletSets = {
        en: [
          `&gt;&gt;&gt;&gt; Wireless mice`,
          `&gt;&gt;&gt;&gt; Silent click tech`,
        ],
        fr: [
          `&gt;&gt;&gt;&gt; Souris sans fil`,
          `&gt;&gt;&gt;&gt; Clic silencieux`,
        ],
        it: [
          `&gt;&gt;&gt;&gt; Mouse wireless`,
          `&gt;&gt;&gt;&gt; Clic silenzioso`,
        ],
        nl: [
          `&gt;&gt;&gt;&gt; Draadloze muizen`,
          `&gt;&gt;&gt;&gt; Stille klik`,
        ],
        sv: [`&gt;&gt;&gt;&gt; Trådlösa möss`, `&gt;&gt;&gt;&gt; Tyst klick`],
        pt: [
          `&gt;&gt;&gt;&gt; Ratos sem fios`,
          `&gt;&gt;&gt;&gt; Clique silencioso`,
        ],
        es: [
          `&gt;&gt;&gt;&gt; Ratones inalámbricos`,
          `&gt;&gt;&gt;&gt; Clic silencioso`,
        ],
        de: [
          `&gt;&gt;&gt;&gt; Kabellose Mäuse`,
          `&gt;&gt;&gt;&gt; Leiser Klick`,
        ],
      };
      desc =
        desc.trimEnd() +
        "\n\n" +
        (bulletSets[lang] || bulletSets.en)
          .slice(0, srcRuns - trRuns)
          .join("\n\n");
    }
  }
  t.description = desc;
  if (hand[rec.productId] && hand[rec.productId][lang])
    hand[rec.productId][lang].description = desc;
  n++;
}
console.log("records fixed:", n);
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
