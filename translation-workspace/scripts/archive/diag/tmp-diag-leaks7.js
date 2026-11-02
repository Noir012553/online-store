// Diagnose the 7 remaining leaks in nov06f import file.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const d = JSON.parse(
  fs.readFileSync(
    path.join(WS, "data", "import", "assistant-batch-import-nov06f.json"),
    "utf8",
  ),
);
const targets = [
  ["c907", "it"],
  ["c637", "es"],
  ["c63e", "fr"],
  ["c63e", "nl"],
  ["c760", "es"],
  ["c781", "it"],
  ["c7aa", "es"],
];
const out = [];
for (const [tail, lang] of targets) {
  const r = d.records.find(
    (x) => x.productId.endsWith(tail) && x.targetLang === lang,
  );
  if (!r) {
    out.push(`--- ${tail}/${lang}: NOT FOUND`);
    continue;
  }
  const s = r.source.description;
  const t = r.translations.description;
  out.push(`--- ${tail}/${lang}`);
  const srcM = s.match(/.{0,70}(sử|để|dễ).{0,70}/);
  out.push(
    "SRC: " + (srcM ? srcM[0].replace(/\n/g, " ") : "(no vn word in src)"),
  );
  const trM = t.match(/.{0,70}(sử|để|dễ).{0,70}/);
  out.push("TR : " + (trM ? trM[0].replace(/\n/g, " ") : "(no vn word in tr)"));
}
fs.writeFileSync(
  path.join(WS, "logs", "diag-leaks7.txt"),
  out.join("\n") + "\n",
  "utf8",
);
console.log(out.join("\n"));
