// Fix c6a3/nl — leak phrase "để asus tuf gaming" is a cross-boundary match:
// source "...Intel® + ASUS TUF Gaming..." (bigram "để asus tuf gaming"
// normalized) — my sentence "gebruikt de NVIDIA GeForce RTX 5060..." put
// "ASUS TUF Gaming" right after "de" ("...de ASUS TUF Gaming..." normalized =
// "... asus tuf gaming ..."). Insert an intermediate word to break it.
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
t.description = t.description.replace(
  "gebruikt de NVIDIA GeForce RTX 5060 8GB GDDR7 grafische kaart en een AMD processor voor stabiele gaming prestaties.",
  "de NVIDIA GeForce RTX 5060 8GB GDDR7 grafische kaart plus een AMD-processor leveren stabiele gamingprestaties.",
);
fs.writeFileSync(HAND_ACC, JSON.stringify(hand, null, 2) + "\n", "utf8");
console.log("c6a3/nl fixed");
