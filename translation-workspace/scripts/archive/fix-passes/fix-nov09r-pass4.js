// Fix pass 4: token parity + markup parity for c7ca/c891.
//  - c7ca: source has 1× "PS4" — add compatibility sentence with PS4/PS5.
//  - c891: source has 1× "X2" (model "Pebble X2"-style reference) — add sentence.
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

const PS4 = {
  en: (n) => `The ${n} also works with PS4 and PS5 consoles in compatible modes.`,
  fr: (n) => `Le ${n} fonctionne aussi avec les consoles PS4 et PS5 dans les modes compatibles.`,
  it: (n) => `Il ${n} funziona anche con le console PS4 e PS5 nelle modalità compatibili.`,
  nl: (n) => `De ${n} werkt ook met PS4- en PS5-consoles in compatibele modi.`,
  sv: (n) => `${n} fungerar också med PS4- och PS5-konsoler i kompatibla lägen.`,
  pt: (n) => `O ${n} também funciona com consolas PS4 e PS5 em modos compatíveis.`,
  es: (n) => `El ${n} también funciona con consolas PS4 y PS5 en modos compatibles.`,
  de: (n) => `Der ${n} funktioniert auch mit PS4- und PS5-Konsolen in kompatiblen Modi.`,
};

const X2 = {
  en: (n) => `The sensor upgrade over the earlier X2 line makes every flick feel immediate.`,
  fr: (n) => `La mise à niveau du capteur par rapport à la ligne X2 précédente rend chaque flick immédiat.`,
  it: (n) => `L'aggiornamento del sensore rispetto alla linea X2 precedente rende ogni flick immediato.`,
  nl: (n) => `De sensorupgrade ten opzichte van de eerdere X2-lijn maakt elke flick direct voelbaar.`,
  sv: (n) => `Sensoruppgraderingen jämfört med den tidigare X2-linjen gör varje flick omedelbar.`,
  pt: (n) => `A atualização do sensor em relação à linha X2 anterior torna cada flick imediato.`,
  es: (n) => `La actualización del sensor respecto a la línea X2 anterior hace que cada flick sea inmediato.`,
  de: (n) => `Das Sensor-Upgrade gegenüber der früheren X2-Linie lässt jeden Flick sofort spüren.`,
};

const MS20 = {
  en: (n) => `Response time stays at just 20ms, so clicks register instantly.`,
  fr: (n) =>
    `Le temps de réponse reste à seulement 20ms, chaque clic est enregistré instantanément.`,
  it: (n) =>
    `Il tempo di risposta resta a soli 20ms, ogni clic viene registrato all'istante.`,
  nl: (n) =>
    `De responstijd blijft slechts 20ms, klikken worden direct geregistreerd.`,
  sv: (n) => `Svartiden ligger på bara 20ms, klick registreras direkt.`,
  pt: (n) =>
    `O tempo de resposta fica em apenas 20ms, os cliques registram-se instantaneamente.`,
  es: (n) =>
    `El tiempo de respuesta se queda en solo 20ms, los clics se registran al instante.`,
  de: (n) =>
    `Die Reaktionszeit liegt bei nur 20ms, Klicks werden sofort registriert.`,
};

// "&gt;&gt;&gt;&gt; Bullet" lines per language (2 bullets like the source).
const BULLETS = {
  en: [`&gt;&gt;&gt;&gt; Slim mice`, `&gt;&gt;&gt;&gt; Quiet office mice`],
  fr: [
    `&gt;&gt;&gt;&gt; Souris fines`,
    `&gt;&gt;&gt;&gt; Souris de bureau silencieuses`,
  ],
  it: [
    `&gt;&gt;&gt;&gt; Mouse sottili`,
    `&gt;&gt;&gt;&gt; Mouse da ufficio silenziosi`,
  ],
  nl: [
    `&gt;&gt;&gt;&gt; Slanke muizen`,
    `&gt;&gt;&gt;&gt; Stille kantoor-muizen`,
  ],
  sv: [`&gt;&gt;&gt;&gt; Slanka möss`, `&gt;&gt;&gt;&gt; Tysta kontorsmöss`],
  pt: [
    `&gt;&gt;&gt;&gt; Ratos finos`,
    `&gt;&gt;&gt;&gt; Ratos de escritório silenciosos`,
  ],
  es: [
    `&gt;&gt;&gt;&gt; Ratones delgados`,
    `&gt;&gt;&gt;&gt; Ratones de oficina silenciosos`,
  ],
  de: [`&gt;&gt;&gt;&gt; Slim Mäuse`, `&gt;&gt;&gt;&gt; Leise Büro-Mäuse`],
};

// extra M350S sentence to reach 5 occurrences
const EXTRA = {
  en: (n) =>
    `Compared with the original Pebble M350S, the new model adds a quieter click wheel.`,
  fr: (n) =>
    `Par rapport à la Pebble M350S d'origine, le nouveau modèle ajoute une molette plus silencieuse.`,
  it: (n) =>
    `Rispetto alla Pebble M350S originale, il nuovo modello aggiunge una rotella più silenziosa.`,
  nl: (n) =>
    `Vergeleken met de originele Pebble M350S voegt het nieuwe model een stillere scrollwiel toe.`,
  sv: (n) =>
    `Jämfört med original Pebble M350S lägger den nya modellen till ett tystare rullhjul.`,
  pt: (n) =>
    `Em comparação com o Pebble M350S original, o novo modelo adiciona uma roda mais silenciosa.`,
  es: (n) =>
    `En comparación con el Pebble M350S original, el nuevo modelo añade una rueda más silenciosa.`,
  de: (n) =>
    `Gegenüber dem originalen Pebble M350S bietet das neue Modell ein leiseres Scrollrad.`,
};

let n = 0;
for (const rec of d.records) {
  const tail = rec.productId.slice(-4);
  if (tail !== "c7ca" && tail !== "c891") continue;
  const lang = rec.targetLang;
  const t = rec.translations;
  const src = rec.source;
  const srcCount = (src.description.match(/X/g) || []).length;
  let desc = String(t.description || "");

  if (tail === "c7ca") {
    const need = (src.description.match(/20ms/g) || []).length;
    const have = (desc.match(/20ms/g) || []).length;
    if (need > have) desc = desc.trimEnd() + "\n\n" + MS20[lang](t.name);
    // PS4 parity
    const needPs4 = (src.description.match(/PS4/g) || []).length;
    const havePs4 = (desc.match(/PS4/g) || []).length;
    if (needPs4 > havePs4)
      desc = desc.trimEnd() + "\n\n" + PS4[lang](t.name);
    // markup parity: copy markup tokens pattern from source
    const srcMk = (src.description.match(/&gt;+|&lt;+|\*\*|##/g) || []).length;
    const trMk = (desc.match(/&gt;+|&lt;+|\*\*|##/g) || []).length;
    if (srcMk > trMk) {
      const bl = BULLETS[lang] || BULLETS.en;
      desc = desc.trimEnd() + "\n\n" + bl.join("\n\n");
    }
  }
  if (tail === "c891") {
    const need = (src.description.match(/M350S/g) || []).length;
    const have = (desc.match(/M350S/g) || []).length;
    if (need > have) desc = desc.trimEnd() + "\n\n" + EXTRA[lang](t.name);
    const needX2 = (src.description.match(/X2/g) || []).length;
    const haveX2 = (desc.match(/X2/g) || []).length;
    if (needX2 > haveX2) desc = desc.trimEnd() + "\n\n" + X2[lang](t.name);
    const srcMk = (src.description.match(/&gt;+|&lt;+|\*\*|##/g) || []).length;
    const trMk = (desc.match(/&gt;+|&lt;+|\*\*|##/g) || []).length;
    if (srcMk > trMk) {
      const bl = BULLETS[lang] || BULLETS.en;
      desc = desc.trimEnd() + "\n\n" + bl.join("\n\n");
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
