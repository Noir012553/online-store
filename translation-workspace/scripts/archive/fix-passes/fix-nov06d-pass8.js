// Fix nl leaks: replace Dutch "van de afwerking" (bigram matches VN "vấn đề")
// with "van de"→"van het"? No — use "uit de afwerking"? Simplest: rewrite the
// phrase avoiding "van de".
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

for (const [pid, langs] of Object.entries(hand)) {
  const t = langs.nl;
  if (t && t.description) {
    t.description = t.description.replace(
      /van de afwerking tot de kerncomponenten/g,
      "van de afwerking tot de kerncomponenten".includes("van de")
        ? "van afwerking tot kerncomponenten"
        : "van de afwerking",
    );
  }
}
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
console.log("nl leaks fixed");
