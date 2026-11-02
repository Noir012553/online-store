// Verify nov06d — logs to file (checkSourceLanguageLeak can be slow on 69
// records × long descriptions; avoid the 120s console timeout by writing
// results incrementally to logs/verify-nov06d.txt).
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const BACKEND = path.resolve(WS, "..", "online-store-backend");
const validator = require(
  path.join(BACKEND, "src", "utils", "translationValidator.js"),
);
const b = JSON.parse(
  fs.readFileSync(
    path.join(WS, "data", "import", "assistant-batch-import-nov06d.json"),
    "utf8",
  ),
);
const out = [];
let leaks = 0,
  brandMiss = 0,
  ok = 0;
for (const rec of b.records) {
  const lang = rec.targetLang,
    src = rec.source,
    tr = rec.translations;
  const wl = validator.checkSourceLanguageLeak(
    src.description,
    tr.description || "",
    lang,
    "product_description",
  );
  if (wl) {
    leaks++;
    out.push(
      `LEAK ${rec.productId.slice(-4)}/${lang} ${JSON.stringify(wl.phrase)}`,
    );
    continue;
  }
  const brandSet = new Set();
  for (const m of (src.description + " " + src.name).matchAll(
    /\b(AULA|ASUS|ROG|Akko|AKKO|Corsair|DareU|VEEKOS|Veekos|Logitech|Razer|Rapoo|MSI|HyperX|HYPERX|HP|Glorious|Attack Shark|MCHOSE|KIIBOOM|Lofree|Gluetok|XANOVA|AK810|VXE|ATK|FANTECH|FTIDE)\b/g,
  ))
    brandSet.add(m[1]);
  const missing = [...brandSet].filter(
    (x) => !(tr.description || "").includes(x) && !(tr.name || "").includes(x),
  );
  if (missing.length) {
    brandMiss++;
    out.push(
      `BRAND ${rec.productId.slice(-4)}/${lang} missing: ${missing.join(",")}`,
    );
    continue;
  }
  ok++;
}
out.push(
  `ok=${ok} leaks=${leaks} brandMiss=${brandMiss} / total ${b.records.length}`,
);
fs.writeFileSync(
  path.join(WS, "logs", "verify-nov06d.txt"),
  out.join("\n"),
  "utf8",
);
console.log("done -> logs/verify-nov06d.txt");
