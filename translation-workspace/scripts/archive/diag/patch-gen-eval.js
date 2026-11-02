const fs = require("fs");
const p = __dirname + "/gen-nov06d-translations.js";
let raw = fs.readFileSync(p, "utf8");
raw = raw.replace(
  /eval\(techSrc\);/,
  'globalThis.TECH = eval("(" + techSrc.slice(techSrc.indexOf("{")) + ")");',
);
fs.writeFileSync(p, raw, "utf8");
console.log("patched");
