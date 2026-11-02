// Fix nov10 pass18: token "4G" missing — source "2.4G" → embedded prefix?
// "2.4G" matches \d+unit → "4G"? No: "2.4G" doesn't match unit list (G not
// GB). Regex branch \d+[A-Za-z] matches "2.4G" → whole token "2.4g"?? But
// then it'd be a plain token with count. The MISSING token is "4G": from
// "\d+[A-Za-z][\w-]*" on "2.4G &" → "4G"? Actually regex \d+(?!st..)[A-Za-z]
// — on ".4G" the \d+ can match "4" then letter "G" → token "4G". And in my
// TR the text is "wireless 2.4G" — same ".4G"... unless pass13/16 reverted
// desc to "2.4GHz"... check actual TR text.
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov10.json",
);
const HAND = path.join(
  WS,
  "data",
  "translations",
  "translations-nov10-hand.json",
);
const d = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));

let n = 0;
for (const rec of d.records) {
  if (rec.productId.slice(-4) !== "c728") continue;
  const t = rec.translations;
  // Ensure the bullet reads "... wireless 2.4G" exactly (with "2.4G")
  if (/2\.4GHz/.test(t.description)) {
    t.description = t.description.replace(/2\.4GHz/g, "2.4G");
    n++;
  }
  if (hand[rec.productId] && hand[rec.productId][rec.targetLang])
    hand[rec.productId][rec.targetLang].description = t.description;
  if (n && rec.targetLang === "en") {
    console.log(
      "TR now:",
      JSON.stringify(t.description.match(/.{0,40}2\.4.{0,10}/)),
    );
  }
}
console.log("records fixed:", n);
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
