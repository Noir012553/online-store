// Fix nov10 pass12 (c728 REAL root causes):
//  - name: source name normalized token set INCLUDES lone "f" — from
//    "phím"? No: token regex `[A-Za-z]+\d+...`? "f" alone can't match…
//    Validator found "f" via getPlainTechnicalTokenCounts which likely uses
//    a DIFFERENT extraction: single letters following digits etc. Empirical:
//    adding literal " f" segment? Better: inspect checkTechnicalTokens on
//    identical strings — if identical strings STILL error, the validator is
//    comparing source.name vs translations.name with different lengths?
//    They ARE identical. So the "f" token must come from LENGTH difference
//    in some config path (SKIP...). Actually maybe checkTechnicalTokens
//    strips VN diacritics: "phím"→"phim"; then TOKEN regex on "phim"→ no.
//    Hmm "F87 TM (...) F873W": raw token regex [A-Za-z]+\d+ matches "F87",
//    "F873W". Where's lone "f"?? getPlainTechnicalTokenCounts might split
//    trailing letters: "F873W"→"f873"+"w"? then source has w too... tr==src
//    should always be parity. UNLESS the validator call signature is
//    (source, translated) but for NAME field the ROUTE passes
//    (source.name, translations.name) where translations.name is OUR string
//    but source.name is truncated?? Test parity with truly identical:
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const BACKEND = path.resolve(WS, "..", "online-store-backend");
const validator = require(
  path.join(BACKEND, "src", "utils", "translationValidator.js"),
);
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

const r = d.records.find(
  (x) => x.productId.endsWith("c728") && x.targetLang === "en",
);
console.log(
  "identical test:",
  JSON.stringify(validator.checkTechnicalTokens(r.source.name, r.source.name)),
);
console.log(
  "curr test:",
  JSON.stringify(
    validator.checkTechnicalTokens(r.source.name, r.translations.name),
  ),
);
console.log(
  "src len",
  r.source.name.length,
  "tr len",
  r.translations.name.length,
);

// tech fix: revert "2.4GHz"→"2.4G"? source tech: "2.4GHz" appears? tr has
// unexpected 4G — tr tech likely has "2.4G" WITHOUT Hz (pass11 set to 2.4G),
// validator splits "2.4G"→unit? no, unit needs GHz... "2.4G" → token "4G"!
// Source tech verbatim uses "2.4GHz"? Print:
console.log("SRC tech:", JSON.stringify(r.source.technicalDescription));
console.log("TR  tech:", JSON.stringify(r.translations.technicalDescription));
