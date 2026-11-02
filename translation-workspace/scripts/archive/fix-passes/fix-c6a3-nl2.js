// Fix c6a3/nl pass 2 — real leak was "De ASUS TUF Gaming A14 FA401GM RG013W
// de NVIDIA GeForce..." — missing verb creates the Vietnamese-source bigram
// chain. Rewrite that sentence properly in Dutch.
const path = require("path");
const fs = require("fs");
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
const from =
  "De ASUS TUF Gaming A14 FA401GM RG013W de NVIDIA GeForce RTX 5060 8GB GDDR7 grafische kaart plus een AMD-processor leveren stabiele gamingprestaties.";
const to =
  "De ASUS TUF Gaming A14 FA401GM RG013W combineert de NVIDIA GeForce RTX 5060 8GB GDDR7 grafische kaart met een AMD-processor voor stabiele gamingprestaties.";
if (!t.description.includes(from)) throw new Error("sentence not found");
t.description = t.description.replace(from, to);
fs.writeFileSync(HAND_ACC, JSON.stringify(hand, null, 2) + "\n", "utf8");
console.log("c6a3/nl sentence fixed");
