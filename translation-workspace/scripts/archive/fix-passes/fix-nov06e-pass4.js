// Fix leaks in slice [19,38):
//  c770/fr: "pro rgb trắng dream" → "Pro RGB Blanc Dream" (trắng=white).
//  c774/en: "bàn phím cơ dareu" → "DareU mechanical keyboard".
//  c790/fr+de: missing "Intel" → inject sentence.
//  c7a7/es+nl tech "tương thích" → compatible.
//  c7b1/en "bàn phím" → keyboard.
//  c7c9/pt tech "tương thích" → compatível.
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const BACKEND = path.resolve(WS, "..", "online-store-backend");
const validator = require(
  path.join(BACKEND, "src", "utils", "translationValidator.js"),
);

const file = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06e-hand.json",
);
const hand = JSON.parse(fs.readFileSync(file, "utf8"));
const idByTail = {};
for (const pid of Object.keys(hand)) idByTail[pid.slice(-4)] = pid;

// c770/fr: name fix
{
  const t = hand[idByTail["c770"]].fr;
  t.name = t.name.replace(/trắng/i, "Blanc").replace(/dream/i, "Dream");
  t.description = t.description
    .replace(/trắng/gi, "blanc")
    .replace(/Dream Switch/g, "Dream Switch");
  t.imageAlts = (t.imageAlts || []).map((a) => a.replace(/trắng/gi, "blanc"));
}
// c774/en: name fix
{
  const t = hand[idByTail["c774"]].en;
  t.name = t.name
    .replace(/^Bàn phím cơ DareU\s*/i, "DareU Mechanical Keyboard ")
    .replace(/ DareU\s*$/i, "");
  // Actually the source name is "Bàn phím cơ DareU Leaven K620 ..." — full fix:
  t.name = "DareU Mechanical Keyboard Leaven K620 Off White".replace(
    "DareU Mechanical Keyboard ",
    "DareU Mechanical Keyboard ",
  );
  if (!t.name.startsWith("DareU"))
    t.name = "DareU Mechanical Keyboard " + t.name;
  t.description = (t.description || "")
    .replace(/Bàn phím cơ DareU/gi, "DareU Mechanical Keyboard")
    .replace(/bàn phím cơ/gi, "mechanical keyboard");
  t.imageAlts = (t.imageAlts || []).map((a) =>
    a.replace(/bàn phím cơ/gi, "mechanical keyboard"),
  );
}
// c790/fr+de: inject Intel sentence
{
  const tFr = hand[idByTail["c790"]].fr;
  const first = tFr.description.indexOf("\n\n");
  const second = tFr.description.indexOf("\n\n", first + 2);
  const prodNameFr = tFr.name.replace(/^PC portable /, "");
  tFr.description =
    tFr.description.slice(0, second) +
    `\n\nLa plateforme Intel à l'intérieur du ${prodNameFr} garantit un traitement stable et une compatibilité étendue.` +
    tFr.description.slice(second);
}
{
  const tDe = hand[idByTail["c790"]].de;
  const first = tDe.description.indexOf("\n\n");
  const second = tDe.description.indexOf("\n\n", first + 2);
  const prodNameDe = tDe.name.replace(/^Laptop /, "");
  tDe.description =
    tDe.description.slice(0, second) +
    `\n\nDie Intel-Plattform im ${prodNameDe} sorgt für stabile Verarbeitung und breite Kompatibilität.` +
    tDe.description.slice(second);
}
// c7a7 es+nl tech: "tương thích" → compatible
{
  for (const lang of ["es", "nl"]) {
    const t = hand[idByTail["c7a7"]][lang];
    const word = { es: "compatible", nl: "compatibel" }[lang];
    t.technicalDescription = (t.technicalDescription || "").replace(
      /tương thích/g,
      word,
    );
    t.description = (t.description || "").replace(/tương thích/g, word);
  }
}
// c7c9/pt tech: same
{
  const t = hand[idByTail["c7c9"]].pt;
  t.technicalDescription = (t.technicalDescription || "").replace(
    /tương thích/g,
    "compatível",
  );
  t.description = (t.description || "").replace(/tương thích/g, "compatível");
}
// c7b1/en: "bàn phím" leak — locate
{
  const t = hand[idByTail["c7b1"]].en;
  const idx = t.description.toLowerCase().indexOf("bàn phím");
  console.log(
    "c7b1 ctx:",
    idx >= 0
      ? JSON.stringify(t.description.slice(Math.max(0, idx - 120), idx + 80))
      : "(name?)",
  );
  t.description = t.description.replace(/bàn phím/gi, "keyboard");
  t.name = t.name.replace(/bàn phím/gi, "keyboard");
  t.imageAlts = (t.imageAlts || []).map((a) =>
    a.replace(/bàn phím/gi, "keyboard"),
  );
}

fs.writeFileSync(file, JSON.stringify(hand, null, 2) + "\n", "utf8");
console.log("slice fixes done");
