// Fix leaks + remaining brands:
//  nl "vấn đề": the DUTCH description contains... where's "su"/"van de" match?
//    Actually "vấn đề" normalizes to "van de". Dutch naturally contains "van
//    de"! In NL template? No — my NL template doesn't use "van de"... Wait:
//    phrases like "valt binnen de verwachtingen van de gebruiker" — I DID use
//    "van de"? Search. Also HyperX/Akko sentences for c7c3/it (wrong brand
//    tail? "HyperX" capital vs my "HYPERX"), c640/it+es (Akko placement may
//    have failed), c66c/it+es.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const HAND = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06d-hand.json",
);
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));
const idByTail = {};
for (const pid of Object.keys(hand)) idByTail[pid.slice(-4)] = pid;

// 1. HyperX casing fix
{
  const t = hand[idByTail["c7c3"]].it;
  t.description = t.description.replace(/HYPERX/g, "HyperX");
}
// 2. AKKO casing fix for c66c it/es (probably replaced all AKKO with name)
{
  for (const tail of ["c66c"]) {
    const t = hand[idByTail[tail]];
    for (const lang of ["it", "es"]) {
      if (!t[lang].description.includes("AKKO")) {
        if (lang === "it") {
          t[lang].description = t[lang].description.replace(
            /(Progettato per produttività e comfort\n\n[^\n]+)/,
            "$1\n\nI tasti meccanici pre-lubrificati e lo switch AKKO Robot Pro rendono ogni pressione precisa, e la struttura Gasket ti offre una sensazione di digitazione morbida.",
          );
        } else {
          t[lang].description = t[lang].description.replace(
            /(Diseñado para productividad y comodidad\n\n[^\n]+)/,
            "$1\n\nLos interruptores mecánicos pre-lubricados y el switch AKKO Robot Pro hacen cada pulsación precisa, y la estructura Gasket te ofrece una sensación de tecleo suave.",
          );
        }
      }
    }
  }
}
// 3. nl leaks: find where "van de" appears
for (const tail of ["c89f", "c8da", "c8dc", "c8dd", "c92a"]) {
  const t = hand[idByTail[tail]].nl;
  const i = t.description.toLowerCase().indexOf("van de");
  console.log(
    tail,
    "nl idx:",
    i,
    JSON.stringify(
      i >= 0 ? t.description.slice(Math.max(0, i - 60), i + 40) : "(none)",
    ),
  );
}

fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
console.log("done");
