// Diag markup: show exact MARKUP_TOKEN sequence for c7ca/c891 src vs tr.
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const d = JSON.parse(
  fs.readFileSync(
    path.join(WS, "data", "import", "assistant-batch-import-nov09.json"),
    "utf8",
  ),
);
const PATTERN =
  /(?:<\/?[A-Za-z][^>]*>|&[A-Za-z0-9#]+;|\{\{[^}]+\}\}|\[[^\]]+\]\([^\)]+\))/g;
for (const rec of d.records) {
  const tail = rec.productId.slice(-4);
  if (tail !== "c7ca" && tail !== "c891") continue;
  const src = rec.source.description.match(PATTERN) || [];
  const tr = rec.translations.description.match(PATTERN) || [];
  console.log(tail + "/" + rec.targetLang);
  console.log("  SRC:", JSON.stringify(src));
  console.log("  TR :", JSON.stringify(tr));
}
