// Verify nov06d records in a slice [from, to) — fast enough for the 120s
// console window (~14 records × 3s ≈ 42s). Usage: node verify-nov06d-slice.js 0 14
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
const from = Number(process.argv[2] || 0);
const to = Number(process.argv[3] || b.records.length);
const slice = b.records.slice(from, to);
const out = [];
let leaks = 0,
  brandMiss = 0,
  ok = 0;
for (const rec of slice) {
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
  `slice [${from},${to}): ok=${ok} leaks=${leaks} brandMiss=${brandMiss}`,
);
fs.appendFileSync(
  path.join(WS, "logs", "verify-nov06d.txt"),
  out.join("\n") + "\n",
  "utf8",
);
console.log(out.join("\n"));
