// Fix c6a3/nl "để gaming" — Vietnamese connector "để" still lurking right
// before "gaming". Search description for the phrase to rewrite it.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const HAND = path.join(WS, "data", "translations", "translations-nov06e-hand.json");
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));
let nl = null, pidHit = null;
for (const [pid, langs] of Object.entries(hand)) {
  if (pid.endsWith("c6a3") && langs.nl) { nl = langs.nl; pidHit = pid; }
}
if (!nl) { console.error("not found"); process.exit(1); }
const low = nl.description.toLowerCase();
const idx = low.indexOf("để");
console.log("idx:", idx);
if (idx >= 0) console.log("ctx:", JSON.stringify(nl.description.slice(Math.max(0, idx - 150), idx + 120)));
