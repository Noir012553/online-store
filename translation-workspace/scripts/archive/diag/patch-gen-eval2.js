const fs = require("fs");
const p = __dirname + "/gen-nov06d-translations.js";
let raw = fs.readFileSync(p, "utf8");
raw = raw.replace(
  /globalThis\.TECH = eval\([^\n]+\);/,
  'globalThis.TECH = JSON.parse(techSrc.slice(techSrc.indexOf("{")).replace(/,\\s*}/, "}").replace(/(\\w+)\\s*:/g, \'"$1":\'));',
);
fs.writeFileSync(p, raw, "utf8");
console.log("patched2");
