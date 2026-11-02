// Preflight nov07 — slice-based leak + brand scan to avoid console timeout.
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const BACKEND = path.resolve(WS, "..", "online-store-backend");
const validator = require(
  path.join(BACKEND, "src", "utils", "translationValidator.js"),
);
const importData = JSON.parse(
  fs.readFileSync(
    path.join(WS, "data", "import", "assistant-batch-import-nov07.json"),
    "utf8",
  ),
);
const from = Number(process.argv[2] || 0);
const to = Number(process.argv[3] || importData.records.length);
const slice = importData.records.slice(from, to);
const out = [];
let leaks = 0,
  brandMiss = 0,
  ok = 0;
for (const rec of slice) {
  const lang = rec.targetLang,
    src = rec.source,
    trs = rec.translations;
  const wlTech = validator.checkSourceLanguageLeak(
    src.technicalDescription || "",
    trs.technicalDescription || "",
    lang,
    "product_technical_description",
  );
  const wl =
    wlTech ||
    validator.checkSourceLanguageLeak(
      src.description,
      trs.description || "",
      lang,
      "product_description",
    );
  if (wl) {
    out.push(
      `LEAK ${rec.productId.slice(-4)}/${lang} ${JSON.stringify(wl.phrase)}`,
    );
    leaks++;
    continue;
  }
  const brandSet = new Set();
  for (const m of (src.description + " " + src.name).matchAll(
    /\b(AULA|ASUS|ROG|Akko|AKKO|Corsair|DareU|VEEKOS|Veekos|Logitech|Razer|Rapoo|MSI|HyperX|HYPERX|HP|Glorious|Attack Shark|MCHOSE|KIIBOOM|Lofree|Intel|AMD|NVIDIA|iPad|MacBook|Acer|Lenovo|Dell)\b/g,
  ))
    brandSet.add(m[1]);
  const missing = [...brandSet].filter(
    (x) =>
      !(trs.description || "").includes(x) && !(trs.name || "").includes(x),
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
  path.join(WS, "logs", "preflight-nov07.txt"),
  out.join("\n") + "\n",
  "utf8",
);
console.log(out.join("\n"));

