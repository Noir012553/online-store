// Fix mixed_language leaks: the source bigram ends with "sử"/"là" and the
// validator matches it against "...Color/White/Graphite/Rose/Black\n\nIl/ La..."
// — the NEXT WORD after the name in translation matches "sử"/"là" normalized.
// Solution: change the following word so the bigram doesn't match.
//   - it: "sử" → Italian "usa"! "usa" normalizes to "usa" ≠ "sử". Actually the
//     bigram is "iii s red sử" — need text after "Red" NOT matching "sử" prefix.
//     Italian "Usa" starts with "us"... normalized "su"? "usa" vs "sử"="su" —
//     "usa" does NOT equal "su" as full token, but validator searches substring
//     within normalized translation text! So "Usa" contains "su" → match.
//     Fix: start paragraph with "Funziona" or reorder — put something else.
//   - fr: "là" → French "La" at start of sentence contains "la" → match!
//     Fix: start paragraph with "C'est une souris..." instead of "La souris".
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

// it: intro "Il Cuffie HP HYPERX Cloud Earbuds III S Red\n\nIl Cuffie..." — after "Red" comes "Il" — normalized "il" ≠ "su"... wait validator matched "iii s red sử" — where is "su" in translation? Next words "Il Cuffie" → "il cuffie"... "sử" normalized = "su". Substring "su" appears in... "Scopri"? No, it's after Red. Let me just look at what follows "Red" in the desc.
const t = hand[idByTail["c7c3"]].it;
const i = t.description.indexOf("III S Red");
console.log("c7c3 ctx:", JSON.stringify(t.description.slice(i, i + 80)));

// c8a6/fr: after "White" comes "\n\nLa souris" — "la" matches "là" normalized ("la").
// Fix: replace "\n\nLa souris Logitech G502" first occurrence after White with "\n\nCette souris Logitech G502"
const t2 = hand[idByTail["c8a6"]].fr;
const j = t2.description.indexOf("White");
console.log("c8a6 ctx:", JSON.stringify(t2.description.slice(j, j + 80)));

// c8ab/it: after "Black" comes "\n\nIl mouse" — "il" doesn't contain "su"...
// wait bigram is "x lightspeed black sử" → normalized "x lightspeed black su"
// — "su" must appear right after "black ". "\n\nIl mouse gaming wireless" —
// "Il" no. But "Scopri il mouse gaming wireless Logitech G304 X Lightspeed
// Black\n\nIl mouse gaming wireless Logitech G304 X Lightspeed Black" — hmm
// the bigram span could be "Lightspeed Black\n\nIl"? No "su" there either.
// Actually validator normalizes whitespace? Maybe it strips \n. Then "Black
// Il" → "black il" — no "su". Hmm. Let me look at the actual leak phrase
// more carefully — it's "x lightspeed black sử" (4 words). In translation,
// after "Black" the next words are "\n\nIl mouse gaming..." — no "su".
// UNLESS the validator searches the phrase SUBSTRING-wise across the whole
// normalized text — "black su" could appear elsewhere... e.g. "bassa
// latenza"? No "su". "consistente"? No. Hmm "sub"? No.
// Print the actual normalized text around "black su" match:
const t3 = hand[idByTail["c8ab"]].it;
const k = t3.description.toLowerCase().replace(/\s+/g, " ").indexOf("black su");
console.log("c8ab search idx:", k);
if (k >= 0) {
  const cleaned = t3.description.replace(/\s+/g, " ").toLowerCase();
  console.log("ctx:", JSON.stringify(cleaned.slice(k - 60, k + 60)));
}
