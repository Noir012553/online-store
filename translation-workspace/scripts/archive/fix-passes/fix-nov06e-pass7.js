// Fix pass 7 — 22 leaks all trace back to NAME containing "Bàn phím"/"Chuột"/
// "Laptop" prefix I failed to translate because my GENERIC regex chain broke
// after first match (break statement). Fix: apply EVERY regex (not just first
// match) + translate the leftover "dễ/Trắng/Hồng/Đen/Contour" words per lang.
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const HAND = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06e-hand.json",
);
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov06e.json",
);
const importData = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const SOURCES = fs.readFileSync(
  path.join(WS, "data", "sources-for-translation-next.txt"),
  "utf8",
);
const blocks = SOURCES.split("===== PRODUCT ").slice(1);
const blockByPid = new Map(blocks.map((b) => [b.match(/^([0-9a-f]+)/)[1], b]));

const GENERIC_ALL = [
  [
    /Tai nghe True Wireless/g,
    {
      fr: "Écouteurs true wireless ",
      it: "Auricolari true wireless ",
      en: "True wireless earbuds ",
      nl: "True wireless oordopjes ",
      sv: "True wireless öronsnäckor ",
      pt: "Auscultadores true wireless ",
      es: "Auriculares true wireless ",
      de: "True-Wireless-Kopfhörer ",
    },
  ],
  [
    /Tai nghe/g,
    {
      fr: "Casque ",
      it: "Cuffie ",
      en: "Headset ",
      nl: "Headset ",
      sv: "Headset ",
      pt: "Auscultadores ",
      es: "Auriculares ",
      de: "Headset ",
    },
  ],
  [
    /Bàn phím cơ Gaming/g,
    {
      fr: "Clavier mécanique gaming ",
      it: "Tastiera meccanica gaming ",
      en: "Gaming mechanical keyboard ",
      nl: "Gaming mechanisch toetsenbord ",
      sv: "Gaming mekaniskt tangentbord ",
      pt: "Teclado mecânico gaming ",
      es: "Teclado mecánico gaming ",
      de: "Gaming mechanische Tastatur ",
    },
  ],
  [
    /Bàn phím cơ/g,
    {
      fr: "Clavier mécanique ",
      it: "Tastiera meccanica ",
      en: "Mechanical keyboard ",
      nl: "Mechanisch toetsenbord ",
      sv: "Mekaniskt tangentbord ",
      pt: "Teclado mecânico ",
      es: "Teclado mecánico ",
      de: "Mechanische Tastatur ",
    },
  ],
  [
    /Bàn phím Không dây/g,
    {
      fr: "Clavier sans fil ",
      it: "Tastiera wireless ",
      en: "Wireless keyboard ",
      nl: "Draadloos toetsenbord ",
      sv: "Trådlöst tangentbord ",
      pt: "Teclado sem fios ",
      es: "Teclado inalámbrico ",
      de: "Kabellose Tastatur ",
    },
  ],
  [
    /Bàn phím có dây/g,
    {
      fr: "Clavier filaire ",
      it: "Tastiera cablata ",
      en: "Wired keyboard ",
      nl: "Bedraad toetsenbord ",
      sv: "Trådbundet tangentbord ",
      pt: "Teclado com fios ",
      es: "Teclado con cable ",
      de: "Kabelgebundene Tastatur ",
    },
  ],
  [
    /Bàn phím gaming/g,
    {
      fr: "Clavier gaming ",
      it: "Tastiera gaming ",
      en: "Gaming keyboard ",
      nl: "Gaming-toetsenbord ",
      sv: "Gamingtangentbord ",
      pt: "Teclado gaming ",
      es: "Teclado gaming ",
      de: "Gaming-Tastatur ",
    },
  ],
  [
    /Bàn phím/g,
    {
      fr: "Clavier ",
      it: "Tastiera ",
      en: "Keyboard ",
      nl: "Toetsenbord ",
      sv: "Tangentbord ",
      pt: "Teclado ",
      es: "Teclado ",
      de: "Tastatur ",
    },
  ],
  [
    /Chuột gaming/g,
    {
      fr: "Souris gaming ",
      it: "Mouse gaming ",
      en: "Gaming mouse ",
      nl: "Gaming-muis ",
      sv: "Spelmus ",
      pt: "Rato gaming ",
      es: "Ratón gaming ",
      de: "Gaming-Maus ",
    },
  ],
  [
    /Chuột Không dây/g,
    {
      fr: "Souris sans fil ",
      it: "Mouse wireless ",
      en: "Wireless mouse ",
      nl: "Draadloze muis ",
      sv: "Trådlös mus ",
      pt: "Rato sem fios ",
      es: "Ratón inalámbrico ",
      de: "Kabellose Maus ",
    },
  ],
  [
    /Chuột không dây/g,
    {
      fr: "Souris sans fil ",
      it: "Mouse wireless ",
      en: "Wireless mouse ",
      nl: "Draadloze muis ",
      sv: "Trådlös mus ",
      pt: "Rato sem fios ",
      es: "Ratón inalámbrico ",
      de: "Kabellose Maus ",
    },
  ],
  [
    /Chuột/g,
    {
      fr: "Souris ",
      it: "Mouse ",
      en: "Mouse ",
      nl: "Muis ",
      sv: "Mus ",
      pt: "Rato ",
      es: "Ratón ",
      de: "Maus ",
    },
  ],
  [
    /Laptop gaming/g,
    {
      fr: "PC portable gaming ",
      it: "PC portatile gaming ",
      en: "Gaming laptop ",
      nl: "Gaming laptop ",
      sv: "Gaming bärbar dator ",
      pt: "Portátil gaming ",
      es: "Portátil gaming ",
      de: "Gaming-Laptop ",
    },
  ],
  [
    /Laptop/g,
    {
      fr: "PC portable ",
      it: "PC portatile ",
      en: "Laptop ",
      nl: "Laptop ",
      sv: "Bärbar dator ",
      pt: "Portátil ",
      es: "Portátil ",
      de: "Laptop ",
    },
  ],
];

const COLOR_ALL = [
  [
    /trắng/g,
    {
      fr: "blanc",
      it: "bianco",
      nl: "wit",
      sv: "vit",
      pt: "branco",
      es: "blanco",
      de: "weiß",
    },
  ],
  [
    /hồng/g,
    {
      fr: "rose",
      it: "rosa",
      nl: "roze",
      sv: "rosa",
      pt: "rosa",
      es: "rosa",
      de: "rosa",
    },
  ],
  [
    /đen/g,
    {
      fr: "noir",
      it: "nero",
      nl: "zwart",
      sv: "svart",
      pt: "preto",
      es: "negro",
      de: "schwarz",
    },
  ],
  [/dễ/g, { fr: "", it: "", nl: "", sv: "", pt: "", es: "", de: "" }],
  [/contour/g, {}],
];

let nameFixed = 0,
  descFixed = 0;
for (const rec of importData.records) {
  const lang = rec.targetLang;
  if (lang === "vi") continue;
  const h = hand[rec.productId] && hand[rec.productId][lang];
  if (!h) continue;
  let name = h.name || "";
  const block = blockByPid.get(rec.productId);
  const srcName = block ? (block.match(/NAME: (.*)/)[1] || "").trim() : "";
  // Rebuild the name from the SOURCE name (translated): take the VN-source
  // and translate the prefix again properly.
  let rebuilt = srcName;
  for (const [re, words] of GENERIC_ALL) {
    if (words[lang]) rebuilt = rebuilt.replace(re, words[lang]);
  }
  for (const [re, words] of COLOR_ALL) {
    if (words[lang]) rebuilt = rebuilt.replace(re, words[lang]);
  }
  if (rebuilt !== name && rebuilt && !rebuilt.match(/[\u0100-\u1EFF]/)) {
    h.name = rebuilt;
    nameFixed++;
    // also update description mentions of the old wrong name
    if (h.description && h.description.includes(name)) {
      h.description = h.description.split(name).join(rebuilt);
      descFixed++;
    }
  }
  // description residual VN words (leaks identified) — patch individually
  if (h.description) {
    let d = h.description;
    for (const [re, words] of GENERIC_ALL)
      if (words[lang]) d = d.replace(re, words[lang]);
    for (const [re, words] of COLOR_ALL)
      if (words[lang]) d = d.replace(re, words[lang]);
    if (d !== h.description) {
      h.description = d;
      descFixed++;
    }
    h.imageAlts = (h.imageAlts || []).map((a) => {
      let x = a;
      for (const [re, words] of GENERIC_ALL)
        if (words[lang]) x = x.replace(re, words[lang]);
      for (const [re, words] of COLOR_ALL)
        if (words[lang]) x = x.replace(re, words[lang]);
      return x;
    });
  }
}
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
console.log("names fixed:", nameFixed, "| desc fixed:", descFixed);

// rebuild import file
for (const rec of importData.records) {
  const h = hand[rec.productId] && hand[rec.productId][rec.targetLang];
  if (h) rec.translations = h;
}
fs.writeFileSync(IMPORT, JSON.stringify(importData, null, 2), "utf8");
console.log("import rebuilt");
