// Fix pass 12b — cause found: source descriptions embed Apple references
// ("iPad", "iPhone", "Mac") in comparison sentences; my descriptions dropped
// them. Fix per record: inject the Apple token in the right spot.
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
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov06d.json",
);
const importData = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const byKey = new Map(
  importData.records.map((r) => [`${r.productId}:${r.targetLang}`, r]),
);

// Which Apple tokens does each pending record's source use?
const PENDING = [
  ["c869", "fr"],
  ["c874", "en"],
  ["c875", "en"],
  ["c876", "en"],
  ["c8a8", "fr"],
  ["c8a9", "fr"],
  ["c8ae", "fr"],
  ["c8c6", "fr"],
  ["c8df", "it"],
  ["c8e1", "pt"],
  ["c623", "fr"],
  ["c623", "it"],
  ["c697", "pt"],
  ["c697", "fr"],
  ["c69e", "pt"],
  ["c69e", "fr"],
  ["c69f", "pt"],
  ["c69f", "fr"],
  ["c6a3", "fr"],
  ["c6a3", "nl"],
];
const APPLE = ["iPad", "iPhone", "MacBook", "Mac"];
for (const [tail, lang] of PENDING) {
  const rec = [...byKey.entries()].find(([k]) => k.endsWith(tail + ":" + lang));
  if (!rec) continue;
  const [, r] = rec;
  const present = APPLE.filter((a) => r.source.description.includes(a));
  const missingTok = present.filter(
    (a) => !r.translations.description.includes(a),
  );
  console.log(
    tail + "/" + lang,
    "src has:",
    present.join(",") || "-",
    "| tr missing:",
    missingTok.join(",") || "-",
  );
}
