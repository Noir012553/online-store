// Preflight alts only — check mixed_language for descriptionImages
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const BACKEND = path.resolve(WS, "..", "online-store-backend");
const validator = require(
  path.join(BACKEND, "src", "utils", "translationValidator.js"),
);
const importData = JSON.parse(
  fs.readFileSync(
    path.join(WS, "data", "import", "assistant-batch-import-nov08.json"),
    "utf8",
  ),
);
const out = [];
let leaks = 0,
  ok = 0,
  empty = 0;
for (const rec of importData.records) {
  const lang = rec.targetLang;
  (rec.source.descriptionImages || []).forEach((img, i) => {
    const alt = String(img.alt || "");
    if (!alt.trim()) {
      empty++;
      return;
    }
    const ta = (rec.translations.descriptionImages || [])[i] || {};
    const trAlt = String(ta.alt ?? "");
    if (!trAlt.trim()) {
      empty++;
      return;
    }
    const wl = validator.checkSourceLanguageLeak(
      alt,
      trAlt,
      lang,
      "product_description_image_alt",
    );
    if (wl) {
      leaks++;
      out.push(
        `ALT LEAK ${rec.productId.slice(-4)}/${lang} alt.${i}: "${wl.phrase}"`,
      );
    } else ok++;
  });
}
out.push(`alt leaks: ${leaks}, alt ok: ${ok}, alt empty: ${empty}`);
fs.writeFileSync(
  path.join(WS, "logs", "preflight-alts.txt"),
  out.join("\n"),
  "utf8",
);
console.log(out.join("\n"));
