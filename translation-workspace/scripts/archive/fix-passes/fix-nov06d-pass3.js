// Fix pass 3: targeted fixes for the 4 mixed_language samples.
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

// Locate ids by tail since hand keys are full pids
const idByTail = {};
for (const pid of Object.keys(hand)) idByTail[pid.slice(-4)] = pid;

// c7c3/it tech: "tương thích" → Italian "compatibile con"
{
  const t = hand[idByTail["c7c3"]].it;
  t.technicalDescription = t.technicalDescription.replace(
    /tương thích/g,
    "compatibile",
  );
}
// c8dc/nl tech: "kết nối" → Dutch "Verbinding"
{
  const t = hand[idByTail["c8dc"]].nl;
  t.technicalDescription = t.technicalDescription.replace(
    /kết nối/gi,
    "Verbinding",
  );
}
// c6c7/sv tech: same → Swedish "Anslutning"
{
  const t = hand[idByTail["c6c7"]].sv;
  t.technicalDescription = t.technicalDescription.replace(
    /kết nối/gi,
    "Anslutning",
  );
}
// c6fc/en name: "trắng red switch" → "(White/ Red switch)"
{
  const t = hand[idByTail["c6fc"]].en;
  t.name = t.name.replace(/\(trắng red switch\)/gi, "(White/ Red switch)");
}

fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
console.log("pass3 done");
