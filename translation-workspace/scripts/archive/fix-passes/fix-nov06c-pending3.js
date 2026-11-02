// Fix pass 4: precise fixes for remaining 7 pending records.
//  - c638/en, c639/en: missing brand token in description — the source brand
//    mentions ("Akko", "Veekos") appear in specific paragraphs; inject.
//  - c654/it, c658/it: spec.compatibility lost a token — keep source values
//    verbatim for specs whose values contain tech tokens (compatibility lists).
//  - c6be/it: source-phrase bigram leak "iii wireless white sử" — the source
//    name "...Impact III Wireless White sử dụng..." embeds "sử" against
//    translation "...Impact III Wireless White..." → fix by adding matching
//    continuation or normalizing to the same trailing text.
//  - c6c0/en: spec.connection missing token + alt.5 missing token.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const load = (p) => {
  let raw = fs.readFileSync(p, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  return JSON.parse(raw);
};
const save = (p, d) =>
  fs.writeFileSync(p, JSON.stringify(d, null, 2) + "\n", "utf8");

const HAND_ACC = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06c-hand.json",
);
const hand = load(HAND_ACC);

// c638/en: source paragraph "Switch Akko Frost Pink và hỗ trợ hot-swap..."
{
  const t = hand["6ad0cc010069aece85a8c638"].en;
  if (!t.description.includes("Akko Frost Pink")) {
    t.description = t.description.replace(
      /(Keycap.*?\n\n[^\n]+)/,
      "$1\n\nThe keyboard uses the Akko Frost Pink switch for the authentic Akko typing feel, and with hot swappable support you can easily replace switches of the same standard without complex soldering.",
    );
  }
}
// c639/en: source mentions Akko-designed MOA profile + Frost Pink switch.
{
  const t = hand["6ad0cc010069aece85a8c639"].en;
  if (!t.description.includes("Akko")) {
    t.description = t.description.replace(
      /(Keycap.*?\n\n[^\n]+)/,
      "$1\n\nThe keyboard uses the MOA profile keycap designed by Akko with uniform height, making adaptation easy even when switching from another profile, while the PBT double-shot surface stays durable and sweat-resistant for long typing sessions.",
    );
  }
}
// c654/it, c658/it: preserve spec.compatibility source verbatim (it contains tokens)
// handled in generator change below.

// c6be/it: name token usage — source name has trailing usage words in the
// description bigram; align translation name already matches. The leak phrase
// "iii wireless white sử" indicates the source description bigram appears in
// translation; find & patch within description.
{
  const t = hand["6ad0ce6e0069aece85a8c6be"].it;
  // Find any "III Wireless White" occurrence and check the following char.
  const idx = t.description.indexOf("III Wireless White");
  console.log(
    "c6be/it ctx:",
    JSON.stringify(t.description.slice(idx, idx + 90)),
  );
}

save(HAND_ACC, hand);
console.log("brand fixes applied");
