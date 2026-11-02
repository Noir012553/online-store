// Inspect leaked tech strings for c921/c929/c63e
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const src = fs.readFileSync(
  path.join(WS, "data", "sources-for-translation-next.txt"),
  "utf8",
);
const imp = JSON.parse(
  fs.readFileSync(
    path.join(WS, "data", "import", "assistant-batch-import-nov06f.json"),
    "utf8",
  ),
);
const blocks = src.split("===== PRODUCT ").slice(1);
const byPid = new Map(blocks.map((b) => [b.match(/^([0-9a-f]+)/)[1], b]));
const out = [];
for (const pid of ["c921", "c929", "c63e"]) {
  const full = Object.keys(byPid).find((k) => k.endsWith(pid));
  const b = byPid.get(full);
  if (!b) {
    out.push("==== MISSING " + pid);
    continue;
  }
  const tm = b.match(/TECH_DESCRIPTION \(verbatim\):\n(.*)/);
  out.push("==== " + pid + " (" + full + ")");
  out.push(tm[1]);
  for (const r of imp.records) {
    if (r.productId === full) {
      out.push(
        "REC " + r.targetLang + ": " + r.translations.technicalDescription,
      );
    }
  }
}
fs.writeFileSync(
  path.join(WS, "logs", "leak-inspect.txt"),
  out.join("\n"),
  "utf8",
);
console.log("written logs/leak-inspect.txt");
