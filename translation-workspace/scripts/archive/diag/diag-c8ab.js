// Fix leak "không dây logitech" in c8ab/it: my Italian mouse template has the
// phrase "...wireless LIGHTSPEED..."? No — "Logitech" appears right after a
// VN "không dây" leftover inside the NAME mention. Locate and rewrite.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const HAND = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06d-hand.json",
);
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));
const idByTail = {};
for (const pid of Object.keys(hand)) idByTail[pid.slice(-4)] = pid;
const t = hand[idByTail["c8ab"]].it;
const d = t.description;
const j = d.toLowerCase().indexOf("logitech");
console.log(JSON.stringify(d.slice(Math.max(0, j - 200), j + 120)));
