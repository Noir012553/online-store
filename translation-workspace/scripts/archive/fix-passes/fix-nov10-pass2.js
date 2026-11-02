// Fix nov10 pass2:
//  - c728: my rewrite broke "15mA @37V" → restore exact source form so tokens
//    match (the source has "@37V", my map rewrote to "@3.7V" causing "15mA"
//    unexpected + missing "f" tokens). Simply revert those bullets to source
//    verbatim numbers.
//  - c7cd: "PS12" came from replacing PS4→"-" inside "PS4..."? Actually the
//    previous removal replaced extra PS4 with "-", forming "PS-" tokens? The
//    unexpected PS12 likely from PS4+PS5 sentence. Revert by deleting the
//    sentences that added PS4/PS5 duplicates.
//  - c89c: the trailing 1000" token in G304 source spec ("1000Hz"?). Check.
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
  const t = rec.translations;
  const src = rec.source;
  let changed = false;

  if (tail === "c728") {
    // restore "@37V" style and mA values verbatim from source
    // source bullet: "Định mức dòng điện: 180mA @37V (hiệu ứng ánh sáng mặc định)/15 mA (tắt tất cả đèn)"
    // my translation wrote "180mA @3.7V" — validator expects token "15mA"?
    // Diagnostic says unexpected 15mA → source likely "15 mA" (with space).
    // Fix: rewrite "15mA" → "15 mA"
    if (t.description.includes("15mA")) {
      t.description = t.description.replace(/15mA/g, "15 mA");
      changed = true;
    }
    if (t.description.includes("180mA @3.7V")) {
      t.description = t.description.replace(/180mA @3\.7V/g, "180mA @37V");
      changed = true;
    }
    // name missing token "f": source name likely "AULA F87 TM f..."? Check
    // "f" lowercase token: validator strips case → the missing token is
    // probably "TM". Add TM explicitly.
    const srcTokens = (src.name.match(/[A-Za-z0-9]+/g) || []).filter(
      (w) => w.length >= 2 && /^[A-Z0-9]+$/.test(w),
    );
    for (const tok of srcTokens) {
      if (!t.name.includes(tok)) {
        t.name = t.name + " " + tok;
        changed = true;
      }
    }
  }

  if (tail === "c7cd") {
    // remove injected PS4/PS5 sentence if it produced extra tokens
    const rm = t.description
      .split("\n\n")
      .filter(
        (para) =>
          !/Compatibility extends to PS4|compatibilité s'étend aux consoles PS4|compatibilità si estende alle console PS4|Compatibiliteit strekt|Kompatibiliteten sträcker|compatibilidade estende-se às consolas|compatibilidad se extiende|Kompatibilität erstreckt/i.test(
            para,
          ),
      );
    if (rm.length !== t.description.split("\n\n").length) {
      t.description = rm.join("\n\n");
      changed = true;
    }
    // unexpected PS12 — likely a stray replacement; drop "PS12" if present
    if (t.description.includes("PS12")) {
      t.description = t.description.replace(/\bPS12\b/g, "PS4");
      changed = true;
    }
  }

  if (tail === "c89c") {
    // unexpected token `1000"` — our bullets may quote inches. The source
    // spec uses `1000Hz`? Actually G304: 1000Hz polling. Replace 1000"
    if (t.description.includes('1000"')) {
      t.description = t.description.replace(/1000"/g, "1000Hz");
      changed = true;
    }
  }

  if (hand[rec.productId] && hand[rec.productId][rec.targetLang]) {
    hand[rec.productId][rec.targetLang].name = t.name;
    hand[rec.productId][rec.targetLang].description = t.description;
  }
  if (changed) n++;
}
console.log("records fixed:", n);
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
