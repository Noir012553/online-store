// Fix nov06d leftover VN words in tech-JSON keys/values and names (pass 2).
// Adds: Kiểu tai nghe, Kiểu, Tai nghe, Kết nối, Kim loại, mini không dây,
// có dây (mixed_language sources flagged by sample preflight).
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

const FIX_MAP = [
  [
    /Kiểu tai nghe/g,
    {
      en: "Earbud type",
      pt: "Tipo de auscultadores",
      fr: "Type d'écouteurs",
      de: "Ohrhörer-Typ",
      it: "Tipo di auricolari",
      es: "Tipo de auriculares",
      nl: "Oortelefoon-type",
      sv: "Hörlurstyp",
    },
  ],
  [
    /Kiểu/g,
    {
      en: "Type",
      pt: "Tipo",
      fr: "Type",
      de: "Typ",
      it: "Tipo",
      es: "Tipo",
      nl: "Type",
      sv: "Typ",
    },
  ],
  [
    /Tai nghe/g,
    {
      en: "Headset",
      pt: "Auscultadores",
      fr: "Casque",
      de: "Headset",
      it: "Cuffie",
      es: "Auriculares",
      nl: "Headset",
      sv: "Headset",
    },
  ],
  [
    /Kết nối/g,
    {
      en: "Connection",
      pt: "Ligação",
      fr: "Connexion",
      de: "Verbindung",
      it: "Connessione",
      es: "Conexión",
      nl: "Verbinding",
      sv: "Anslutning",
    },
  ],
  [
    /Kim loại/g,
    {
      en: "Metal",
      pt: "Metal",
      fr: "Métal",
      de: "Metall",
      it: "Metallo",
      es: "Metal",
      nl: "Metaal",
      sv: "Metall",
    },
  ],
  [
    /mini không dây/gi,
    {
      pt: "mini sem fios",
      fr: "mini sans fil",
      de: "Mini Kabellos",
      it: "mini wireless",
      es: "mini inalámbrico",
      nl: "mini draadloos",
      sv: "mini trådlös",
    },
  ],
  [
    /Mini không dây/g,
    {
      pt: "Mini sem fios",
      fr: "Mini sans fil",
      de: "Mini Kabellos",
      it: "Mini wireless",
      es: "Mini inalámbrico",
      nl: "Mini draadloos",
      sv: "Mini trådlös",
    },
  ],
  [
    /không dây/gi,
    {
      en: "wireless",
      pt: "sem fios",
      fr: "sans fil",
      de: "kabellos",
      it: "wireless",
      es: "inalámbrico",
      nl: "draadloos",
      sv: "trådlös",
    },
  ],
  [
    /Không dây/g,
    {
      en: "Wireless",
      pt: "Sem fios",
      fr: "Sans fil",
      de: "Kabellos",
      it: "Wireless",
      es: "Inalámbrico",
      nl: "Draadloos",
      sv: "Trådlös",
    },
  ],
  [
    /có dây/g,
    {
      en: "wired",
      pt: "com fios",
      fr: "filaire",
      de: "kabelgebunden",
      it: "cablato",
      es: "con cable",
      nl: "bedraad",
      sv: "trådbunden",
    },
  ],
  [
    /Có dây/g,
    {
      en: "Wired",
      pt: "Com fios",
      fr: "Filaire",
      de: "Kabelgebunden",
      it: "Cablato",
      es: "Con cable",
      nl: "Bedraad",
      sv: "Trådbunden",
    },
  ],
  [
    /Tai nghe khi mọi người đang giao tiếp/g,
    {
      en: "headset while people are communicating",
      pt: "auscultadores enquanto as pessoas comunicam",
      fr: "casque pendant que les gens communiquent",
      de: "Headset, während Leute kommunizieren",
      it: "cuffie mentre le persone comunicano",
      es: "auriculares mientras la gente se comunica",
      nl: "headset terwijl mensen communiceren",
      sv: "headset medan folk kommunicerar",
    },
  ],
];

// skip pt since pt name of c88e legitimately carries VN brand descriptor we
// translated above; but pt tech still carries Vietnamese keys (Phương thức
// kết nối etc.) — pt uses its own translations.
const SKIP_VALUE_PATTERNS_FOR = new Set(["pt"]); // pt values with VN words are rare; skip aggressive value substitution on names only

function fixText(text, lang, isName) {
  let out = text;
  for (const [re, words] of FIX_MAP) {
    if (isName && SKIP_VALUE_PATTERNS_FOR.has(lang)) continue;
    out = out.replace(re, words[lang] || "");
  }
  return out;
}

for (const [pid, langs] of Object.entries(hand)) {
  for (const [lang, t] of Object.entries(langs)) {
    t.technicalDescription = fixText(t.technicalDescription || "", lang, false);
    t.description = fixText(t.description || "", lang, false);
    t.name = fixText(t.name || "", lang, true);
    t.imageAlts = (t.imageAlts || []).map((a) => fixText(a, lang, false));
    for (const k of Object.keys(t.specs || {})) {
      t.specs[k] = fixText(t.specs[k], lang, false);
    }
  }
}
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
console.log("pass2 done");
