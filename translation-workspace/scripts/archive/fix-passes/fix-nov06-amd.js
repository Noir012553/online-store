// Fix pass: restore "AMD" brand token in c5fb pt/fr/it/es descriptions
// (validator checkMissingBrand; source says "vi xử lý AMD Ryzen").
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const DATA = path.join(WS, "data");
const load = (p) => {
  let raw = fs.readFileSync(p, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  return JSON.parse(raw);
};
const save = (p, d) =>
  fs.writeFileSync(p, JSON.stringify(d, null, 2) + "\n", "utf8");

const FIXES = {
  pt: [
    // "o processador AMD Ryzen" / "CPU AMD Ryzen" variants
    [/(processador|CPU|cpu)\s+(?![A-Z]*AMD\s)(Ryzen)/g, "$1 AMD $2"],
  ],
  fr: [[/(processeur|CPU)\s+(?![A-Z]*AMD\s)(Ryzen)/g, "$1 AMD $2"]],
  it: [[/(processore|CPU)\s+(?![A-Z]*AMD\s)(Ryzen)/g, "$1 AMD $2"]],
  es: [[/(procesador|CPU)\s+(?![A-Z]*AMD\s)(Ryzen)/g, "$1 AMD $2"]],
};

for (const lang of Object.keys(FIXES)) {
  const p = path.join(DATA, "translations", `translations-next3-${lang}.json`);
  const d = load(p);
  const t = d["6ad0ca970069aece85a8c5fb"][lang];
  const before = t.description;
  for (const [re, rep] of FIXES[lang])
    t.description = t.description.replace(re, rep);
  save(p, d);
  console.log(
    lang,
    "AMD present:",
    t.description.includes("AMD"),
    "(was:",
    before.includes("AMD") + ")",
  );
}
