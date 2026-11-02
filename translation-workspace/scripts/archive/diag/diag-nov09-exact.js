// Exact validator errors for the 17 pending nov09 records (c645 fr/pt/sv,
// c6c8 de/en/fr/pt/es/sv, c6ca de/en/fr/it/es/nl/pt/sv) using the import file.
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const BACKEND = path.resolve(WS, "..", "online-store-backend");
const validator = require(
  path.join(BACKEND, "src", "utils", "translationValidator.js"),
);
const d = JSON.parse(
  fs.readFileSync(
    path.join(WS, "data", "import", "assistant-batch-import-nov09.json"),
    "utf8",
  ),
);
const PENDING = [
  ["c645", "fr"],
  ["c645", "pt"],
  ["c645", "sv"],
  ["c6c8", "de"],
  ["c6c8", "en"],
  ["c6c8", "fr"],
  ["c6c8", "pt"],
  ["c6c8", "es"],
  ["c6c8", "sv"],
  ["c6ca", "de"],
  ["c6ca", "en"],
  ["c6ca", "fr"],
  ["c6ca", "it"],
  ["c6ca", "es"],
  ["c6ca", "nl"],
  ["c6ca", "pt"],
  ["c6ca", "sv"],
];
const out = [];
for (const r of d.records) {
  const tail = r.productId.slice(-4);
  if (!PENDING.some(([t, l]) => t === tail && l === r.targetLang)) continue;
  const src = r.source,
    tr = r.translations;
  // markup tokens diff
  const srcM =
    String(src.description || "").match(
      /(?:<\/?[A-Za-z][^>]*>|&[A-Za-z0-9#]+;|\{\{[^}]+\}\}|\[[^\]]+\]\([^\)]+\))/g,
    ) || [];
  const trM =
    String(tr.description || "").match(
      /(?:<\/?[A-Za-z][^>]*>|&[A-Za-z0-9#]+;|\{\{[^}]+\}\}|\[[^\]]+\]\([^\)]+\))/g,
    ) || [];
  // missing technical tokens in any field
  const miss = [];
  for (const [f, type] of [
    ["name", "product_name"],
    ["description", "product_description"],
    ["technicalDescription", "product_technical_description"],
  ]) {
    const e = validator.checkTechnicalTokens(src[f], tr[f]);
    if (e) miss.push(`${f}: ${e.error} token=${e.token}`);
  }
  out.push(
    `${tail}/${r.targetLang} srcMarkup=${JSON.stringify(srcM)} trMarkup=${JSON.stringify(trM)} tech=${miss.join("; ") || "ok"}`,
  );
}
fs.writeFileSync(
  path.join(WS, "logs", "diag-nov09-exact.txt"),
  out.join("\n"),
  "utf8",
);
console.log(out.join("\n"));
