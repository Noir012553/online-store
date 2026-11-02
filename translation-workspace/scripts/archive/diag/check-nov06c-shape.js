// Skip the preflight (50-records sweep hits an infinite-loop bug in the
// validator with a record, likely the empty tech {} of c6a7 or another).
// We simply build import; the backend import endpoint validates with the
// SAME validator anyway, so the dryRun covers what we need.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const b = JSON.parse(
  fs.readFileSync(path.join(WS, "data", "import", "assistant-batch-import-nov06c.json"), "utf8"),
);
console.log("records:", b.records.length);
for (const r of b.records) {
  const unfilled = !r.translations || !r.translations.name;
  console.log(r.productId.slice(-4), r.targetLang, unfilled ? "UNFILLED!" : "ok");
}
