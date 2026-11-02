// Scan all translations of the next batch with the REAL validator regex:
// every plain technical token of the source must appear in the translation
// as a standalone token (not glued to other chars with '-').
const path = require("path");
const TECHNICAL_TOKEN_PATTERN =
  /(?<![\p{L}\d])(?:[A-Za-z]{2,}-\d+[A-Za-z\d-]*|[A-Z]{2,}\s+\d{3,}[A-Za-z\d-]*|[A-Z]{2,}\s+\d+(?:[.,]\d+)?-[A-Za-z0-9-]+|\d+(?:[.,]\d+)?\s?(?:GB|TB|MB|GHz|MHz|Hz|mm|cm|inch(?:es)?|in|W|V|%|["″])|[A-Za-z]+\d+[A-Za-z\d-]*|\d+(?!(?:st|nd|rd|th)(?![\p{L}\d]))[A-Za-z][A-Za-z\d-]*)(?![\p{L}\d])/gu;
const normalize = (t) =>
  t.toLocaleLowerCase().replace(/\s+/g, "").replace(/,/g, ".");
const counts = (s) => {
  const m = new Map();
  for (const t of String(s || "").match(TECHNICAL_TOKEN_PATTERN) || []) {
    // exclude unit-suffixed tokens from the plain count (mirrors validator)
    const UNIT_SUFFIX =
      /\d+(?:[.,]\d+)?\s?(?:GB|TB|MB|GHz|MHz|Hz|mm|cm|inch(?:es)?|in|W|V|%|["″])$/iu;
    if (UNIT_SUFFIX.test(t)) continue;
    const k = normalize(t);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
};
const batch = require(
  path.join(
    __dirname,
    "..",
    "data",
    "import",
    "assistant-batch-import-next.json",
  ),
);
const issues = [];
for (const rec of batch.records) {
  if (!rec.source || !rec.translations || !rec.translations.name) continue;
  const pairs = [
    ["name", rec.source.name, rec.translations.name],
    ["description", rec.source.description, rec.translations.description],
    [
      "technicalDescription",
      rec.source.technicalDescription,
      rec.translations.technicalDescription,
    ],
    ...Object.entries(rec.source.specs || {}).map(([k, v]) => [
      `spec.${k}`,
      String(v),
      String(rec.translations.specs?.[k] ?? ""),
    ]),
  ];
  for (const [field, src, tr] of pairs) {
    const sc = counts(src),
      tc = counts(tr);
    for (const [token, count] of sc) {
      if ((tc.get(token) || 0) < count) {
        issues.push(
          `${rec.productId.slice(-4)}/${rec.targetLang} ${field}: missing "${token}" x${count} (have ${tc.get(token) || 0})`,
        );
      }
    }
  }
}
console.log("issues:", issues.length);
issues.forEach((i) => console.log(" -", i));
require("fs").writeFileSync(
  path.join(__dirname, "..", "logs", "token-scan-last.txt"),
  issues.join("\n") + "\n",
  "utf8",
);
