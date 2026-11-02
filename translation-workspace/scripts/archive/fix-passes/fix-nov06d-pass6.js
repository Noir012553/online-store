// Fix pass 6: 8 tech leaks — those VN words are in SOURCE values already
// ("cổng usb"/"sạc Li-ion"/"hiệu ứng" appear in the source TECH_DESCRIPTION
// values). These are product facts; translate per-language inside values.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const HAND = path.join(WS, "data", "translations", "translations-nov06d-hand.json");
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));

const VALUE_FIX = [
  [/cổng usb/gi, { it: "porta USB", nl: "USB-poort", de: "USB-Anschluss", en: "USB port", fr: "port USB", es: "puerto USB", sv: "USB-port", pt: "porta USB" }],
  [/sạc li-ion/gi, { it: "ricarica Li-ion", nl: "Li-ion opladen", de: "Li-ion Laden", en: "Li-ion charging", fr: "charge Li-ion", es: "carga Li-ion", sv: "Li-ion laddning", pt: "carregamento Li-ion" }],
  [/sạc/gi, { it: "ricarica", nl: "opladen", de: "Laden", en: "charging", fr: "charge", es: "carga", sv: "laddning", pt: "carregamento" }],
  [/hiệu ứng/gi, { it: "effetti", nl: "effecten", de: "Effekte", en: "effects", fr: "effets", es: "efectos", sv: "effekter", pt: "efeitos" }],
];

for (const [pid, langs] of Object.entries(hand)) {
  for (const [lang, t] of Object.entries(langs)) {
    for (const [re, words] of VALUE_FIX) {
      t.technicalDescription = (t.technicalDescription || "").replace(re, words[lang] || "");
    }
    for (const k of Object.keys(t.specs || {})) {
      for (const [re, words] of VALUE_FIX) {
        t.specs[k] = String(t.specs[k] || "").replace(re, words[lang] || "");
      }
    }
  }
}
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
console.log("pass6 done");
