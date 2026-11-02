// Fix pass 10: the c640 brand sentence insertion failed silently — the
// replace anchor didn't match ("Progettato..."/"Diseñado..." paragraphs got
// merged differently). Append the Akko sentence at a stable anchor instead.
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

{
  const t = hand[idByTail["c640"]].it;
  if (!t.description.includes("Akko")) {
    // insert sentence right after the title line (first paragraph)
    const firstParaEnd = t.description.indexOf("\n\n");
    const sentence =
      "\n\nL'AKKO 5075B Plus Red World Tour VIET NAM e l'AKKO MOD007 PC Blue on White con Akko Cs Piano Switch sono ottime scelte per chi ama tastiere meccaniche belle e performanti.";
    t.description =
      t.description.slice(0, firstParaEnd) +
      sentence +
      t.description.slice(firstParaEnd);
  }
}
{
  const t = hand[idByTail["c640"]].es;
  if (!t.description.includes("Akko")) {
    const firstParaEnd = t.description.indexOf("\n\n");
    const sentence =
      "\n\nEl AKKO 5075B Plus Red World Tour VIET NAM y el AKKO MOD007 PC Blue on White con Akko Cs Piano Switch son excelentes opciones para quienes aman los teclados mecánicos bonitos y potentes.";
    t.description =
      t.description.slice(0, firstParaEnd) +
      sentence +
      t.description.slice(firstParaEnd);
  }
}
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
console.log("pass10 done");
