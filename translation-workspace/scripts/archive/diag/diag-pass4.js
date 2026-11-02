// Root fixes:
//  c770/fr "switch dễ": DUPLICATE easy-word — find context and replace.
//  c790/fr+de "chính hãng": Vietnamese word sitting inside the injected chip
//     sentence? No — this came from GearVN cta. Replace "genuine"→real FR/DE?
//     Leak says the translation has literal VN — scan & show context.
//  c7a7/c7c9 tech "tương thích": source-descriptions leak scan kept failing
//     — the fix wrote only some; check exact path — the tech descriptions
//     maybe stored under product telemetry field not t. Re-check record shape.
const path = require("path");
const fs = require("fs");
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

function diag(tail, lang, word) {
  const t = hand[idByTail[tail]][lang];
  const fields = {
    desc: t.description,
    tech: t.technicalDescription,
    name: t.name,
    alts: (t.imageAlts || []).join(" | "),
  };
  for (const [k, v] of Object.entries(fields)) {
    const i = String(v || "")
      .toLowerCase()
      .indexOf(word.toLowerCase());
    if (i >= 0) {
      console.log(
        tail + "/" + lang,
        k,
        "idx",
        i,
        ":",
        JSON.stringify(String(v).slice(Math.max(0, i - 100), i + 100)),
      );
    }
  }
}
diag("c770", "fr", "switch dễ");
diag("c790", "fr", "chính hãng");
diag("c790", "de", "chính hãng");
diag("c7a7", "es", "tương thích");
diag("c7a7", "nl", "tương thích");
diag("c7c9", "pt", "tương thích");
