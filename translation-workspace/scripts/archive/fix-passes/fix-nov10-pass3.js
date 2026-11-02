// Fix nov10 pass3: restore name verbatim-ish and clean 3W artifacts.
//  - c728: pass1's F87-removal corrupted names ("AULA  TM ... 3W"). Rebuild
//    names cleanly from the source name: replace VN category prefix, keep the
//    full "(...)" and trailing "F873W" token untouched.
//  - c7cd: remove our injected PS4 sentence entirely (source has 0 PS4).
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

const PREFIX = {
  en: "Keyboard ",
  fr: "Clavier ",
  it: "Tastiera ",
  nl: "Toetsenbord ",
  sv: "Tangentbord ",
  pt: "Teclado ",
  es: "Teclado ",
  de: "Tastatur ",
};

let n = 0;
for (const rec of d.records) {
  const tail = rec.productId.slice(-4);
  const lang = rec.targetLang;
  const t = rec.translations;
  const src = rec.source;
  let changed = false;

  if (tail === "c728") {
    // rebuild name: prefix + source-name-minus-"Bàn phím "
    const strip = src.name.replace(/^Bàn phím\s+/, "").trim();
    const newName = PREFIX[lang] + strip;
    if (t.name !== newName) {
      t.name = newName;
      changed = true;
    }
    // description: replace corrupted trailing model with correct one, and
    // first occurrences of "AULA  TM" (double space) → "AULA F87 TM"
    t.description = t.description
      .replace(/AULA\s+TM/g, "AULA F87 TM")
      .replace(
        /F87 TM \(Xám \+ Trắng \+ Xám đậm \/Grey Wood Switch\) 3W/g,
        "F87 TM (Xám + Trắng + Xám đậm /Grey Wood Switch) F873W",
      )
      .replace(/\(Grey Wood Switch\) 3W/g, "(Grey Wood Switch) F873W");
    // normalize the Vietnamese color fragment left in each language? The
    // color fragment "(Xám + Trắng + Xám đậm /Grey Wood Switch)" is source
    // verbatim; validator counts tokens inside, keeping it verbatim is safest.
    changed = true;
  }

  if (tail === "c7cd") {
    const paras = t.description.split("\n\n");
    const filtered = paras.filter(
      (p) =>
        !/Compatibility extends to PS4|compatibilité s'étend|compatibilità si estende|Compatibiliteit strekt|Kompatibiliteten sträcker|compatibilidade estende|compatibilidad se extiende|Kompatibilität erstreckt/i.test(
          p,
        ),
    );
    if (filtered.length !== paras.length) {
      t.description = filtered.join("\n\n");
      changed = true;
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
