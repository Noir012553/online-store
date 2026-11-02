// Fix pass 5:
//  1. c790 fr/de: name contains "Nhập Khẩu Chính Hãng" — translate to FR "Importé Officiel", DE "Originalimport".
//  2. c7a7 es/nl + c7c9 pt: "Tương thích" key not translated in tech JSON + "Tai nghe Bluetooth" value not translated. Fix KEY_TR to include Tương thích, and translate the value.
//  3. c770/fr: "switch dễ" is part of Vietnamese product name — trim out or translate.
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

// c790 fr/de name + desc cleanup
{
  const fr = hand[idByTail["c790"]].fr;
  fr.name = fr.name.replace("Nhập Khẩu Chính Hãng", "Import Officiel");
  fr.description = fr.description.replace(
    "Nhập Khẩu Chính Hãng",
    "Import Officiel",
  );
  const de = hand[idByTail["c790"]].de;
  de.name = de.name.replace("Nhập Khẩu Chính Hãng", "Originalimport");
  de.description = de.description.replace(
    "Nhập Khẩu Chính Hãng",
    "Originalimport",
  );
}

// c7a7 es/nl + c7c9 pt: Tương thích & Tai nghe Bluetooth
{
  const es = hand[idByTail["c7a7"]].es;
  es.technicalDescription = es.technicalDescription
    .replace(/"Tương thích"/g, '"Compatibilidad"')
    .replace(/"Tai nghe Bluetooth"/g, '"Auriculares Bluetooth"');
  const nl = hand[idByTail["c7a7"]].nl;
  nl.technicalDescription = nl.technicalDescription
    .replace(/"Tương thích"/g, '"Compatibiliteit"')
    .replace(/"Tai nghe Bluetooth"/g, '"Bluetooth Headset"');
  const pt = hand[idByTail["c7c9"]].pt;
  pt.technicalDescription = pt.technicalDescription.replace(
    /"Tương thích"/g,
    '"Compatibilidade"',
  );
}

// c770/fr: drop VN "dễ" if stuck to model name — inspect first.
const fr770 = hand[idByTail["c770"]].fr;
const idxE = fr770.description.toLowerCase().indexOf("switch dễ");
if (idxE >= 0) {
  console.log(
    "c770 ctx:",
    JSON.stringify(
      fr770.description.slice(Math.max(0, idxE - 140), idxE + 100),
    ),
  );
}

fs.writeFileSync(file, JSON.stringify(hand, null, 2) + "\n", "utf8");
console.log("pass5 done; validating:");
