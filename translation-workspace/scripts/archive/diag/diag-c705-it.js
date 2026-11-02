// Fix c705:it — "cổng kết nối" leak: my Italian desc kept Vietnamese phrase
// "cổng kết nối". Locate and replace.
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
const pid = idByTailLang["c705:it"];
const t = hand[pid].it;
const i = t.description.toLowerCase().indexOf("cổng kết nối");
console.log("idx:", i);
if (i >= 0)
  console.log(
    JSON.stringify(t.description.slice(Math.max(0, i - 120), i + 100)),
  );
