// Inspect pending records: name first chars + desc snippet for each.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const HAND = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06e-hand.json",
);
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));
const idByTail = {};
for (const pid of Object.keys(hand)) idByTail[pid.slice(-4)] = pid;
for (const tail of ["c7fb", "c803", "c8c4", "c8c5", "c8c8"]) {
  const pid = idByTail[tail];
  if (!pid) {
    console.log(tail, "NOT IN HAND");
    continue;
  }
  for (const [lang, t] of Object.entries(hand[pid])) {
    if (!["fr", "sv", "es", "de", "it"].includes(lang)) continue;
    console.log(
      tail + "/" + lang,
      "| name:",
      (t.name || "").slice(0, 50),
      "| desc head:",
      (t.description || "").slice(0, 80).replace(/\n/g, " | "),
    );
  }
}
