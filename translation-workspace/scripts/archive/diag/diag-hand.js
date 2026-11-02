// Repair tool: diagnose the broken hand JSON.
const fs = require("fs");
const raw = fs.readFileSync(path0(), "utf8");
function path0() {
  return require("path").join(
    __dirname,
    "..",
    "data",
    "translations",
    "translations-nov06b-hand.json",
  );
}
const i = raw.indexOf("AG14-I71M-977M (Ultra 9-185H");
console.log(JSON.stringify(raw.slice(i - 80, i + 260)));
