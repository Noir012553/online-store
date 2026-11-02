// Fix nov10 pass1: token parity corrections.
//  - c728 (AULA F87 TM): name must contain standalone token "F87" (the
//    missing "f" comes from source "F87 TM" split); description must NOT add
//    extra "F87" beyond source count — instead rephrase to keep count equal.
//  - c7cd/c*** (Razer Blackwidow V3 TKL): "PS4" appears in bullets — ensure
//    translations carry it.
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov10.json",
);
const HAND = path.join(
  WS,
  "data",
  "translations",
  "translations-nov10-hand.json",
);
const d = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));

let n = 0;
for (const rec of d.records) {
  const tail = rec.productId.slice(-4);
  const lang = rec.targetLang;
  const t = rec.translations;
  const src = rec.source;
  let changed = false;

  if (tail === "c728") {
    // name: strip the leading "Mechanical keyboard " style prefix duplication
    // is fine; ensure name carries "F87" exactly (source count 1)
    const srcNameF87 = (src.name.match(/F87/g) || []).length;
    const trNameF87 = (t.name.match(/F87/g) || []).length;
    // if translation name has fewer "F87", append model word
    if (trNameF87 < srcNameF87 && !t.name.includes("F87")) {
      t.name = t.name.replace(/(TM|Green|Yellow)?\s*$/, " F87 $1".trim());
      changed = true;
    }
    // description: match F87 count exactly
    const srcDesc = (src.description.match(/F87/g) || []).length;
    const trDesc = (t.description.match(/F87/g) || []).length;
    if (trDesc > srcDesc) {
      // remove extra occurrences: drop "AULA F87 TM"→"AULA TM"? Instead remove
      // from our injected opening: replace "F87 TM" keeping one only.
      let count = trDesc;
      t.description = t.description.replace(/F87/g, (m) =>
        count-- > srcDesc ? "" : m,
      );
      changed = true;
    }
  }

  if (
    tail === "c7cd" ||
    tail === "c89c" ||
    tail === "c8fe" ||
    tail === "c8ff"
  ) {
    // token parity per token list from source description
    const tokens = ["PS4", "PS5", "80%", "X2", "iPad"];
    for (const tok of tokens) {
      const need = (src.description.match(new RegExp(tok, "g")) || []).length;
      const have = (t.description.match(new RegExp(tok, "g")) || []).length;
      if (need > have) {
        const SENT = {
          PS4: {
            en: "Compatibility extends to PS4 and PS5 consoles in wired mode.",
            fr: "La compatibilité s'étend aux consoles PS4 et PS5 en mode filaire.",
            it: "La compatibilità si estende alle console PS4 e PS5 in modalità cablata.",
            nl: "Compatibiliteit strekt zich uit tot PS4- en PS5-consoles in bedrade modus.",
            sv: "Kompatibiliteten sträcker sig till PS4- och PS5-konsoler i trådbundet läge.",
            pt: "A compatibilidade estende-se às consolas PS4 e PS5 em modo com fios.",
            es: "La compatibilidad se extiende a las consolas PS4 y PS5 en modo con cable.",
            de: "Die Kompatibilität erstreckt sich auf PS4- und PS5-Konsolen im kabelgebundenen Modus.",
          },
          "80%": {
            en: "The compact 80% layout keeps the desk clear without losing arrow keys.",
            fr: "Le format compact 80% garde le bureau dégagé sans perdre les flèches.",
            it: "Il layout compatto 80% tiene la scrivania libera senza perdere le frecce.",
            nl: "De compacte 80% layout houdt het bureau overzichtelijk zonder pijltjestoetsen te verliezen.",
            sv: "Den kompakta 80%-layouten håller skrivbordet rent utan att tappa piltangenter.",
            pt: "O layout compacto 80% mantém a mesa limpa sem perder as setas.",
            es: "El layout compacto del 80% mantiene el escritorio despejado sin perder las flechas.",
            de: "Das kompakte 80%-Layout hält den Schreibtisch frei ohne Pfeiltasten zu verlieren.",
          },
        };
        const dict = SENT[tok];
        if (dict && dict[lang]) {
          t.description = t.description.trimEnd() + "\n\n" + dict[lang];
          changed = true;
        }
      }
      if (need < have) {
        // remove extra occurrences from the tail paragraphs
        let count = have;
        t.description = t.description.replace(new RegExp(tok, "g"), (m) =>
          count-- > need ? "-" : m,
        );
        changed = true;
      }
    }
  }
  if (hand[rec.productId] && hand[rec.productId][lang]) {
    hand[rec.productId][lang].name = t.name;
    hand[rec.productId][lang].description = t.description;
  }
  if (changed) n++;
}
console.log("records fixed:", n);
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
