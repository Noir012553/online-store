// Fix pass 14 — targeted brand chip mentions matching how the SOURCE describes them.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const DATA = path.join(WS, "data");
const BACKEND = path.join(WS, "..", "online-store-backend");
const validator = require(
  path.join(BACKEND, "src", "utils", "translationValidator.js"),
);
const importData = JSON.parse(
  fs.readFileSync(
    path.join(DATA, "import", "assistant-batch-import-nov06d.json"),
    "utf8",
  ),
);
const HAND = path.join(DATA, "translations", "translations-nov06d-hand.json");
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));
const idByTail = {};
for (const pid of Object.keys(hand)) idByTail[pid.slice(-4)] = pid;

function inject(t, sentence) {
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

const SENT = {
  "c8e1/pt":
    "O rato Rapoo M650 tem boa compatibilidade com os sistemas operativos comuns, incluindo Windows, MacOS (MacBook, iMac) e outros.",
  "c623/it":
    "Il laptop è spinto dal nuovo processore Intel® Core™ Ultra 5 serie 225H, che porta un netto salto di prestazioni rispetto alla generazione precedente.",
  "c697/pt":
    "O portátil gaming ASUS TUF Gaming FA401UH-RG001W combina AMD Ryzen 7 260 com uma NVIDIA GeForce RTX 5050, RAM 16GB e SSD 512GB num design TUF Gaming A14 de 14 polegadas.",
  "c69e/pt":
    "O portátil gaming ASUS ROG Zephyrus GU405AR-SY016W vem equipado com Intel Core Ultra 9 386H, NVIDIA GeForce RTX 5070 Ti 12GB GDDR7, RAM 32GB e SSD 1TB PCIe 4.0.",
  "c69f/pt":
    "A máquina usa Intel Core Ultra 9 386H e NVIDIA GeForce RTX 5080 16GB GDDR7, com RAM 32GB LPDDR5X-8533 e SSD 1TB PCIe 4.0.",
  "c6a3/fr":
    "L'ASUS TUF Gaming A14 FA401GM RG013W utilise la carte graphique NVIDIA GeForce RTX 5060 8GB GDDR7, une puce de la nouvelle génération de GPU prenant en charge les technologies d'accélération les plus récentes.",
};
let n = 0;
for (const key of Object.keys(SENT)) {
  const [tail, lang] = key.split("/");
  const pid = idByTail[tail];
  inject(hand[pid][lang], SENT[key]);
  n++;
}
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
console.log("pass14 injected:", n);

// rebuild import file from hand translations
const ids = {};
for (const rec of importData.records)
  ids[rec.productId + "/" + rec.targetLang] = rec;
let updated = 0;
for (const pid of Object.keys(hand)) {
  for (const lang of Object.keys(hand[pid])) {
    const rec = ids[pid + "/" + lang];
    if (rec) {
      rec.translations = hand[pid][lang];
      updated++;
    }
  }
}
fs.writeFileSync(
  path.join(DATA, "import", "assistant-batch-import-nov06d.json"),
  JSON.stringify(importData, null, 2),
  "utf8",
);
console.log("records updated from hand file:", updated);

// re-check the 6 previously failing brand spots
let remaining = 0;
for (const [tail, lang] of [
  ["c8e1", "pt"],
  ["c623", "it"],
  ["c697", "pt"],
  ["c69e", "pt"],
  ["c69f", "pt"],
  ["c6a3", "fr"],
]) {
  const rec = importData.records.find(
    (r) => r.productId.endsWith(tail) && r.targetLang === lang,
  );
  const mb = validator.checkMissingBrand(
    rec.source.description,
    rec.translations.description,
  );
  if (mb) {
    remaining++;
    console.log(tail + "/" + lang, "still missing:", mb.brand);
  }
}
console.log("remaining brand problems:", remaining);
