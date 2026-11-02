const fs = require("fs");
let raw = fs.readFileSync(__dirname + "/fix-nov06b-preflight.js", "utf8");
raw = raw.replace(
  /kich_thuoc_man_hinh: "[^"]*\\\\"[^"]*"/g,
  "kich_thuoc_man_hinh: '15.6 \"'",
);
fs.writeFileSync(__dirname + "/fix-nov06b-preflight.js", raw, "utf8");
console.log("patched");
