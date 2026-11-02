// Cross-language spec consistency check: every language's specs must equal the
// source specs (immutable technical values).
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
const issues = [];
for (const rec of batch.records) {
  if (!rec.source || !rec.translations) continue;
  const src = rec.source.specs || {};
  const tr = rec.translations.specs || {};
  for (const [k, v] of Object.entries(src)) {
    if (String(tr[k] ?? "").trim() !== String(v).trim()) {
      issues.push(
        `${rec.productId.slice(-4)}/${rec.targetLang} spec ${k}: src="${v}" tr="${tr[k]}"`,
      );
    }
  }
  // brand must match
  if (rec.translations.brand !== rec.source.brand) {
    issues.push(
      `${rec.productId.slice(-4)}/${rec.targetLang} brand: src="${rec.source.brand}" tr="${rec.translations.brand}"`,
    );
  }
  // promotions must keep type
  (rec.translations.promotions || []).forEach((p, i) => {
    const sp = (rec.source.promotions || [])[i];
    if (!p.type || p.type !== sp?.type) {
      issues.push(
        `${rec.productId.slice(-4)}/${rec.targetLang} promo[${i}]: type missing/differs`,
      );
    }
  });
}
console.log("issues:", issues.length);
issues.forEach((i) => console.log(" -", i));
require("fs").writeFileSync(
  path.join(__dirname, "..", "logs", "consistency-last.txt"),
  issues.join("\n") + "\n",
  "utf8",
);
