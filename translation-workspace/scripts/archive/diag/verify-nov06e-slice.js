// Preflight nov06e — tech leak + brand scan + sample mixed-language, written
// in slices to avoid the 120s console window (validation is slow).
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const BACKEND = path.resolve(WS, "..", "online-store-backend");
const validator = require(
  path.join(BACKEND, "src", "utils", "translationValidator.js"),
);
const b = JSON.parse(
  fs.readFileSync(
    path.join(WS, "data", "import", "assistant-batch-import-nov06e.json"),
    "utf8",
  ),
);
const from = Number(process.argv[2] || 0);
const to = Number(process.argv[3] || b.records.length);
const slice = b.records.slice(from, to);
const out = [];
let leaks = 0,
  brandMiss = 0,
  techOk = 0,
  ok = 0;
for (const rec of slice) {
  const lang = rec.targetLang,
    src = rec.source,
    trs = rec.translations;
  // 1. tech leak
  const wlTech = validator.checkSourceLanguageLeak(
    src.technicalDescription || "",
    trs.technicalDescription || "",
    lang,
    "product_technical_description",
  );
  if (wlTech) {
    out.push(
      `TECHLEAK ${rec.productId.slice(-4)}/${lang} ${JSON.stringify(wlTech.phrase)}`,
    );
    leaks++;
    continue;
  }
  // 2. desc leak
  const wl = validator.checkSourceLanguageLeak(
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
  // 3. brand scan
  const brandSet = new Set();
  for (const m of (src.description + " " + src.name).matchAll(
    /\b(AULA|ASUS|ROG|Akko|AKKO|Corsair|DareU|VEEKOS|Veekos|Logitech|Razer|Rapoo|MSI|HyperX|HYPERX|HP|Glorious|Attack Shark|MCHOSE|KIIBOOM|Lofree|Gluetok|XANOVA|AK810|VXE|ATK|FANTECH|FTIDE|Intel|AMD|NVIDIA|iPad|MacBook)\b/g,
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
  path.join(WS, "logs", "verify-nov06e.txt"),
  out.join("\n") + "\n",
  "utf8",
);
console.log(out.join("\n"));
