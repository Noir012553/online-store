// Diag c891: run the REAL validator via validateTranslation.
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const BACKEND = path.resolve(WS, "..", "online-store-backend");
const V = require(
  path.join(BACKEND, "src", "utils", "translationValidator.js"),
);
const inst = V; // module itself is the validator instance
const d = JSON.parse(
  fs.readFileSync(
    path.join(WS, "data", "import", "assistant-batch-import-nov09.json"),
    "utf8",
  ),
);
const inst = typeof Cls === "function" ? new Cls() : Cls;
if (!inst || typeof inst.validateTranslation !== "function") {
  console.log("no validateTranslation found; exports detail:");
  for (const k of Object.keys(V))
    console.log(
      " ",
      k,
      typeof V[k],
      V[k] && Object.getOwnPropertyNames(V[k]).slice(0, 10),
    );
  process.exit(1);
}
for (const rec of d.records.filter((r) => r.productId.endsWith("c891"))) {
  const res = inst.validateTranslation(
    rec.source,
    rec.translations,
    rec.targetLang,
  );
  console.log(
    rec.targetLang,
    "score=" + res.qualityScore,
    JSON.stringify(res.errors),
  );
}
