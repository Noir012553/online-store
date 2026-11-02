// Fix pass for nov06b preflight problems: alt token sets, spec o_phan_giai
// values and technicalDescription JSON must match source exactly.
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
const handPath = path.join(
  DATA,
  "translations",
  "translations-nov06b-hand.json",
);
const hand = load(handPath);

// --- c610/fr alt.0: source alt ends at "14" (cut in source). Mirror that exact spacing.
const c610fr = hand["6ad0cb680069aece85a8c610"].fr;
c610fr.imageAlts[0] =
  'PC portable Acer Aspire Lite 14 AL14-47P-R0TR (Ryzen 5-3500U/ 8GB/ 512GB/ 14';

// --- c611 all langs: technicalDescription & spec.o_phan_giai must include
// "(1920x1080)"; alts must include token "AG15" (from "AG15 72P 776J" spacing).
for (const lang of ["pt", "fr", "de", "es", "sv"]) {
  const t = hand["6ad0cb680069aece85a8c611"][lang];
  const label = {
    pt: "Especificações",
    fr: "Spécifications",
    de: "Technische Daten",
    es: "Especificaciones",
    sv: "Specifikationer",
  }[lang];
  const gpuLabel = {
    pt: "Placa gráfica",
    fr: "Carte graphique",
    de: "Grafikkarte",
    es: "Tarjeta gráfica",
    sv: "Grafikkort",
  }[lang];
  const scrLabel = {
    pt: "Tamanho do ecrã",
    fr: "Taille de l'écran",
    de: "Bildschirmgröße",
    es: "Tamaño de pantalla",
    sv: "Skärmstorlek",
  }[lang];
  const cpuLabel = {
    pt: "Série de CPU",
    fr: "Série de CPU",
    de: "CPU-Serie",
    es: "Serie de CPU",
    sv: "CPU-serie",
  }[lang];
  const ssdLabel = {
    pt: "Capacidade de SSD",
    fr: "Capacité de SSD",
    de: "SSD-Kapazität",
    es: "Capacidad de SSD",
    sv: "SSD-kapacitet",
  }[lang];
  const panLabel = {
    pt: "Painel",
    fr: "Dalle",
    de: "Panel",
    es: "Panel",
    sv: "Panel",
  }[lang];
  const resLabel = {
    pt: "Resolução",
    fr: "Résolution",
    de: "Auflösung",
    es: "Resolución",
    sv: "Upplösning",
  }[lang];
  t.technicalDescription = `${label}: {"${gpuLabel}": "Intel UHD Graphics", "${scrLabel}": "15.6 inch", "${cpuLabel}": "Core 7", "${ssdLabel}": "512 GB", "${panLabel}": "IPS", "${resLabel}": "Full HD (1920x1080)"}`;
  t.specs = { gpu: "Intel UHD Graphics", kich_thuoc_man_hinh: '15.6 "', cpu: "Core 7", storage: "512GB", tam_nen: "IPS", o_phan_giai: "Full HD (1920x1080)" };
  const altWord = {
    pt: "Portátil",
    fr: "PC portable",
    de: "Laptop",
    es: "Portátil",
    sv: "Bärbar dator",
  }[lang];
  t.imageAlts = [
    `${altWord} Acer Aspire Go 15 AG15 72P 776J com Intel Core 7 150U`.replace(
      " com ",
      lang === "fr"
        ? " avec "
        : lang === "de"
          ? " mit "
          : lang === "es"
            ? " con "
            : lang === "sv"
              ? " med "
              : " com ",
    ),
    lang === "pt"
      ? "Portátil Acer Aspire Go 15 AG15 72P 776J com ecrã de 15.6 inch Full HD"
      : lang === "fr"
        ? "PC portable Acer Aspire Go 15 AG15 72P 776J avec écran 15.6 inch Full HD"
        : lang === "de"
          ? "Laptop Acer Aspire Go 15 AG15 72P 776J mit 15.6 inch Full HD Display"
          : lang === "es"
            ? "Portátil Acer Aspire Go 15 AG15 72P 776J con pantalla 15.6 inch Full HD"
            : "Bärbar dator Acer Aspire Go 15 AG15 72P 776J med 15.6 inch Full HD-skärm",
    lang === "pt"
      ? "Portátil Acer Aspire Go 15 AG15 72P 776J com conetividade completa"
      : lang === "fr"
        ? "PC portable Acer Aspire Go 15 AG15 72P 776J avec connectique complète"
        : lang === "de"
          ? "Laptop Acer Aspire Go 15 AG15 72P 776J mit vollständiger Konnektivität"
          : lang === "es"
            ? "Portátil Acer Aspire Go 15 AG15 72P 776J con conectividad completa"
            : "Bärbar dator Acer Aspire Go 15 AG15 72P 776J med fullständig anslutning",
  ];
}

// --- c612 de/sv alt.1 missing "DDR4" (alt text already says DDR4 in pt/fr/es; fix de/sv).
const c612de = hand["6ad0cb680069aece85a8c612"].de;
c612de.imageAlts[1] =
  "Laptop Acer Aspire Lite 15 AL15 53P 56QH mit DDR4 RAM aufrüstbar bis 32GB";
const c612sv = hand["6ad0cb680069aece85a8c612"].sv;
c612sv.imageAlts[1] =
  "Bärbar dator Acer Aspire Lite 15 AL15 53P 56QH med DDR4 RAM uppgraderingsbar till 32GB";

// --- c613/fr: tech + spec.o_phan_giai need "(1920x1200)" (source WUXGA(1920x1200)); alts: alt.0 missing "14 inch", alt.1 stray "185H".
const c613fr = hand["6ad0cb680069aece85a8c613"].fr;
c613fr.technicalDescription =
  'Spécifications : {"Carte graphique": "Intel Graphics", "Taille de l\'écran": "14 inch", "Série de CPU": "Core Ultra 9", "Capacité de SSD": "512 GB", "Dalle": "IPS", "Résolution": "WUXGA(1920x1200)"}';
c613fr.specs = {
  gpu: "Intel Graphics",
  kich_thuoc_man_hinh: '14 "',
  cpu: "Core Ultra 9",
  storage: "512GB",
  tam_nen: "IPS",
  ram: "16GB",
  o_phan_giai: "WUXGA(1920x1200)",
};
c613fr.imageAlts = [
  "PC portable Acer Aspire Go 14 AI AG14-I71M-977M avec écran 14 inch",
  "PC portable Acer Aspire Go 14 AI AG14-I71M-977M au design mobile",
];

// --- c615/fr alt.0 missing "14 inch".
const c615fr = hand["6ad0cb680069aece85a8c615"].fr;
c615fr.imageAlts[0] =
  "PC portable Acer Swift Go AI OLED SFG14 75 765M avec écran OLED 14 inch";

save(handPath, hand);
console.log("hand file patched");
