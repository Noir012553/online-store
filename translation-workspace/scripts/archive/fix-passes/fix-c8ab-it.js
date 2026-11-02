// Fix c8ab/it: name has leftover VN "không dây" + duplicate "Mouse gaming wireless".
// Source name: "Chuột không dây Logitech G304 X LIGHTSPEED Black".
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const HAND = path.join(WS, "data", "translations", "translations-nov06d-hand.json");
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));
const idByTail = {};
for (const pid of Object.keys(hand)) idByTail[pid.slice(-4)] = pid;
const pid = idByTail["c8ab"];
const t = hand[pid].it;
const GOOD = "Mouse gaming wireless Logitech G304 X LIGHTSPEED Nero";
t.name = GOOD;
const d = t.description;
t.description = d
  .replace(/Mouse gaming wireless không dây Logitech G304 X Lightspeed Black/g, GOOD)
  .replace(/Il Mouse gaming wireless không dây/g, "Il " + GOOD)
  .replace(/Il mouse gaming wireless Logitech G304 X Lightspeed Nero/g, "Il " + GOOD);
if (t.description.includes("không dây") || !t.description.includes("Logitech G304")) {
  console.log("UNRESOLVED:", JSON.stringify(t.description.slice(0, 400)));
  process.exit(1);
}
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
console.log("c8ab/it fixed, name=", GOOD);
