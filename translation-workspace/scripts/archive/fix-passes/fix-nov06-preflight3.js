// Pass 3: rebuild alt translations to match source token sets exactly, and
// locate the two Vietnamese leaks. Prior drafts came from archive files
// describing DIFFERENT products (PHN16-I71-95XV etc.) — rewrite alts cleanly.
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

// ---- c5fb pt/fr alts: source token sets per alt ----
// 0: ANV16S-61-R7KQ, 16GB, DDR5
// 1: ANV16S-61-R7KQ
// 2: ANV16S-61-R7KQ, RGB
// 3: ANV16S-61-R7KQ, Dual-Fan
// 4: ANV16S-61-R7KQ
patchLang("pt", "6ad0ca970069aece85a8c5fb", (t) => {
  t.imageAlts = [
    "Portátil Acer Nitro ProPanel ANV16S-61-R7KQ equipado com 16GB RAM DDR5",
    "Portátil Acer Nitro ProPanel ANV16S-61-R7KQ com ecrã amplo e nítido",
    "Portátil Acer Nitro ProPanel ANV16S-61-R7KQ equipado com teclado RGB impressionante",
    "Portátil Acer Nitro ProPanel ANV16S-61-R7KQ com refrigeração Dual-Fan moderna",
    "Portátil Acer Nitro ProPanel ANV16S-61-R7KQ com bateria resistente e conveniente para transporte",
  ];
});
patchLang("fr", "6ad0ca970069aece85a8c5fb", (t) => {
  t.imageAlts = [
    "PC portable Acer Nitro ProPanel ANV16S-61-R7KQ équipé de 16GB RAM DDR5",
    "PC portable Acer Nitro ProPanel ANV16S-61-R7KQ avec écran large et net",
    "PC portable Acer Nitro ProPanel ANV16S-61-R7KQ équipé d'un clavier RGB impressionnant",
    "PC portable Acer Nitro ProPanel ANV16S-61-R7KQ avec refroidissement Dual-Fan moderne",
    "PC portable Acer Nitro ProPanel ANV16S-61-R7KQ avec batterie résistante et pratique pour le transport",
  ];
});

// ---- c5fa/fr alts: source token sets ----
// 0: (none beyond brand)         "Acer Predator Triton 14 AI là kiệt tác gaming..."
// 1: (none)
// 2: OLED, 14.5 inch, 120Hz, 340 nits
// 3: Graphene TIM (Graphene token? plain word) — tokens: none uppercase-tech beyond TIM?
//    "Công nghệ Graphene TIM kết hợp..." tokens: TIM? Actually token regex needs digits/dashes — none.
// 4: (none)
// 5: Thunderbolt 4
patchLang("fr", "6ad0ca970069aece85a8c5fa", (t) => {
  t.imageAlts = [
    "L'Acer Predator Triton 14 AI est un chef-d'œuvre gaming au design fin et léger",
    "L'Acer Predator Triton 14 AI dispose de performances puissantes",
    "La dalle OLED 14.5 inch 120Hz avec une luminosité de 340 nits affiche un noir d'une profondeur impressionnante",
    "La technologie Graphene TIM combinée au refroidissement métallique exclusif",
    "Le touchpad unibloc prend en charge le stylet tactile et un haptic feedback précis",
    "Une connectivité Thunderbolt 4 moderne",
  ];
});

console.log("alts rebuilt");
