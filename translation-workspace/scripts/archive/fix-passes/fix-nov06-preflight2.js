// Pass 2: fix remaining 29 preflight problems of the nov06 batch.
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

const patchLang = (lang, pid, fn) => {
  const p = path.join(DATA, "translations", `translations-next3-${lang}.json`);
  const d = load(p);
  if (!d[pid] || !d[pid][lang]) throw new Error(`no entry ${pid}/${lang}`);
  fn(d[pid][lang]);
  save(p, d);
  console.log("patched", pid.slice(-4), lang);
};

// c5f3/nl description: strip remaining Vietnamese phrase containing "vấn đề".
// Locate the exact sentence containing the leak first.
const nlPath = path.join(DATA, "translations", "translations-next3-nl.json");
const nl = load(nlPath);
const t53 = nl["6ad0ca970069aece85a8c5f3"].nl;
const idx = t53.description.toLowerCase().indexOf("vấn đề");
if (idx >= 0) {
  console.log(
    "nl leak context:",
    JSON.stringify(t53.description.slice(Math.max(0, idx - 200), idx + 150)),
  );
  process.exit(1); // print and stop — need the exact text before rewriting
}
console.log("c5f3 nl: no leak found in lang file (came from archive?)");

// c5f4 en/fr alts: source alts contain "ANV16" (from "ANV16 72 782F" spacing).
// Source alt text: "Laptop Acer Nitro ProPanel ANV16 72 782F có ..." -> token ANV16.
// Keep "ANV16 72 782F" spacing in alts (source spacing), do NOT normalize to dashes.
const fix54alts = (t) => {
  if (t.imageAlts && t.imageAlts.length) {
    t.imageAlts = t.imageAlts.map((a) =>
      a.replace(/ANV16-72-782F/g, "ANV16 72 782F"),
    );
  }
};
patchLang("en", "6ad0ca970069aece85a8c5f4", fix54alts);
patchLang("fr", "6ad0ca970069aece85a8c5f4", fix54alts);

// c5fa/fr alts: source alts do NOT contain the model token at all — remove it.
// Source alts: "Acer Predator Triton 14 AI là kiệt tác gaming với thiết kế mỏng nhẹ", etc.
const fixfaalts = (t) => {
  if (t.imageAlts && t.imageAlts.length) {
    t.imageAlts = t.imageAlts.map((a) =>
      a.replace(/\s*PT14-52T-99TU/g, "").replace(/\s*PT14 52T 99TU/g, ""),
    );
  }
};
patchLang("fr", "6ad0ca970069aece85a8c5fa", fixfaalts);

// c5fb/pt+fr alts: source alt tokens must match. Source alts:
//  0: "... trang bị 16GB RAM DDR5"        -> keep DDR5
//  1: "... có màn hình rộng sắc nét"      -> no GPU token
//  2: "... trang bị bàn phím RGB ấn tượng"-> no token
//  3: "... có tản nhiệt Dual-Fan hiện đại"-> no token
//  4: "... sở hữu viên pin bền bỉ..."     -> no token
const fixfbalts = (lang) => (t) => {
  if (t.imageAlts && t.imageAlts.length >= 5) {
    const alts = t.imageAlts;
    alts[0] = alts[0].includes("DDR5") ? alts[0] : alts[0];
    // alt.1: remove RTX 5060 mention; rewrite to display theme
    alts[1] = alts[1].replace(
      lang === "pt" ? / com RTX 5060 equilibrada/ : / avec RTX 5060 équilibrée/,
      lang === "pt" ? " com ecrã amplo e nítido" : " avec écran large et net",
    );
    // alt.2: remove 240Hz stray
    alts[2] = alts[2]
      .replace(/ 240hz/i, "")
      .replace(/-display WQXGA 240Hz/, " display WQXGA")
      .replace(/écran WQXGA 240Hz/, "écran WQXGA")
      .replace(/display WQXGA 240Hz/, "display WQXGA");
    // alt.3 + alt.4: append the missing model token? No — source alt.3/4 have no model token.
    // The missing token arises because our alts ADDED "ANV16S-61-R7KQ" not present in source alts? No: missing means translation lacks a token present in source.
    // Source alts actually contain "ANV16S-61-R7KQ" in each alt string:
    // "Laptop Acer Nitro ProPanel ANV16S-61-R7KQ trang bị 16GB RAM DDR5" etc.
    // So alts must include the token. Rebuild alts 3-5 with the model token.
    const base =
      lang === "pt"
        ? "Portátil Acer Nitro ProPanel ANV16S-61-R7KQ"
        : "PC portable Acer Nitro ProPanel ANV16S-61-R7KQ";
    alts[3] = `${base} ${lang === "pt" ? "com refrigeração Dual-Fan moderna" : "avec refroidissement Dual-Fan moderne"}`;
    alts[4] = `${base} ${lang === "pt" ? "com bateria resistente e conveniente para transporte" : "avec batterie résistante et pratique pour le transport"}`;
  }
};
patchLang("pt", "6ad0ca970069aece85a8c5fb", fixfbalts("pt"));
patchLang("fr", "6ad0ca970069aece85a8c5fb", fixfbalts("fr"));

// c5fb/es description leak "còn là" — locate context in the es lang file.
const esPath = path.join(DATA, "translations", "translations-next3-es.json");
const es = load(esPath);
const t5b = es["6ad0ca970069aece85a8c5fb"].es;
const j = t5b.description.indexOf("còn là");
if (j >= 0) {
  console.log(
    "es leak context:",
    JSON.stringify(t5b.description.slice(Math.max(0, j - 200), j + 150)),
  );
} else {
  console.log("c5fb es: leak not in lang file (from archive file)");
}

// c60f fr/de alt.1: still missing "15.6 inch" token.
const handPath = path.join(
  DATA,
  "translations",
  "translations-nov06-hand.json",
);
const hand = load(handPath);
const t60f_fr = hand["6ad0cb680069aece85a8c60f"].fr;
const t60f_de = hand["6ad0cb680069aece85a8c60f"].de;
console.log("c60f fr alt1:", JSON.stringify(t60f_fr.imageAlts[1]));
console.log("c60f de alt1:", JSON.stringify(t60f_de.imageAlts[1]));
t60f_fr.imageAlts[1] =
  "PC portable Acer Aspire Lite 15 AL15-410P-R1W8 avec écran 15.6 inch Full HD";
t60f_de.imageAlts[1] =
  "Laptop Acer Aspire Lite 15 AL15-410P-R1W8 mit 15.6 inch Full HD Display";
save(handPath, hand);
console.log("patched c60f fr/de alt.1");
