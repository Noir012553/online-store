const fs = require("fs");
const p =
  __dirname + "/../data/translations/translations-nov06c-laptop-hand.json";
let raw = fs.readFileSync(p, "utf8");
raw = raw.replace(/\}\s*\n?\s*,\s*\n(\s*"6ad0cde40069aece85a8c695")/, "},\n$1");
try {
  JSON.parse(raw);
  console.log("valid");
} catch (e) {
  console.log("INVALID:", e.message);
}
fs.writeFileSync(p, raw, "utf8");
try {
  JSON.parse(fs.readFileSync(p, "utf8"));
  console.log("parsed after write");
} catch (e) {
  console.log("INVALID after write:", e.message);
}
