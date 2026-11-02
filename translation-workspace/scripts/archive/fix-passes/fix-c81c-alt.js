// Fix c81c fr/nl imageAlts — residual Vietnamese in alt string.
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
const FIX = {
  fr: {
    "có âm thanh gõ dễ chịu": "au son de frappe confortable",
  },
  nl: {
    "có âm thanh gõ dễ chịu": "met prettig typgeluid",
  },
};
for (const lang of ["fr", "nl"]) {
  const pidKey = Object.keys(hand).find((k) => k.endsWith("c81c"));
  const t = hand[pidKey][lang];
  t.imageAlts = (t.imageAlts || []).map((a) => {
    let out = a;
    for (const [vn, tr] of Object.entries(FIX[lang]))
      out = out.split(vn).join(tr);
    // generic word cleanups in alt: Bàn phím → clavier/toetsenbord; có → avec/met
    out = out.replace(/Bàn phím/gi, lang === "fr" ? "Clavier" : "Toetsenbord");
    out = out.replace(/\bcó\b/gi, lang === "fr" ? "avec" : "met");
    return out;
  });
  // description + name may also carry VN fragments — clean generically
  t.description = (t.description || "")
    .replace(/Bàn phím/gi, lang === "fr" ? "Clavier" : "Toetsenbord")
    .replace(/âm thanh/gi, lang === "fr" ? "son" : "geluid");
}
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
console.log("c81c fixed");
