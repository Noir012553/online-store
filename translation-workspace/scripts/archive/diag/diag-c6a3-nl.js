// Fix c6a3/nl: the inject AMD/NVIDIA sentence added a new leak phrase
// "để asus tuf gaming" — my sentence had a punctuation/phrase issue. Locate +
// fix.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const HAND_ACC = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06e-hand.json",
);
const hand = JSON.parse(fs.readFileSync(HAND_ACC, "utf8"));
const idByTailLang = {};
for (const pid of Object.keys(hand)) {
  for (const lang of Object.keys(hand[pid]))
    idByTailLang[pid.slice(-4) + ":" + lang] = pid;
}
const pid = idByTailLang["c6a3:nl"];
const t = hand[pid].nl;
const i = t.description.toLowerCase().indexOf("asus tuf gaming");
console.log(JSON.stringify(t.description.slice(Math.max(0, i - 150), i + 120)));
