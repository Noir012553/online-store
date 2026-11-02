// Trim c869/fr, c874/en, c875/en, c876/en descriptions to under the length
// cap (source cap appears to be ~3400 chars — trim the middle paragraphs
// while keeping first, middle, and CTA). Combined with brand token already
// present, these will then pass too_long.
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

const LIMIT = 3300;
for (const [tail, lang] of [
  ["c869", "fr"],
  ["c874", "en"],
  ["c875", "en"],
  ["c876", "en"],
]) {
  const pid = Object.keys(hand).find((k) => k.endsWith(tail));
  if (!pid) {
    console.log(tail, "no hand");
    continue;
  }
  const t = hand[pid][lang];
  if (t.description.length <= LIMIT) {
    console.log(tail, lang, "already", t.description.length);
    continue;
  }
  // Strategy: split into paragraphs; drop middle paragraphs from a "middle
  // pool" while keeping first 2 and last 2 until under LIMIT.
  const paras = t.description.split("\n\n");
  const head = paras.slice(0, 3);
  const tail2 = paras.slice(-2);
  let middle = paras.slice(3, -2);
  const headLen = head.join("\n\n").length + tail2.join("\n\n").length;
  while (middle.length && headLen + middle.join("\n\n").length > LIMIT) {
    middle.pop();
  }
  t.description = [...head, ...middle, ...tail2].join("\n\n");
  console.log(tail, lang, "->", t.description.length, "chars");
}
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
