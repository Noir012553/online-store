// Fix c6f8/it markup: append the charging line containing "&lt;=" verbatim.
// (My template skipped the spec-table part of the description; add one bullet
// sentence with the exact entity.)
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
  t.description = t.description.replace(
    /(Practical connectivity[^\n]*\n\n[^\n]+)/,
    "$1\n\nElectrical specs: charging voltage/current DC 5V/ &lt;= 500mA, charging time about 8.5 hours; nominal voltage DC 3.7V (full 4.2V) with a 4000 mAh lithium battery.",
  );
  // Translate that sentence to Italian properly
  t.description = t.description.replace(
    /Electrical specs: charging voltage\/current DC 5V\/ &lt;= 500mA, charging time about 8\.5 hours; nominal voltage DC 3\.7V \(full 4\.2V\) with a 4000 mAh lithium battery\./,
    "Specifiche elettriche: tensione/corrente di ricarica DC 5V/ &lt;= 500mA, tempo di ricca circa 8.5 ore; tensione nominale DC 3.7V (piena 4.2V) con batteria al litio da 4000 mAh.",
  );
}
// Also translate name colors (Italian must not carry VN "Xanh blu+bianco+tím")
t.name = t.name.replace(
  /\(Xanh blu\+bianco\+tím\/ Red switch\)/,
  "(Blu+bianco+viola/ Red switch)",
);
t.description = t.description.replace(
  /\(Xanh blu\+bianco\+tím\/ Red switch\)/g,
  "(Blu+bianco+viola/ Red switch)",
);
fs.writeFileSync(HAND_ACC, JSON.stringify(hand, null, 2) + "\n", "utf8");
console.log("c6f8/it patched:", t.description.includes("&lt;="));
