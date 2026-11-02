const fs = require("fs");
const p = __dirname + "/gen-nov06d-translations.js";
let raw = fs.readFileSync(p, "utf8");
// Use the exported tech-obj.json module instead of parsing inline source.
raw = raw.replace(
  /const techSrc = src\.slice\([^\n]+\);\nglobalThis\.TECH = JSON\.parse\([^\n]+\);/,
  'const TECH = require("./tech-obj.json");',
);
// fallback: any leftover globalThis.TECH assignment
raw = raw.replace(/globalThis\.TECH = JSON\.parse\([^\n]+\);/, "");
fs.writeFileSync(p, raw, "utf8");
console.log(raw.slice(0, 400));
