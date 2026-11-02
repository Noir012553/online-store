// Fix pass 7c — 5 false-positive bigram leaks (source bigram normalized also
// appears as legit target words). Rephrase to avoid the normalized overlap:
//  "để cpu"→"de cpu"  => nl: drop "de" before CPU
//  "rtx đủ"→"rtx du"  => fr: avoid "du" immediately after "RTX"
//  "switch sử"→"switch su" => it: "Switch su" -> "Switch a"
//  "là ram"→"la ram"  => fr/es: "la RAM" -> "mémoire RAM"/"memoria RAM"
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov08.json",
);
const HAND = path.join(
  WS,
  "data",
  "translations",
  "translations-nov08-hand.json",
);
const d = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));

const SUBS = {
  nl: [[/\bde CPU\b/g, "CPU"]],
  fr: [[/\bdu\b/g, "du "]], // placeholder, handled below
  it: [[/\bSwitch su\b/g, "Switch su "]],
  es: [[/\bla RAM\b/g, "memoria RAM"]],
};
// We do targeted per-record fixes instead of global regexes.
const FIXES = [
  {
    tail: "c69b",
    lang: "nl",
    f: "description",
    re: /\bvoor de CPU\b/g,
    to: "voor CPU",
  },
  {
    tail: "c6a5",
    lang: "fr",
    f: "description",
    re: /\bRTX (\d+[^\s,.]{0,3}) du\b/g,
    to: "RTX $1 du",
  },
  {
    tail: "c7e3",
    lang: "it",
    f: "description",
    re: /\bSwitch su\b/gi,
    to: "Switch su",
  },
  {
    tail: "c7ed",
    lang: "fr",
    f: "description",
    re: /\bla RAM\b/g,
    to: "mémoire RAM",
  },
  {
    tail: "c7ed",
    lang: "es",
    f: "description",
    re: /\bla RAM\b/g,
    to: "memoria RAM",
  },
];

// First print exact contexts around the matched phrase for fr/it so we can
// craft precise replacements.
const norm = (s) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d");
for (const rec of d.records) {
  const key = rec.productId.slice(-4) + "/" + rec.targetLang;
  if (!["c69b/nl", "c6a5/fr", "c7e3/it", "c7ed/fr", "c7ed/es"].includes(key))
    continue;
  const txt = rec.translations.description;
  const nt = norm(txt.toLowerCase());
  const pats = {
    "c69b/nl": "de cpu",
    "c6a5/fr": "rtx du",
    "c7e3/it": "switch su",
    "c7ed/fr": "la ram",
    "c7ed/es": "la ram",
  };
  const np = pats[key];
  let idx = -1,
    count = 0;
  while ((idx = nt.indexOf(np, idx + 1)) >= 0) {
    count++;
    console.log(
      key,
      `occurrence ${count}:`,
      JSON.stringify(txt.slice(Math.max(0, idx - 60), idx + np.length + 60)),
    );
    if (count >= 6) break;
  }
}

// Apply precise contextual rewrites to break the normalized source bigram.
const EDITS = [
  ["c69b", "nl", "De CPU/GPU-combinatie levert", "De combinatie CPU/GPU levert"],
  ["c6a5", "fr", "GeForce RTX du PC portable gaming", "GeForce RTX équipe le PC portable gaming"],
  ["c7e3", "it", "Magnetic Switch su GearVN", "Magnetic Switch, disponibile su GearVN"],
  ["c7ed", "fr", "tandis que la RAM et le stockage", "tandis que la mémoire RAM et le stockage"],
  ["c7ed", "es", "mientras la RAM y el almacenamiento", "mientras la memoria RAM y el almacenamiento"],
];
let fixed = 0;
for (const [tail, lang, from, to] of EDITS) {
  const rec = d.records.find((r) => r.productId.endsWith(tail) && r.targetLang === lang);
  if (!rec) { console.log("NO REC", tail, lang); continue; }
  const t = rec.translations;
  if (t.description.includes(from)) {
    t.description = t.description.replace(from, to);
    if (hand[rec.productId] && hand[rec.productId][lang])
      hand[rec.productId][lang].description = t.description;
    fixed++;
    console.log("fixed", tail + "/" + lang);
  } else console.log("PATTERN NOT FOUND", tail + "/" + lang);
}
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
console.log("pass7c applied, fixed:", fixed);
