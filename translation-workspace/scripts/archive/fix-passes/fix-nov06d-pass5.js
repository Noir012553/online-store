// Fix pass 5b: targeted fixes for values with remaining VN words.
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

// c7c3/it: "Tay cầm chơi game" → "Controller"
hand[idByTail["c7c3"]].it.technicalDescription = hand[
  idByTail["c7c3"]
].it.technicalDescription.replace("Tay cầm chơi game", "Controller");
// c8dc/nl values: "Xám;wit"→"Grijs;wit" (Dutch); "Đa Verbinding"→"Draadloos";
// "batterij sạc Li-ion" → "batterij Li-ion (oplaadbaar)"
hand[idByTail["c8dc"]].nl.technicalDescription = hand[
  idByTail["c8dc"]
].nl.technicalDescription
  .replace("Xám;wit", "Grijs;wit")
  .replace("Đa Verbinding", "Draadloos")
  .replace("batterij sạc Li-ion", "batterij Li-ion");

// Also translate the same keys in the specs block for these records:
const s1 = hand[idByTail["c7c3"]].it.specs;
if (s1["ket_noi_type"])
  s1["ket_noi_type"] = s1["ket_noi_type"].replace(
    "Tay cầm chơi game",
    "Controller",
  );
for (const k of Object.keys(s1))
  s1[k] = s1[k].replace(/Tay cầm chơi game/g, "Controller");
const s2 = hand[idByTail["c8dc"]].nl.specs;
for (const k of Object.keys(s2)) {
  s2[k] = s2[k]
    .replace("Xám;wit", "Grijs;wit")
    .replace("Đa Verbinding", "Draadloos")
    .replace(/sạc /g, "");
}

fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
console.log("pass5 done");
