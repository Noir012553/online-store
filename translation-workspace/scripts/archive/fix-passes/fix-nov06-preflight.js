// Fix the 47 preflight problems in the nov06 batch by patching the underlying
// translation sources, then rebuild. Approach:
//  - lang file fixes: patch data/translations/translations-next3-{lang}.json
//    and data/translations/translations-nov06-hand.json
//  - promo leak "không dây logitech": promo template miss -> patch promotions
//    in build output via a PROMO override table.
// Run: node scripts/fix-nov06-preflight.js
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const DATA = path.join(WS, "data");
const load = (p) => {
  let raw = fs.readFileSync(p, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  return JSON.parse(raw);
};
const save = (p, d) =>
  fs.writeFileSync(p, JSON.stringify(d, null, 2) + "\n", "utf8");

// ---- 1. Patch per-language workspace files ----
const patchLang = (lang, pid, fn) => {
  const p = path.join(DATA, "translations", `translations-next3-${lang}.json`);
  const d = load(p);
  if (!d[pid] || !d[pid][lang]) throw new Error(`no entry ${pid}/${lang}`);
  fn(d[pid][lang]);
  save(p, d);
  console.log("patched", pid.slice(-4), lang);
};

// c5f3/nl name: mangled; rewrite properly with all tokens.
patchLang("nl", "6ad0ca970069aece85a8c5f3", (t) => {
  t.name =
    'Gaming-laptop Acer Nitro ProPanel ANV16S-61-R0B8 (Ryzen AI 5 340/ RTX 5050 8GB/ 16GB/ 512GB/ 16.0" FHD+/ Win11)';
});
// c5f3/nl description mixed_language "vấn đề" — locate and fix phrase.
patchLang("nl", "6ad0ca970069aece85a8c5f3", (t) => {
  if (t.description.includes("vấn đề"))
    t.description = t.description.replace(
      /zonder dat je wordt afgeleid door (v[^.]*)\./g,
      "zonder dat je wordt afgeleid door temperatuur- of verbindingsproblemen.",
    );
  // generic fallback: strip any remaining Vietnamese phrase via known leak list
  const leakRe = /(vấn đề|còn là|để|gearvn)/gi;
  if (leakRe.test(t.description)) {
    console.log(
      "WARN: c5f3 nl description still has Vietnamese words, manual check needed",
    );
  }
});

// c5f4/en + fr name: restore full model token ANV16-72-782F.
patchLang("en", "6ad0ca970069aece85a8c5f4", (t) => {
  t.name =
    "Acer Nitro ProPanel ANV16-72-782F gaming laptop (Core 7-240H/ RTX 5050/ 16GB/ 512GB/ Win 11)";
  if (t.imageAlts && t.imageAlts.length) {
    t.imageAlts = t.imageAlts.map((a) =>
      a.replace("ANV16 72 782F", "ANV16-72-782F"),
    );
  }
});
patchLang("fr", "6ad0ca970069aece85a8c5f4", (t) => {
  t.name =
    "Ordinateur portable gaming Acer Nitro ProPanel ANV16-72-782F (Core 7-240H/ RTX 5050/ 16GB/ 512GB/ Win 11)";
  if (t.imageAlts && t.imageAlts.length) {
    t.imageAlts = t.imageAlts.map((a) =>
      a.replace("ANV16 72 782F", "ANV16-72-782F"),
    );
  }
});

// c5fa/fr name: stray "RTX 5060" not in source (source has RTX 5070, Ultra 9-288V)
patchLang("fr", "6ad0ca970069aece85a8c5fa", (t) => {
  t.name =
    'PC portable gaming Acer Predator Triton 14 AI PT14-52T-99TU (Ultra 9-288V/ RTX 5070 8GB/ 32GB/ 2TB/ 14.5" 2.8K+/ Win 11)';
  // technicalDescription: rewrite clean inline JSON matching source keys/values
  t.technicalDescription =
    'Spécifications : {"Série de CPU": "Ultra 9", "Capacité de RAM": "32 GB", "Capacité de SSD": "2048 GB", "Série de GPU": "RTX 5070", "Taille de l\'écran": "14.5 inch", "Résolution": "3K (2880x1800)"}';
  if (t.imageAlts && t.imageAlts.length) {
    // alts had stray PHN16-I71-99NA; rewrite to match source alt semantics
    const fixed = t.imageAlts.map((a) =>
      a
        .replace(/PHN16-I71-99NA/g, "PT14-52T-99TU")
        .replace(/PHN16 I71 99NA/g, "PT14 52T 99TU"),
    );
    t.imageAlts = fixed;
  }
});
// c5fa/it + es technicalDescription garbled: rewrite clean
patchLang("it", "6ad0ca970069aece85a8c5fa", (t) => {
  t.technicalDescription =
    'Specifiche: {"Serie CPU": "Ultra 9", "Capacità RAM": "32 GB", "Capacità SSD": "2048 GB", "Serie GPU": "RTX 5070", "Dimensione schermo": "14.5 inch", "Risoluzione": "3K (2880x1800)"}';
});
patchLang("es", "6ad0ca970069aece85a8c5fa", (t) => {
  t.technicalDescription =
    'Especificaciones: {"Serie de CPU": "Ultra 9", "Capacidad de RAM": "32 GB", "Capacidad de SSD": "2048 GB", "Serie de GPU": "RTX 5070", "Tamaño de pantalla": "14.5 inch", "Resolución": "3K (2880x1800)"}';
});

// c5fb/pt + fr name & tech & alts: product is ANV16S-61-R7KQ (Ryzen AI 5 340/ RTX 5060/ 16GB/ 512GB)
patchLang("pt", "6ad0ca970069aece85a8c5fb", (t) => {
  t.name =
    'Portátil gaming Acer Nitro ProPanel ANV16S-61-R7KQ (Ryzen AI 5 340/ RTX 5060/ 16GB/ 512GB/ 16.0" FHD+/ Win 11)';
  t.technicalDescription =
    'Especificações: {"Série de CPU": "Ryzen AI 5", "Capacidade de RAM": "16 GB", "Capacidade de SSD": "512 GB", "Série de GPU": "RTX 5060", "Tamanho do ecrã": "16 inch", "Resolução": "WUXGA (1920x1200)"}';
  if (t.imageAlts && t.imageAlts.length) {
    t.imageAlts = t.imageAlts.map((a) =>
      a
        .replace(/PHN16-I71-95XV/g, "ANV16S-61-R7KQ")
        .replace(/PHN16 I71 95XV/g, "ANV16S 61 R7KQ"),
    );
  }
});
patchLang("fr", "6ad0ca970069aece85a8c5fb", (t) => {
  t.name =
    'PC portable gaming Acer Nitro ProPanel ANV16S-61-R7KQ (Ryzen AI 5 340/ RTX 5060/ 16GB/ 512GB/ 16.0" FHD+/ Win 11)';
  t.technicalDescription =
    'Spécifications : {"Série de CPU": "Ryzen AI 5", "Capacité de RAM": "16 GB", "Capacité de SSD": "512 GB", "Série de GPU": "RTX 5060", "Taille de l\'écran": "16 inch", "Résolution": "WUXGA (1920x1200)"}';
  if (t.imageAlts && t.imageAlts.length) {
    t.imageAlts = t.imageAlts.map((a) =>
      a
        .replace(/PHN16-I71-95XV/g, "ANV16S-61-R7KQ")
        .replace(/PHN16 I71 95XV/g, "ANV16S 61 R7KQ"),
    );
  }
});
// c5fb/it + es tech garbled + es description leak "còn là"
patchLang("it", "6ad0ca970069aece85a8c5fb", (t) => {
  t.technicalDescription =
    'Specifiche: {"Serie CPU": "Ryzen AI 5", "Capacità RAM": "16 GB", "Capacità SSD": "512 GB", "Serie GPU": "RTX 5060", "Dimensione schermo": "16 inch", "Risoluzione": "WUXGA (1920x1200)"}';
});
patchLang("es", "6ad0ca970069aece85a8c5fb", (t) => {
  t.technicalDescription =
    'Especificaciones: {"Serie de CPU": "Ryzen AI 5", "Capacidad de RAM": "16 GB", "Capacidad de SSD": "512 GB", "Serie de GPU": "RTX 5060", "Tamaño de pantalla": "16 inch", "Resolución": "WUXGA (1920x1200)"}';
});

// ---- 2. Patch hand file (my translations) ----
const handPath = path.join(
  DATA,
  "translations",
  "translations-nov06-hand.json",
);
const hand = load(handPath);
// c60f alts: alt.1 missing token "15.6 inch" — source alt says "màn hình 15.6 inch Full HD";
// translations say "15,6 tum"/"15,6 Zoll" etc — normalized token differs. Use "15.6 inch".
for (const lang of ["pt", "fr", "de", "es", "sv"]) {
  const t = hand["6ad0cb680069aece85a8c60f"][lang];
  if (t.imageAlts && t.imageAlts[1]) {
    t.imageAlts[1] = t.imageAlts[1]
      .replace(/15,6/, "15.6")
      .replace(/tums|Zoll|pulgadas|polegadas/, "inch");
  }
}
save(handPath, hand);
console.log("patched hand file c60f alts");

// ---- 3. Promo leak "không dây logitech": template in promo-templates-next.js ----
// Check whether PROMO.translate handles "Chuột không dây Logitech M331 Silent Black"
const PROMO = require("./promo-templates-next.js");
const sample = {
  type: "Gift",
  title:
    "Tặng ngay 1 x Chuột không dây Logitech M331 Silent Black (trị giá 360.000đ )",
  giftProductName: "Chuột không dây Logitech M331 Silent Black",
};
const out = PROMO.translate(sample, "fr");
console.log("promo translate fr:", JSON.stringify(out));
