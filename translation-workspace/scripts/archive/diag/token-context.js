// Show the exact source/translation snippets around each failing token.
const path = require("path");
const batch = require(
  path.join(
    __dirname,
    "..",
    "data",
    "import",
    "assistant-batch-import-next.json",
  ),
);
const validator = require(
  path.join(
    __dirname,
    "..",
    "..",
    "online-store-backend",
    "src",
    "utils",
    "translationValidator.js",
  ),
);

const interesting = new Set([
  "240H",
  "15.6 inch",
  "16 inch",
  '16"',
  "3ms",
  "1kg",
  "DDR5",
  "3D",
  "HDMI-2",
  "HDMI 2.1-poort",
]);
const out = [];
for (const rec of batch.records) {
  if (!rec.source || !rec.translations || !rec.translations.name) continue;
  const pairs = [
    ["desc", rec.source.description, rec.translations.description],
    [
      "tech",
      rec.source.technicalDescription,
      rec.translations.technicalDescription,
    ],
  ];
  for (const [field, s, t] of pairs) {
    // Match backend validator: description no longer token-checked.
    if (field === "desc") continue;
    const r = validator.checkTechnicalTokens(s, String(t || ""));
    if (r && interesting.has(r.token)) {
      // find the source occurrence
      const si = s.indexOf(r.token);
      const sCtx =
        si >= 0
          ? s.slice(Math.max(0, si - 50), si + 60).replace(/\n/g, " ")
          : "(not found)";
      out.push(
        `${rec.productId.slice(-4)}/${rec.targetLang} ${field} ${r.error} "${r.token}"`,
      );
      out.push(`   SRC: ${sCtx}`);
    }
  }
}
console.log(out.join("\n"));
require("fs").writeFileSync(
  path.join(__dirname, "..", "logs", "token-context-last.txt"),
  out.join("\n") + "\n",
  "utf8",
);
