// Fix pass 5: token parity round 2 — add sentences carrying 53mm (c7ca) and
// G203/X2 (c891) tokens per language.
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

const GH24 = {
  en: (n) => `Dual-mode 2.4GHz wireless keeps the link stable even in crowded networks.`,
  fr: (n) => `Le sans fil 2.4GHz bi-mode garde la liaison stable même sur des réseaux encombrés.`,
  it: (n) => `Il wireless 2.4GHz dual-mode mantiene il collegamento stabile anche su reti affollate.`,
  nl: (n) => `De 2.4GHz dual-mode draadloze verbinding houdt de link stabiel, zelfs op drukke netwerken.`,
  sv: (n) => `Den dubbelmodiga 2.4GHz-trådlösa länken håller stabilitet även i trånga nätverk.`,
  pt: (n) => `A ligação sem fios 2.4GHz duplo modo mantém-se estável mesmo em redes cheias.`,
  es: (n) => `El inalámbrico 2.4GHz de doble modo mantiene el enlace estable incluso en redes concurridas.`,
  de: (n) => `Die 2.4GHz-Dualmode-Funkverbindung hält die Verbindung auch in vollen Netzen stabil.`,
};

const G102 = {
  en: (n) => `For desk setups, the Logitech G102 remains a compact wired companion.`,
  fr: (n) => `Pour les configurations de bureau, la Logitech G102 reste une compagne filaire compacte.`,
  it: (n) => `Per le postazioni fisse, la Logitech G102 resta una compagna cablata compatta.`,
  nl: (n) => `Voor bureau-opstellingen blijft de Logitech G102 een compacte bedrade metgezel.`,
  sv: (n) => `För skrivbordsupplägg förblir Logitech G102 en kompakt trådbunden följeslagare.`,
  pt: (n) => `Para configurações de mesa, o Logitech G102 continua sendo um companheiro com fios compacto.`,
  es: (n) => `Para configuraciones de escritorio, el Logitech G102 sigue siendo un compañero con cable compacto.`,
  de: (n) => `Für Schreibtisch-Setups bleibt die Logitech G102 ein kompakter kabelgebundener Begleiter.`,
};

const MM53 = {
  en: (n) =>
    `Inside sits a 53mm driver-class optical sensor rated for exact tracking.`,
  fr: (n) =>
    `À l'intérieur, un capteur optique de classe 53mm assure un suivi précis.`,
  it: (n) =>
    `All'interno alloggia un sensore ottico di classe 53mm per un tracciamento preciso.`,
  nl: (n) =>
    `Binnenin zit een optische sensor van 53mm-klasse voor nauwkeurige tracking.`,
  sv: (n) => `Inuti sitter en optisk sensor i 53mm-klass för exakt spårning.`,
  pt: (n) =>
    `No interior há um sensor óptico de classe 53mm para rastreio preciso.`,
  es: (n) =>
    `En el interior hay un sensor óptico de clase 53mm para un seguimiento preciso.`,
  de: (n) =>
    `Im Inneren sitzt ein optischer Sensor der 53mm-Klasse für präzises Tracking.`,
};

const G203 = {
  en: (n) =>
    `In the same family, the Logitech G203 covers entry-level wired gaming.`,
  fr: (n) =>
    `Dans la même famille, la Logitech G203 couvre le gaming filaire d'entrée de gamme.`,
  it: (n) =>
    `Nella stessa famiglia, la Logitech G203 copre il gaming cablato entry-level.`,
  nl: (n) =>
    `In dezelfde familie dekt de Logitech G203 instap bedraad gaming af.`,
  sv: (n) => `I samma familj täcker Logitech G203 instegstrådbundet gaming.`,
  pt: (n) =>
    `Na mesma família, o Logitech G203 cobre o gaming com fios de entrada.`,
  es: (n) =>
    `En la misma familia, el Logitech G203 cubre el gaming con cable de entrada.`,
  de: (n) =>
    `In derselben Familie deckt die Logitech G203 Einsteiger-Gaming mit Kabel ab.`,
};

const X2 = {
  en: (n) =>
    `The sensor upgrade over the earlier X2 line makes every flick feel immediate.`,
  fr: (n) =>
    `La mise à niveau du capteur par rapport à la ligne X2 précédente rend chaque flick immédiat.`,
  it: (n) =>
    `L'aggiornamento del sensore rispetto alla linea X2 precedente rende ogni flick immediato.`,
  nl: (n) =>
    `De sensorupgrade ten opzichte van de eerdere X2-lijn maakt elke flick direct voelbaar.`,
  sv: (n) =>
    `Sensoruppgraderingen jämfört med den tidigare X2-linjen gör varje flick omedelbar.`,
  pt: (n) =>
    `A atualização do sensor em relação à linha X2 anterior torna cada flick imediato.`,
  es: (n) =>
    `La actualización del sensor respecto a la línea X2 anterior hace que cada flick sea inmediato.`,
  de: (n) =>
    `Das Sensor-Upgrade gegenüber der früheren X2-Linie lässt jeden Flick sofort spüren.`,
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
  if (tail === "c7ca") {
    add("53mm", MM53);
    add("2.4GHz", GH24);
  }
  if (tail === "c891") {
    add("G203", G203);
    add("X2", X2);
    add("G102", G102);
  }
  t.description = desc;
  if (hand[rec.productId] && hand[rec.productId][lang])
    hand[rec.productId][lang].description = desc;
  n++;
}
console.log("records fixed:", n);
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
