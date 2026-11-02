// Fix c6f8/it: restore "&lt;=" markup token — the source has
// "Điện áp/dòng sạc: DC 5V/ &lt;= 500mA" and my translation has the charging
// sentence without the "&lt;=". Patch it.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const HAND_ACC = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06c-hand.json",
);
const hand = JSON.parse(fs.readFileSync(HAND_ACC, "utf8"));
const t = hand["6ad0cff40069aece85a8c6f8"].it;

// Locate Italian charging phrase and insert the markup exactly.
// Print context first to patch precisely.
const idx = t.description.search(/ricarica|5V|500\s?mA/i);
console.log(
  "ctx:",
  JSON.stringify(t.description.slice(Math.max(0, idx - 150), idx + 200)),
);
