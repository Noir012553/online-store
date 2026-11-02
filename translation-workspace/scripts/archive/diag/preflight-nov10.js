// Preflight nov10 — leak + brand + tech/markup scan on all 40 records.
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const BACKEND = path.resolve(WS, "..", "online-store-backend");
const validator = require(
  path.join(BACKEND, "src", "utils", "translationValidator.js"),
);
const importData = JSON.parse(
  fs.readFileSync(
    path.join(WS, "data", "import", "assistant-batch-import-nov10.json"),
    "utf8",
  ),
);
const out = [];
let leaks = 0,
  brandMiss = 0,
  tech = 0,
  ok = 0;
for (const rec of importData.records) {
  const lang = rec.targetLang,
    src = rec.source,
    trs = rec.translations;
  const errs = [];
  for (const f of ["name", "description", "technicalDescription"]) {
    const wl = validator.checkSourceLanguageLeak(
      src[f] || "",
      trs[f] || "",
      lang,
      f,
    );
    if (wl) errs.push(`${f}/leak:${wl.phrase}`);
    const tt = validator.checkTechnicalTokens(src[f] || "", trs[f] || "");
    if (tt) errs.push(`${f}/tech:${tt.error}:${tt.token}`);
    const mk = validator.checkMarkup(src[f] || "", trs[f] || "");
    if (mk) errs.push(`${f}/markup`);
  }
  if (errs.length) {
    if (errs.some((e) => e.includes("/leak"))) leaks++;
    if (errs.some((e) => e.includes("/tech"))) tech++;
    out.push(`ERR ${rec.productId.slice(-4)}/${lang} ${errs.join(" | ")}`);
    continue;
  }
  const brandSet = new Set();
  for (const m of (src.description + " " + src.name).matchAll(
    /\b(AULA|Aula|ASUS|ROG|Akko|AKKO|Corsair|DareU|Logitech|Razer|Rapoo|MSI|HyperX|HYPERX|HP|Glorious|Attack Shark|MCHOSE|KIIBOOM|Lofree|Intel|AMD|NVIDIA|iPad|MacBook|Acer|Lenovo|Dell|SteelSeries|Keychron|Ducky|Varmilo|CHERRY|Cooler Master)\b/g,
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
out.push(`total: ok=${ok} leaks=${leaks} tech=${tech} brandMiss=${brandMiss}`);
fs.writeFileSync(
  path.join(WS, "logs", "preflight-nov10.txt"),
  out.join("\n"),
  "utf8",
);
console.log(out.slice(-12).join("\n"));
