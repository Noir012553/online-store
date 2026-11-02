// c770/fr name: "Bàn phím cơ DareU Leaven K870 Three-Mode Switch dễ Space
// Gray" — "dễ" belongs to VN "Switch dễ gõ" phrase. Rewrite name properly in
// French and strip residual words.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const HAND = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06e-hand.json",
);
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));
let fr = null;
for (const [pid, langs] of Object.entries(hand)) {
  if (pid.endsWith("c770") && langs.fr) fr = langs.fr;
}
if (!fr) {
  console.error("not found");
  process.exit(1);
}
console.log("before:", JSON.stringify(fr.name));
// rebuild from a clean French product name
fr.name = "Clavier mécanique DareU Leaven K870 Three-Mode Space Gray";
fr.description = (fr.description || "")
  .replace(/switch dễ/gi, "switch")
  .replace(/Switch dễ/g, "Switch")
  .replace(/dễ\s*/g, "");
fr.imageAlts = (fr.imageAlts || []).map((a) =>
  a.replace(/switch dễ/gi, "switch").replace(/dễ\s*/g, ""),
);
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
console.log("after:", JSON.stringify(fr.name));
