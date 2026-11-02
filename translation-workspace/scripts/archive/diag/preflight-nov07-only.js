// Preflight only the 5 leak-affected records (fast)
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
const tails = ["c69b", "c6a5", "c7e3", "c7ed"];
const slice = importData.records.filter((r) =>
  tails.some((t) => r.productId.endsWith(t)),
);
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
  ok++;
}
out.push(`c6a4/c69b/c6a5/c7e3/c7ed slice: ok=${ok} leaks=${leaks}`);
fs.appendFileSync(
  path.join(WS, "logs", "preflight-nov08-fast.txt"),
  out.join("\n") + "\n",
  "utf8",
);
console.log(out.join("\n"));
