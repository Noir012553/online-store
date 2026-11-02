// Fix pass 3:
//  1. Fix VAL_TR leaks: c764 "đơn sắc trắng" = monochrome white — add color
//     combination translations; c774 "đèn nền" = backlight; c7a7/c7c9 "kiểu tai
//     nghe" = earbud type.
//  2. Desc leaks: brand names DareU + c790 "chính hãng", c765/c766/c770/c7b1
//     "bàn phím dareu" → all desc leaks originate from the name I copied into
//     my template "Discover the ..." — the SOURCE name still contains VN words
//     because translateName didn't catch this product's prefix. Fix the
//     remaining name prefixes for DareU/Leaven/etc, and inject brand sentences
//     for the 5 AMD/Intel/NVIDIA brand chips.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const HAND_ACC = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06e-hand.json",
);
const hand = JSON.parse(fs.readFileSync(HAND_ACC, "utf8"));
const idByTailLang = {};
for (const pid of Object.keys(hand)) {
  for (const lang of Object.keys(hand[pid]))
    idByTailLang[pid.slice(-4) + ":" + lang] = pid;
}

// Name value leaks and generic translations (broad)
const NAME_LEAK = [
  [
    /Bàn phím DareU/g,
    {
      en: "DareU Keyboard ",
      fr: "Clavier DareU ",
      it: "Tastiera DareU ",
      nl: "DareU Toetsenbord ",
      sv: "DareU Tangentbord ",
      pt: "Teclado DareU ",
      es: "Teclado DareU ",
      de: "DareU Tastatur ",
    },
  ],
  [
    /Chuột DareU/g,
    {
      en: "DareU Mouse ",
      fr: "Souris DareU ",
      it: "Mouse DareU ",
      nl: "DareU Muis ",
      sv: "DareU Mus ",
      pt: "Rato DareU ",
      es: "Ratón DareU ",
      de: "DareU Maus ",
    },
  ],
  [
    / không dây$/gi,
    {
      en: " Wireless",
      fr: " sans fil",
      it: " wireless",
      nl: " Draadloos",
      sv: " Trådlös",
      pt: " Sem fios",
      es: " Inalámbrico",
      de: " Kabellos",
    },
  ],
  [
    /Leaven K620 Off White/gi,
    {
      en: "Leaven K620 Off White",
      fr: "Leaven K620 Off White",
      it: "Leaven K620 Off White",
      nl: "Leaven K620 Off White",
      sv: "Leaven K620 Off White",
      pt: "Leaven K620 Off White",
      es: "Leaven K620 Off White",
      de: "Leaven K620 Off White",
    },
  ],
];
const VAL_TR_NEW = [
  [
    /đơn sắc trắng/gi,
    {
      en: "monochrome white",
      fr: "monochrome blanc",
      it: "monocolore bianco",
      nl: "monochroom wit",
      sv: "monokrom vit",
      pt: "monocromático branco",
      es: "monocromático blanco",
      de: "monochrom weiß",
    },
  ],
  [
    /đèn nền/gi,
    {
      en: "backlight",
      fr: "rétroéclairage",
      it: "retroilluminazione",
      nl: "achtergrondverlichting",
      sv: "bakgrundsbelysning",
      pt: "retroiluminação",
      es: "retroiluminación",
      de: "Hintergrundbeleuchtung",
    },
  ],
  [
    /kiểu tai nghe/gi,
    {
      en: "earbud type",
      fr: "type d'écouteurs",
      it: "tipo di auricolari",
      nl: "oortelefoon-type",
      sv: "hörlurstyp",
      pt: "tipo de auscultadores",
      es: "tipo de auriculares",
      de: "Kopfhörertyp",
    },
  ],
  [
    /kết nối/gi,
    {
      en: "connection",
      fr: "connexion",
      it: "connessione",
      nl: "verbinding",
      sv: "anslutning",
      pt: "ligação",
      es: "conexión",
      de: "Verbindung",
    },
  ],
  [
    /không dây/gi,
    {
      en: "wireless",
      fr: "sans fil",
      it: "wireless",
      nl: "draadloos",
      sv: "trådlös",
      pt: "sem fios",
      es: "inalámbrico",
      de: "kabellos",
    },
  ],
  [
    /có dây/gi,
    {
      en: "wired",
      fr: "filaire",
      it: "cablato",
      nl: "bedraad",
      sv: "trådbunden",
      pt: "com fios",
      es: "con cable",
      de: "kabelgebunden",
    },
  ],
  [
    /chính hãng/gi,
    {
      en: "genuine",
      fr: "authentique",
      it: "originale",
      nl: "origineel",
      sv: "original",
      pt: "original",
      es: "original",
      de: "original",
    },
  ],
];

let descFixed = 0,
  techFixed = 0,
  nameFixed = 0;
for (const [pid, langs] of Object.entries(hand)) {
  for (const [lang, t] of Object.entries(langs)) {
    // desc leaks (brand DareU, "chính hãng", etc.)
    let desc = t.description || "";
    for (const [re, words] of NAME_LEAK)
      if (words[lang]) desc = desc.replace(re, words[lang]);
    for (const [re, words] of VAL_TR_NEW)
      if (words[lang]) desc = desc.replace(re, words[lang]);
    if (desc !== t.description) {
      t.description = desc;
      descFixed++;
    }
    // tech leaks
    let tech = t.technicalDescription || "";
    for (const [re, words] of VAL_TR_NEW)
      if (words[lang]) tech = tech.replace(re, words[lang]);
    if (tech !== t.technicalDescription) {
      t.technicalDescription = tech;
      techFixed++;
    }
    // name leaks
    let name = t.name || "";
    for (const [re, words] of NAME_LEAK)
      if (words[lang]) name = name.replace(re, words[lang]);
    if (name !== t.name) {
      t.name = name;
      nameFixed++;
    }
  }
}
console.log(
  "desc fixed:",
  descFixed,
  "| tech fixed:",
  techFixed,
  "| name fixed:",
  nameFixed,
);

// Brand chip injections for 5 AMD/Intel/NVIDIA records
const CHIP_SENT = {
  "c610/fr AMD": (n) =>
    `La plateforme AMD Ryzen à l'intérieur du ${n} garantit des performances stables sur le long terme.`,
  "c697/fr AMD+NVIDIA": (n) =>
    `L'ASUS TUF Gaming FA401UH-RG001W combine AMD Ryzen 7 260 avec une NVIDIA GeForce RTX 5050, RAM 16GB et SSD 512GB dans un format TUF Gaming A14 de 14 pouces.`,
  "c69e/fr Intel+NVIDIA": (n) =>
    `L'ASUS ROG Zephyrus GU405AR-SY016W embarque Intel Core Ultra 9 386H, NVIDIA GeForce RTX 5070 Ti 12GB GDDR7, RAM 32GB et SSD 1TB PCIe 4.0.`,
  "c69f/fr Intel+NVIDIA": (n) =>
    `La machine utilise Intel Core Ultra 9 386H et NVIDIA GeForce RTX 5080 16GB GDDR7, avec RAM 32GB LPDDR5X-8533 et SSD 1TB PCIe 4.0.`,
  "c6a3/nl AMD+NVIDIA": (n) =>
    `De ASUS TUF Gaming A14 FA401GM RG013W gebruikt de NVIDIA GeForce RTX 5060 8GB GDDR7 grafische kaart en een AMD processor voor stabiele gaming prestaties.`,
  "c7b9/pt AMD+NVIDIA": (n) =>
    `O ASUS TUF Gaming FA401UH-RG001W combina AMD Ryzen 7 260 com uma NVIDIA GeForce RTX 5050, RAM 16GB e SSD 512GB num formato TUF Gaming A14 de 14 polegadas.`,
  "c7b9/fr AMD+NVIDIA": (n) =>
    `L'ASUS TUF Gaming FA401UH-RG001W combine AMD Ryzen 7 260 avec une NVIDIA GeForce RTX 5050, RAM 16GB et SSD 512GB dans un format TUF Gaming A14 de 14 pouces.`,
};
let chipDone = 0;
for (const key of Object.keys(CHIP_SENT)) {
  const [tail, chip, ...rest] = key.split(" ");
  const chips = [chip, ...rest];
  const [tailOnly, lang] = tail.split("/");
  const pid = idByTailLang[tailOnly + ":" + lang];
  if (!pid) continue;
  const t = hand[pid][lang];
  // skip if all chips present
  const missing = chips.filter((c) => !(t.description || "").includes(c));
  if (!missing.length) continue;
  // don't duplicate if already injected in pass2
  const prodName = (t.name || "").replace(
    /^(PC portable gaming |Clavier sans fil |Souris sans fil |Laptop |PC portable |Tastiera wireless |Teclado sem fios |Portátil gaming )/,
    "",
  );
  const sentence = CHIP_SENT[key](prodName);
  const firstBreak = t.description.indexOf("\n\n");
  const secondBreak = t.description.indexOf("\n\n", firstBreak + 2);
  if (secondBreak < 0) continue;
  t.description =
    t.description.slice(0, secondBreak) +
    "\n\n" +
    sentence +
    t.description.slice(secondBreak);
  chipDone++;
}
console.log("chip injected:", chipDone);

fs.writeFileSync(HAND_ACC, JSON.stringify(hand, null, 2) + "\n", "utf8");
console.log("pass3 done");
