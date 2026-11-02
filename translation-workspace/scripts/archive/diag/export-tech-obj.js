const fs = require("fs");
const src = fs.readFileSync(
  __dirname + "/gen-accessory-translations.js",
  "utf8",
);
const start = src.indexOf("const TECH = {");
const end = src.indexOf("\n};", start) + 2;
const block = src.slice(start, end);
// Convert JS object literal to JSON via Function eval (safe local).
const TECH = new Function(
  "return (" + block.replace("const TECH =", "") + ")",
)();
fs.writeFileSync(
  __dirname + "/tech-obj.json",
  JSON.stringify(TECH, null, 1),
  "utf8",
);
console.log("tech-obj.json written with langs:", Object.keys(TECH).join(","));
