// Fix c6f8/it markup: the connectivity regex didn't match; append the bullet
// at the very end before final CTA paragraph, or simply insert after intro.
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
if (!t.description.includes("&lt;=")) {
  const line =
    "Specifiche elettriche: tensione/corrente di ricarica DC 5V/ &lt;= 500mA, tempo di ricarica circa 8.5 ore; tensione nominale DC 3.7V (piena 4.2V) con batteria al litio da 4000 mAh.";
  // Insert after the intro paragraph (2nd \n\n block ends)
  const firstBreak = t.description.indexOf("\n\n");
  const secondBreak = t.description.indexOf("\n\n", firstBreak + 2);
  t.description =
    t.description.slice(0, secondBreak) +
    "\n\n" +
    line +
    t.description.slice(secondBreak);
}
fs.writeFileSync(HAND_ACC, JSON.stringify(hand, null, 2) + "\n", "utf8");
console.log("c6f8/it &lt;= present:", t.description.includes("&lt;="));
