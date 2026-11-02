// Fix pass 9: brand casing (Akko→must appear exactly; use "Akko" instead of
// "AKKO") + color leaks in descriptions.
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

// Brand casing: replace AKKO→Akko inside descriptions where missing
for (const [tail, lang] of [
  ["c640", "it"],
  ["c640", "es"],
  ["c66c", "it"],
  ["c66c", "es"],
]) {
  const t = hand[idByTail[tail]] && hand[idByTail[tail]][lang];
  if (t && t.description) {
    if (!t.description.includes("Akko") && t.description.includes("AKKO"))
      t.description = t.description.replace(/AKKO/g, "Akko");
    pelicano:;
  }
}
// c6c7 de/sv: my ROG sentence references ASUS brand — check actual text
console.log(
  "c6c7 de ctx:",
  hand[idByTail["c6c7"]].de.description.slice(0, 600),
);
