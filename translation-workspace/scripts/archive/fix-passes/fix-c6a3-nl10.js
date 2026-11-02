// Replace residual capitalized "Gaming laptop" (from brand line mentions).
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
let nl = null;
for (const [pid, langs] of Object.entries(hand)) {
  if (pid.endsWith("c6a3") && langs.nl) nl = langs.nl;
}
nl.name = nl.name.replace(/\s{2,}/g, " ");
nl.description = nl.description.replace(/Gaming laptop/g, "Gamelaptop");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
console.log("cleaned:", nl.name.slice(0, 40));
