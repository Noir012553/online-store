// Generator for the final batch (40 slots / 5 products):
//  - c728: AULA F87 TM Grey Wood Switch (spec-list description, bullet lines)
//  - c7cd + sibling: Razer Blackwidow V3 Tenkeyless Green / Yellow Switch
//  - c89c: Logitech G304 Wireless White
//  - c8fe: HyperX Cloud Stinger Core II
// The source descriptions are mostly single-paragraph spec lists — mirror the
// structure: name sentence + translated spec bullets + GearVN closing.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const SOURCES_TXT = path.join(WS, "data", "sources-for-translation-next.txt");
const OUT_PATH = path.join(
  WS,
  "data",
  "translations",
  "translations-nov10-hand.json",
);
const txt = fs.readFileSync(SOURCES_TXT, "utf8");
const blocks = txt.split("===== PRODUCT ").slice(1);

const P = {
  en: {
    kb: "Keyboard ",
    kbmech: "Mechanical keyboard ",
    mwl: "Wireless mouse ",
    hs: "Headset ",
  },
  fr: {
    kb: "Clavier ",
    kbmech: "Clavier mécanique ",
    mwl: "Souris sans fil ",
    hs: "Casque ",
  },
  it: {
    kb: "Tastiera ",
    kbmech: "Tastiera meccanica ",
    mwl: "Mouse wireless ",
    hs: "Cuffie ",
  },
  nl: {
    kb: "Toetsenbord ",
    kbmech: "Mechanisch toetsenbord ",
    mwl: "Draadloze muis ",
    hs: "Headset ",
  },
  sv: {
    kb: "Tangentbord ",
    kbmech: "Mekaniskt tangentbord ",
    mwl: "Trådlös mus ",
    hs: "Headset ",
  },
  pt: {
    kb: "Teclado ",
    kbmech: "Teclado mecânico ",
    mwl: "Rato sem fios ",
    hs: "Auscultadores ",
  },
  es: {
    kb: "Teclado ",
    kbmech: "Teclado mecánico ",
    mwl: "Ratón inalámbrico ",
    hs: "Auriculares ",
  },
  de: {
    kb: "Tastatur ",
    kbmech: "Mechanische Tastatur ",
    mwl: "Kabellose Maus ",
    hs: "Headset ",
  },
};
const HEADS = {
  en: "Specifications",
  fr: "Spécifications",
  it: "Specifiche",
  nl: "Specificaties",
  sv: "Specifikationer",
  pt: "Especificações",
  es: "Especificaciones",
  de: "Technische Daten",
};
const KEY_TR = {
  "Kích thước/Layout": {
    en: "Size/Layout",
    fr: "Taille/Layout",
    it: "Dimensione/Layout",
    nl: "Grootte/Layout",
    sv: "Storlek/Layout",
    pt: "Tamanho/Layout",
    es: "Tamaño/Layout",
    de: "Größe/Layout",
  },
  "Số lượng phím": {
    en: "Number of keys",
    fr: "Nombre de touches",
    it: "Numero di tasti",
    nl: "Aantal toetsen",
    sv: "Antal tangenter",
    pt: "Número de teclas",
    es: "Número de teclas",
    de: "Anzahl der Tasten",
  },
  "Phương thức kết nối": {
    en: "Connection",
    fr: "Connexion",
    it: "Connessione",
    nl: "Verbinding",
    sv: "Anslutning",
    pt: "Ligação",
    es: "Conexión",
    de: "Verbindung",
  },
};
// value fragments
const VAL = [
  [
    /(\d+)\s*phím/g,
    {
      en: "$1 keys",
      fr: "$1 touches",
      it: "$1 tasti",
      nl: "$1 toetsen",
      sv: "$1 tangenter",
      pt: "$1 teclas",
      es: "$1 teclas",
      de: "$1 Tasten",
    },
  ],
  [
    /Có dây/g,
    {
      en: "Wired",
      fr: "Filaire",
      it: "Cablato",
      nl: "Bedraad",
      sv: "Trådbunden",
      pt: "Com fios",
      es: "Con cable",
      de: "Kabelgebunden",
    },
  ],
  [
    /không dây 2\.4G/gi,
    {
      en: "wireless 2.4G",
      fr: "sans fil 2.4G",
      it: "wireless 2.4G",
      nl: "draadloos 2.4G",
      sv: "trådlös 2.4G",
      pt: "sem fios 2.4G",
      es: "inalámbrico 2.4G",
      de: "kabellos 2.4G",
    },
  ],
  [
    /Xám đậm trắng xám/g,
    {
      en: "Dark gray white gray",
      fr: "Gris foncé blanc gris",
      it: "Grigio scuro bianco grigio",
      nl: "Donkergrijs wit grijs",
      sv: "Mörkgrå vit grå",
      pt: "Cinza escuro branco cinza",
      es: "Gris oscuro blanco gris",
      de: "Dunkelgrau Weiß Grau",
    },
  ],
  [
    /Xám \+ Trắng \+ Xám đậm/g,
    {
      en: "Gray + White + Dark gray",
      fr: "Gris + Blanc + Gris foncé",
      it: "Grigio + Bianco + Grigio scuro",
      nl: "Grijs + Wit + Donkergrijs",
      sv: "Grå + Vit + Mörkgrå",
      pt: "Cinza + Branco + Cinza escuro",
      es: "Gris + Blanco + Gris oscuro",
      de: "Grau + Weiß + Dunkelgrau",
    },
  ],
  [
    /Bàn phím/g,
    {
      en: "Keyboard",
      fr: "Clavier",
      it: "Tastiera",
      nl: "Toetsenbord",
      sv: "Tangentbord",
      pt: "Teclado",
      es: "Teclado",
      de: "Tastatur",
    },
  ],
];
function trVal(v, lang) {
  let out = String(v);
  for (const [re, w] of VAL) if (w[lang]) out = out.replace(re, w[lang]);
  return out;
}

const OPENING = {
  en: (n, b) =>
    `Discover the ${n}\n\nThe ${n} from ${b} focuses on durable switches, flexible connection modes and a clean tenkeyless layout. Every detail below reflects what the manufacturer ships in the box.\n\nSpec highlights\n\nBuy the ${n} at GearVN\n\nGearVN offers genuine ${b} products with credible warranty support and fast nationwide delivery. Order the ${n} today for a reliable pick.`,
  fr: (n, b) =>
    `Découvrez le ${n}\n\nLe ${n} de ${b} mise sur des switches durables, des modes de connexion flexibles et un format TKL épuré. Chaque détail ci-dessous reflète le contenu de la boîte du fabricant.\n\nPoints clés\n\nAchetez le ${n} chez GearVN\n\nGearVN propose des produits ${b} authentiques avec garantie crédible et livraison rapide. Commandez dès aujourd'hui le ${n} pour un choix fiable.`,
  it: (n, b) =>
    `Scopri il ${n}\n\nIl ${n} di ${b} punta su switch duraturi, modalità di connessione flessibili e un layout tenkeyless essenziale. Ogni dettaglio sotto riflette ciò che il produttore include nella confezione.\n\nPunti salienti\n\nCompra il ${n} su GearVN\n\nGearVN offre prodotti ${b} originali con garanzia credibile e consegna rapida. Ordina subito il ${n} per una scelta affidabile.`,
  nl: (n, b) =>
    `Ontdek de ${n}\n\nDe ${n} van ${b} focust op duurzame switches, flexibele verbindingsmodi en een strak tenkeyless layout. Elk detail hieronder weerspiegelt wat de fabrikant meelevert.\n\nSpec hoogtepunten\n\nKoop de ${n} bij GearVN\n\nGearVN levert originele ${b}-producten met betrouwbare garantie en snelle levering. Bestel de ${n} vandaag voor een betrouwbare keuze.`,
  sv: (n, b) =>
    `Upptäck ${n}\n\n${n} från ${b} fokuserar på hållbara switchar, flexibla anslutningslägen och en ren tenkeyless-layout. Varje detalj nedan speglar vad tillverkaren levererar i lådan.\n\nSpec-höjdpunkter\n\nKöp ${n} hos GearVN\n\nGearVN erbjuder originalprodukter från ${b} med pålitlig garanti och snabb leverans. Beställ ${n} idag för ett tryggt val.`,
  pt: (n, b) =>
    `Descubra o ${n}\n\nO ${n} da ${b} aposta em switches duráveis, modos de ligação flexíveis e um layout tenkeyless limpo. Cada detalhe abaixo reflete o que o fabricante inclui na caixa.\n\nDestaques técnicos\n\nCompre o ${n} na GearVN\n\nA GearVN oferece produtos ${b} originais com garantia credível e entrega rápida. Encomende já o ${n} para uma escolha fiável.`,
  es: (n, b) =>
    `Descubre el ${n}\n\nEl ${n} de ${b} apuesta por switches duraderos, modos de conexión flexibles y un layout tenkeyless limpio. Cada detalle a continuación refleja lo que el fabricante incluye en la caja.\n\nPuntos clave\n\nCompra el ${n} en GearVN\n\nGearVN ofrece productos ${b} originales con garantía creíble y entrega rápida. Pide ya el ${n} para una elección fiable.`,
  de: (n, b) =>
    `Entdecken Sie den ${n}\n\nDer ${n} von ${b} setzt auf langlebige Switches, flexible Verbindungsmodi und ein aufgeräumtes Tenkeyless-Layout. Jedes Detail unten entspricht dem Lieferumfang des Herstellers.\n\nSpec-Highlights\n\nKaufen Sie den ${n} bei GearVN\n\nGearVN bietet originale ${b}-Produkte mit verlässlicher Garantie und schnellem Versand. Bestellen Sie den ${n} noch heute für eine zuverlässige Wahl.`,
};

// spec-bullet paragraphs translated by hand per product family (generic FR
// fragments are turned into proper target-language bullets)
const BULLET_MAP = [
  [
    /Độ bền phím: 60 triệu lần bấm/g,
    {
      en: "Key durability: 60 million presses",
      fr: "Durabilité des touches : 60 millions de pressions",
      it: "Durata dei tasti: 60 milioni di pressioni",
      nl: "Toetsduurzaamheid: 60 miljoen keer drukken",
      sv: "Tangenthållbarhet: 60 miljoner tryck",
      pt: "Durabilidade das teclas: 60 milhões de pressões",
      es: "Durabilidad de las teclas: 60 millones de pulsaciones",
      de: "Tastenhaltbarkeit: 60 Millionen Anschläge",
    },
  ],
  [
    /Thời gian sử dụng sau khi sạc đầy pin: Khoảng 22 giờ \(hiệu ứng ánh sáng mặc định\)\s*\/\s*266 giờ \(khi tắt đèn\)/g,
    {
      en: "Battery life after full charge: about 22 hours (default lighting) / 266 hours (lighting off)",
      fr: "Autonomie après charge complète : environ 22 heures (éclairage par défaut) / 266 heures (éclairage éteint)",
      it: "Autonomia dopo la carica completa: circa 22 ore (illuminazione predefinita) / 266 ore (illuminazione spenta)",
      nl: "Batterijduur na volledig opladen: ca. 22 uur (standaardverlichting) / 266 uur (verlichting uit)",
      sv: "Batteritid efter full laddning: ca 22 timmar (standardbelysning) / 266 timmar (belysning av)",
      pt: "Autonomia após carga completa: cerca de 22 horas (iluminação padrão) / 266 horas (iluminação desligada)",
      es: "Autonomía tras carga completa: unas 22 horas (iluminación predeterminada) / 266 horas (iluminación apagada)",
      de: "Akkulaufzeit nach Volladung: ca. 22 Stunden (Standardbeleuchtung) / 266 Stunden (Beleuchtung aus)",
    },
  ],
  [
    /Kết nối: 3 mode có dây Type-C, không dây 2\.4G & BT/g,
    {
      en: "Connection: 3 modes — wired Type-C, wireless 2.4G & BT",
      fr: "Connexion : 3 modes — Type-C filaire, 2.4G sans fil & BT",
      it: "Connessione: 3 modalità — Type-C cablata, wireless 2.4G e BT",
      nl: "Verbinding: 3 modi — bedraad Type-C, draadloos 2.4G en BT",
      sv: "Anslutning: 3 lägen — trådbunden Type-C, trådlös 2.4G och BT",
      pt: "Ligação: 3 modos — Type-C com fios, 2.4G sem fios e BT",
      es: "Conexión: 3 modos — Type-C con cable, inalámbrico 2.4G y BT",
      de: "Verbindung: 3 Modi — kabelgebunden Type-C, kabellos 2.4G und BT",
    },
  ],
  [
    /Đèn nền: LED RGB - 16 loại hiệu ứng ánh sáng/g,
    {
      en: "Backlight: RGB LED — 16 lighting effects",
      fr: "Rétroéclairage : LED RGB — 16 effets lumineux",
      it: "Retroilluminazione: LED RGB — 16 effetti luce",
      nl: "Verlichting: RGB LED — 16 lichteffecten",
      sv: "Belysning: RGB LED — 16 ljuseffekter",
      pt: "Retroiluminação: LED RGB — 16 efeitos de luz",
      es: "Retroiluminación: LED RGB — 16 efectos de luz",
      de: "Beleuchtung: RGB-LED — 16 Lichteffekte",
    },
  ],
  [
    /Loại switch: Grey wood switch/g,
    {
      en: "Switch type: Grey Wood switch",
      fr: "Type de switch : Grey Wood switch",
      it: "Tipo di switch: Grey Wood switch",
      nl: "Switch-type: Grey Wood switch",
      sv: "Switch-typ: Grey Wood switch",
      pt: "Tipo de switch: Grey Wood switch",
      es: "Tipo de switch: Grey Wood switch",
      de: "Switch-Typ: Grey Wood Switch",
    },
  ],
  [
    /Hiệu ứng âm thanh khi gõ phím: Linear/g,
    {
      en: "Typing sound profile: Linear",
      fr: "Profil sonore de frappe : Linear",
      it: "Profilo sonoro di digitazione: Linear",
      nl: "Typgeluid: Linear",
      sv: "Skrivljud: Linear",
      pt: "Perfil sonoro de digitação: Linear",
      es: "Perfil sonoro al teclear: Linear",
      de: "Schallprofil beim Tippen: Linear",
    },
  ],
  [
    /Hot swap - Gasket mount - Mạch ngược/g,
    {
      en: "Hot swap - Gasket mount - Inverted PCB",
      fr: "Hot swap - Gasket mount - PCB inversé",
      it: "Hot swap - Gasket mount - PCB invertito",
      nl: "Hot swap - Gasket mount - Omgekeerde PCB",
      sv: "Hot swap - Gasket mount - Inverterat PCB",
      pt: "Hot swap - Gasket mount - PCB invertida",
      es: "Hot swap - Gasket mount - PCB invertida",
      de: "Hot-swap - Gasket-Mount - Invertierte Platine",
    },
  ],
  [
    /Hành trình phím: 4\.0mm/g,
    {
      en: "Key travel: 4.0mm",
      fr: "Course des touches : 4.0mm",
      it: "Corsa dei tasti: 4.0mm",
      nl: "Toetsenslag: 4.0mm",
      sv: "Tangentresor: 4.0mm",
      pt: "Curso das teclas: 4.0mm",
      es: "Recorrido de tecla: 4.0mm",
      de: "Tastenweg: 4.0mm",
    },
  ],
  [
    /Điện áp\/dòng sạc: DC5V 600mA/g,
    {
      en: "Charging voltage/current: DC5V 600mA",
      fr: "Tension/courant de charge : DC5V 600mA",
      it: "Tensione/corrente di carica: DC5V 600mA",
      nl: "Laadspanning/stroom: DC5V 600mA",
      sv: "Laddspänning/ström: DC5V 600mA",
      pt: "Tensão/corrente de carregamento: DC5V 600mA",
      es: "Voltaje/corriente de carga: DC5V 600mA",
      de: "Ladespannung/-strom: DC5V 600mA",
    },
  ],
  [
    /Điện áp định mức: DC 3\.7V \(đầy đủ 4\.2V\)/g,
    {
      en: "Rated voltage: DC 3.7V (full 4.2V)",
      fr: "Tension nominale : DC 3.7V (pleine 4.2V)",
      it: "Tensione nominale: DC 3.7V (piena 4.2V)",
      nl: "Nominale spanning: DC 3.7V (vol 4.2V)",
      sv: "Märkspänning: DC 3.7V (full 4.2V)",
      pt: "Tensão nominal: DC 3.7V (plena 4.2V)",
      es: "Voltaje nominal: DC 3.7V (plena 4.2V)",
      de: "Nennspannung: DC 3.7V (voll 4.2V)",
    },
  ],
  [
    /Định mức dòng điện: 180mA @37V \(hiệu ứng ánh sáng mặc định\)\/15 mA \(tắt tất cả đèn\)/g,
    {
      en: "Rated current: 180mA @3.7V (default lighting) / 15mA (all lights off)",
      fr: "Courant nominal : 180mA @3.7V (éclairage par défaut) / 15mA (tout éteint)",
      it: "Corrente nominale: 180mA @3.7V (illuminazione predefinita) / 15mA (tutto spento)",
      nl: "Nominale stroom: 180mA @3.7V (standaardverlichting) / 15mA (alles uit)",
      sv: "Märkström: 180mA @3.7V (standardbelysning) / 15mA (alla lampor av)",
      pt: "Corrente nominal: 180mA @3.7V (iluminação padrão) / 15mA (tudo desligado)",
      es: "Corriente nominal: 180mA @3.7V (iluminación predeterminada) / 15mA (todo apagado)",
      de: "Nennstrom: 180mA @3.7V (Standardbeleuchtung) / 15mA (alles aus)",
    },
  ],
  [
    /Trọng lượng: Xấp xỉ 916g \(không có cáp\/bộ thu\), 935g \(với cáp\/bộ thu\)/g,
    {
      en: "Weight: approx. 916g (without cable/receiver), 935g (with cable/receiver)",
      fr: "Poids : env. 916g (sans câble/récepteur), 935g (avec câble/récepteur)",
      it: "Peso: circa 916g (senza cavo/ricevitore), 935g (con cavo/ricevitore)",
      nl: "Gewicht: ca. 916g (zonder kabel/ontvanger), 935g (met kabel/ontvanger)",
      sv: "Vikt: ca 916g (utan kabel/mottagare), 935g (med kabel/mottagare)",
      pt: "Peso: aprox. 916g (sem cabo/recetor), 935g (com cabo/recetor)",
      es: "Peso: aprox. 916g (sin cable/receptor), 935g (con cable/receptor)",
      de: "Gewicht: ca. 916g (ohne Kabel/Empfänger), 935g (mit Kabel/Empfänger)",
    },
  ],
  [
    /Kích thước bàn phím \(L x W x H\): 365,90 x 139,00 x 41,10 \+1 mm/g,
    {
      en: "Keyboard size (L x W x H): 365.90 x 139.00 x 41.10 +1 mm",
      fr: "Dimensions du clavier (L x l x H) : 365,90 x 139,00 x 41,10 +1 mm",
      it: "Dimensioni tastiera (L x P x H): 365,90 x 139,00 x 41,10 +1 mm",
      nl: "Toetsenbordafmetingen (L x B x H): 365,90 x 139,00 x 41,10 +1 mm",
      sv: "Tangentbordsmått (L x B x H): 365,90 x 139,00 x 41,10 +1 mm",
      pt: "Dimensões do teclado (C x L x A): 365,90 x 139,00 x 41,10 +1 mm",
      es: "Dimensiones del teclado (An x Pr x Al): 365,90 x 139,00 x 41,10 +1 mm",
      de: "Tastaturgröße (L x B x H): 365,90 x 139,00 x 41,10 +1 mm",
    },
  ],
  [
    /Phụ kiện kèm theo: Sách hướng dẫn sử dụng \+ 2 Switch tặng kèm \+ Dây USB type-C \+ Dụng cụ thay keycap/g,
    {
      en: "In the box: user manual + 2 extra switches + USB Type-C cable + keycap puller",
      fr: "Dans la boîte : manuel + 2 switches offerts + câble USB Type-C + extracteur de keycaps",
      it: "Nella confezione: manuale + 2 switch in omaggio + cavo USB Type-C + estrattore keycap",
      nl: "In de doos: handleiding + 2 extra switches + USB Type-C kabel + keycap-trekker",
      sv: "I lådan: manual + 2 extra switchar + USB Type-C-kabel + keycap-avdragare",
      pt: "Na caixa: manual + 2 switches de oferta + cabo USB Type-C + extrator de keycaps",
      es: "En la caja: manual + 2 switches de regalo + cable USB Type-C + extractor de keycaps",
      de: "Im Lieferumfang: Handbuch + 2 Extra-Switches + USB-Type-C-Kabel + Keycap-Zieher",
    },
  ],
  [
    /Màu sắc: Xám đậm trắng xám/g,
    {
      en: "Color: Dark gray white gray",
      fr: "Couleur : gris foncé blanc gris",
      it: "Colore: grigio scuro bianco grigio",
      nl: "Kleur: donkergrijs wit grijs",
      sv: "Färg: mörkgrå vit grå",
      pt: "Cor: cinza escuro branco cinza",
      es: "Color: gris oscuro blanco gris",
      de: "Farbe: dunkelgrau weiß grau",
    },
  ],
  [
    /Số lượng phím: 87 phím/g,
    {
      en: "Number of keys: 87 keys",
      fr: "Nombre de touches : 87 touches",
      it: "Numero di tasti: 87 tasti",
      nl: "Aantal toetsen: 87 toetsen",
      sv: "Antal tangenter: 87 tangenter",
      pt: "Número de teclas: 87 teclas",
      es: "Número de teclas: 87 teclas",
      de: "Anzahl der Tasten: 87 Tasten",
    },
  ],
];
function trBullets(text, lang) {
  let out = text;
  for (const [re, w] of BULLET_MAP) if (w[lang]) out = out.replace(re, w[lang]);
  return out;
}

function detectKind(name) {
  if (/Tai nghe/.test(name)) return "hs";
  if (/Chuột/.test(name)) return "mwl";
  if (/Bàn phím/.test(name)) return "kb";
  return "kb";
}

const OUT = {};
let gen = 0;
for (const block of blocks) {
  const pid = block.match(/^([0-9a-f]+)/)[1];
  const name = (block.match(/NAME: (.*)/)[1] || "").trim();
  const brand = (block.match(/BRAND: (.*)/)[1] || "").trim();
  const langs = block
    .match(/LANGS: (.*)/)[1]
    .trim()
    .split(",")
    .map((s) => s.trim());
  const techMatch = block.match(/TECH_DESCRIPTION \(verbatim\):\n(.*)/);
  const descSrc = block.match(
    /DESCRIPTION \(verbatim\):\n([\s\S]*?)\nIMAGE_ALTS/,
  )[1];
  const specEntries = [];
  const specsBlock = block.match(
    /SPECS \(key=value\):\n([\s\S]*?)\nTECH_DESCRIPTION/,
  );
  if (specsBlock)
    for (const line of specsBlock[1].split("\n")) {
      const m = line.match(/^\s+(\S+)\s=\s(.*)$/);
      if (m) specEntries.push([m[1], m[2]]);
    }
  const kind = detectKind(name);
  const kindKey = /Bàn phím cơ|Switch/i.test(name) ? "kbmech" : kind;
  if (!OUT[pid]) OUT[pid] = {};
  for (const lang of langs) {
    const PP = P[lang] || P.en;
    const strip = name.replace(/^Bàn phím\s+/, "").trim();
    const trName = (PP[kindKey] || PP.kb) + strip;
    let tech = "";
    if (techMatch) {
      const pairs = [...techMatch[1].matchAll(/"([^"]+)":\s*"([^"]*)"/g)];
      tech =
        `${HEADS[lang]}: {` +
        pairs
          .map(
            ([, k, v]) =>
              `"${KEY_TR[k] ? KEY_TR[k][lang] : k}": "${trVal(v, lang)}"`,
          )
          .join(", ") +
        "}";
    }
    const desc =
      OPENING[lang](trName, brand) + "\n\n" + trBullets(descSrc, lang);
    OUT[pid][lang] = {
      name: trName,
      description: desc,
      brand: brand.toUpperCase() === "AULA" ? "AULA" : brand,
      specs: Object.fromEntries(
        specEntries.map(([k, v]) => [k, trVal(v, lang)]),
      ),
      technicalDescription: tech,
      imageAlts: [],
    };
    gen++;
  }
}
console.log(
  "generated:",
  gen,
  "records for",
  Object.keys(OUT).length,
  "products",
);
fs.writeFileSync(OUT_PATH, JSON.stringify(OUT, null, 2) + "\n", "utf8");
