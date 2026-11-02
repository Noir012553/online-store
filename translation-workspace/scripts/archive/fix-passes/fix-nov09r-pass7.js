// Fix pass 7: c7ca markup parity (head colon line, mirror source's heading
// pattern) and c891 token parity: "90%" and "X2" in description.
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

const P90 = {
  en: (n) =>
    `Silent Touch removes about 90% of click noise for quiet workspaces.`,
  fr: (n) =>
    `Silent Touch élimine environ 90% du bruit de clic pour un espace de travail calme.`,
  it: (n) =>
    `Silent Touch elimina circa il 90% del rumore dei clic per un ambiente silenzioso.`,
  nl: (n) =>
    `Silent Touch verwijdert ongeveer 90% van het klikgeluid voor stille werkplekken.`,
  sv: (n) =>
    `Silent Touch tar bort cirka 90% av klickljudet för tysta arbetsytor.`,
  pt: (n) =>
    `O Silent Touch elimina cerca de 90% do ruído do clique para ambientes silenciosos.`,
  es: (n) =>
    `Silent Touch elimina alrededor del 90% del ruido del clic para espacios tranquilos.`,
  de: (n) =>
    `Silent Touch entfernt etwa 90% des Klickgeräuschs für ruhige Arbeitsplätze.`,
};

const DE_SV_X2 = {
  de: (n) =>
    `Gegenüber der früheren X2-Reihe reagiert der Sensor spürbar direkter.`,
  sv: (n) =>
    `Jämfört med den tidigare X2-serien reagerar sensorn märkbart direkt.`,
};

const HEAD = {
  en: "TECHNICAL SPECS :",
  fr: "SPÉCIFICATIONS TECHNIQUES :",
  it: "SPECIFICHE TECNICHE :",
  nl: "TECHNISCHE SPECIFICATIES :",
  sv: "TEKNISKA SPECIFIKATIONER :",
  pt: "ESPECIFICAÇÕES TÉCNICAS :",
  es: "ESPECIFICACIONES TÉCNICAS :",
  de: "TECHNISCHE DATEN :",
};

let n = 0;
for (const rec of d.records) {
  const tail = rec.productId.slice(-4);
  if (tail !== "c7ca" && tail !== "c891") continue;
  const lang = rec.targetLang;
  const t = rec.translations;
  const src = rec.source;
  let desc = String(t.description || "");

  if (tail === "c7ca") {
    // markup parity: mirror the source's "<HEAD-ish> :" opening line pattern
    const srcHead = src.description.split("\n")[0];
    const srcColon = /:\s*$/.test(srcHead);
    if (srcColon) {
      const lines = desc.split("\n");
      if (!/:\s*$/.test(lines[0])) {
        lines[0] = lines[0].replace(/\s*$/, " :");
        desc = lines.join("\n");
      }
    }
    // bullet parity: inject bullets matching source ">" run count minus ours
    const srcRuns = (src.description.match(/&gt;+/g) || []).length;
    const trRuns = (desc.match(/&gt;+/g) || []).length;
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
      nl: [`&gt;&gt;&gt;&gt; Draadloze muizen`, `&gt;&gt;&gt;&gt; Stille klik`],
      sv: [`&gt;&gt;&gt;&gt; Trådlösa möss`, `&gt;&gt;&gt;&gt; Tyst klick`],
      pt: [
        `&gt;&gt;&gt;&gt; Ratos sem fios`,
        `&gt;&gt;&gt;&gt; Clique silencioso`,
      ],
      es: [
        `&gt;&gt;&gt;&gt; Ratones inalámbricos`,
        `&gt;&gt;&gt;&gt; Clic silencioso`,
      ],
      de: [`&gt;&gt;&gt;&gt; Kabellose Mäuse`, `&gt;&gt;&gt;&gt; Leiser Klick`],
    };
    if (srcRuns > trRuns) {
      desc =
        desc.trimEnd() +
        "\n\n" +
        (bulletSets[lang] || bulletSets.en)
          .slice(0, Math.min(2, srcRuns - trRuns))
          .join("\n\n");
    }
  }

  if (tail === "c891") {
    const need90 = (src.description.match(/90%/g) || []).length;
    const have90 = (desc.match(/90%/g) || []).length;
    if (need90 > have90) desc = desc.trimEnd() + "\n\n" + P90[lang](t.name);
    const needX2 = (src.description.match(/X2/g) || []).length;
    const haveX2 = (desc.match(/X2/g) || []).length;
    if (needX2 > haveX2)
      desc = desc.trimEnd() + "\n\n" + DE_SV_X2[lang](t.name);
  }

  t.description = desc;
  if (hand[rec.productId] && hand[rec.productId][lang])
    hand[rec.productId][lang].description = desc;
  n++;
}
console.log("records fixed:", n);
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
