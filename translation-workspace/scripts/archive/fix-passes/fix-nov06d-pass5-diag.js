// Fix pass 5: targeted iteration — dump full tech strings for c7c3/it and
// c8dc/nl, list every VN word match with context, and replace them.
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

const t1 = hand[idByTail["c7c3"]].it.technicalDescription;
console.log("=== c7c3/it tech:");
console.log(t1);
const t2 = hand[idByTail["c8dc"]].nl.technicalDescription;
console.log("=== c8dc/nl tech:");
console.log(t2);
