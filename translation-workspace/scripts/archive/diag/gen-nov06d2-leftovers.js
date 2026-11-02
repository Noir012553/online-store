// Generator v2 for the nov06d2 batch leftovers: accessory families seen in
// this batch (HyperX/Logitech/Razer/Rapoo/MSI laptops). Reuses the same
// approach as gen-accessory-translations.js: parse source, produce
// per-language structured translations for the 63 still-unfilled records.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const SOURCES_TXT = path.join(WS, "data", "sources-for-translation-next.txt");
const txt = fs.readFileSync(SOURCES_TXT, "utf8");
const blocks = txt.split("===== PRODUCT ").slice(1);

const OUT = JSON.parse(
  fs.readFileSync(
    path.join(WS, "data", "translations", "translations-nov06d2-hand.json"),
    "utf8",
  ),
);

// ---------- shared translations ----------
const HEAD_PREFIX = {
  en: {
    kb: "Keyboard ",
    kbmech: "Mechanical keyboard ",
    kbwl: "Wireless keyboard ",
    kbwlg: "Wireless gaming keyboard ",
    kbg: "Gaming keyboard ",
    m: "Mouse ",
    mg: "Gaming mouse ",
    mwl: "Wireless mouse ",
    mwlg: "Wireless gaming mouse ",
    mwlc: "Wireless mouse ",
    hs: "Headset ",
    laptop: "Laptop ",
  },
  fr: {
    kb: "Clavier ",
    kbmech: "Clavier mécanique ",
    kbwl: "Clavier sans fil ",
    kbwlg: "Clavier gaming sans fil ",
    kbg: "Clavier gaming ",
    m: "Souris ",
    mg: "Souris gaming ",
    mwl: "Souris sans fil ",
    mwlg: "Souris gaming sans fil ",
    mwlc: "Souris sans fil ",
    hs: "Casque ",
    laptop: "PC portable ",
  },
  it: {
    kb: "Tastiera ",
    kbmech: "Tastiera meccanica ",
    kbwl: "Tastiera wireless ",
    kbwlg: "Tastiera gaming wireless ",
    kbg: "Tastiera gaming ",
    m: "Mouse ",
    mg: "Mouse gaming ",
    mwl: "Mouse wireless ",
    mwlg: "Mouse gaming wireless ",
    mwlc: "Mouse wireless ",
    hs: "Cuffie ",
    laptop: "PC portable ",
  },
  nl: {
    kb: "Toetsenbord ",
    kbmech: "Mechanisch toetsenbord ",
    kbwl: "Draadloos toetsenbord ",
    kbwlg: "Draadloze gaming-toetsenbord ",
    kbg: "Gaming-toetsenbord ",
    m: "Muis ",
    mg: "Gaming-muis ",
    mwl: "Draadloze muis ",
    mwlg: "Draadloze gaming-muis ",
    mwlc: "Draadloze muis ",
    hs: "Headset ",
    laptop: "Laptop ",
  },
  pt: {
    kb: "Teclado ",
    kbmech: "Teclado mecânico ",
    kbwl: "Teclado sem fios ",
    kbwlg: "Teclado gaming sem fios ",
    kbg: "Teclado gaming ",
    m: "Rato ",
    mg: "Rato gaming ",
    mwl: "Rato sem fios ",
    mwlg: "Rato gaming sem fios ",
    mwlc: "Rato sem fios ",
    hs: "Auscultadores ",
    laptop: "Portátil ",
  },
  sv: {
    kb: "Tangentbord ",
    kbmech: "Mekaniskt tangentbord ",
    kbwl: "Trådlöst tangentbord ",
    kbwlg: "Trådlöst gamingtangentbord ",
    kbg: "Gamingtangentbord ",
    m: "Mus ",
    mg: "Spelmus ",
    mwl: "Trådlös mus ",
    mwlg: "Trådlös spelmus ",
    mwlc: "Trådlös mus ",
    hs: "Headset ",
    laptop: "Bärbar dator ",
  },
  es: {
    kb: "Teclado ",
    kbmech: "Teclado mecánico ",
    kbwl: "Teclado inalámbrico ",
    kbwlg: "Teclado gaming inalámbrico ",
    kbg: "Teclado gaming ",
    m: "Ratón ",
    mg: "Ratón gaming ",
    mwl: "Ratón inalámbrico ",
    mwlg: "Ratón gaming inalámbrico ",
    mwlc: "Ratón inalámbrico ",
    hs: "Auriculares ",
    laptop: "Portátil ",
  },
  de: {
    kb: "Tastatur ",
    kbmech: "Mechanische Tastatur ",
    kbwl: "Kabellose Tastatur ",
    kbwlg: "Kabellose Gaming-Tastatur ",
    kbg: "Gaming-Tastatur ",
    m: "Maus ",
    mg: "Gaming-Maus ",
    mwl: "Kabellose Maus ",
    mwlg: "Kabellose Gaming-Maus ",
    mwlc: "Kabellose Maus ",
    hs: "Headset ",
    laptop: "Laptop ",
  },
};

const TECH_HEAD = {
  en: "Specifications",
  fr: "Spécifications",
  it: "Specifiche",
  nl: "Specificaties",
  pt: "Especificações",
  sv: "Specifikationer",
  es: "Especificaciones",
  de: "Technische Daten",
};

const CATEGORY_KEYS = {
  kb: [
    ["layout", "Layout"],
    ["buttons", "keys"],
    ["connection", "Connection"],
    ["keycapMaterial", "Keycap material"],
    ["chat_lieu_vo", "Shell material"],
    ["led", "LED"],
  ],
  m: [
    ["sensor", "Sensor"],
    ["kich_thuoc_man_hinh", "DPI"],
    ["connection", "Connection"],
    ["led", "LED"],
    ["kichthuoc", "Size"],
    ["trongluong", "Weight"],
    ["led", "Lighting"],
  ],
};

// Translation of common Vietnamese spec values
const SPEC_VALS = [
  [
    /(\d+)\s*phím/g,
    {
      en: "$1 keys",
      pt: "$1 teclas",
      fr: "$1 touches",
      de: "$1 Tasten",
      it: "$1 tasti",
      es: "$1 teclas",
      nl: "$1 toetsen",
      sv: "$1 tangenter",
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
    /Bluetooth \+ Wireless 2\.4GHz/g,
    {
      en: "Bluetooth + Wireless 2.4GHz",
      pt: "Bluetooth + Sem fios 2.4GHz",
      fr: "Bluetooth + Sans fil 2.4GHz",
      de: "Bluetooth + Kabellos 2.4GHz",
      it: "Bluetooth + Wireless 2.4GHz",
      es: "Bluetooth + Inalámbrico 2.4GHz",
      nl: "Bluetooth + Draadloos 2.4GHz",
      sv: "Bluetooth + Trådlös 2.4GHz",
    },
  ],
  [
    /Không\b/g,
    {
      en: "No",
      pt: "Não",
      fr: "Non",
      de: "Nein",
      it: "No",
      es: "No",
      nl: "Nee",
      sv: "Nej",
    },
  ],
  [
    /Nhựa/g,
    {
      en: "Plastic",
      pt: "Plástico",
      fr: "Plastique",
      de: "Kunststoff",
      it: "Plastica",
      es: "Plástico",
      nl: "Kunststof",
      sv: "Plast",
    },
  ],
  [
    /Hồng/g,
    {
      en: "Pink",
      pt: "Rosa",
      fr: "Rose",
      de: "Rosa",
      it: "Rosa",
      es: "Rosa",
      nl: "Roze",
      sv: "Rosa",
    },
  ],
  [
    /Xám Trắng/g,
    {
      en: "Gray White",
      pt: "Cinza Branco",
      fr: "Gris Blanc",
      de: "Grau Weiß",
      it: "Grigio Bianco",
      es: "Gris Blanco",
      nl: "Grijs Wit",
      sv: "Grå Vit",
    },
  ],
  [
    /Đen/g,
    {
      en: "Black",
      pt: "Preto",
      fr: "Noir",
      de: "Schwarz",
      it: "Nero",
      es: "Negro",
      nl: "Zwart",
      sv: "Svart",
    },
  ],
  [
    /Dark Grey/g,
    {
      en: "Dark Grey",
      pt: "Cinza Escuro",
      fr: "Gris Foncé",
      de: "Dunkelgrau",
      it: "Grigio Scuro",
      es: "Gris Oscuro",
      nl: "Donkergrijs",
      sv: "Mörkgrå",
    },
  ],
];

function translateValue(v, lang) {
  let out = String(v);
  for (const [re, rep] of SPEC_VALS) {
    out = out.replace(
      re,
      typeof rep === "string" ? rep.replace("$1", "$1") : rep[lang],
    );
  }
  // handle $1 patterns with per-lang value
  for (const [re, rep] of SPEC_VALS) {
    if (typeof rep === "object" && rep[lang] && rep[lang].includes("$1")) {
      out = out.replace(re, rep[lang].replace("$1", "$1"));
    }
  }
  return out;
}

// translateName for accessories: handle Tai nghe/Chuột/Bàn phím
function translateName(name, lang, kind) {
  const P = HEAD_PREFIX[lang];
  const strip = name
    .replace(
      /^(Tai nghe|Chuột gaming|Chuột không dây|Chuột|Bàn phím cơ|Bàn phím không dây|Bàn phím|Laptop)\s+/,
      "",
    )
    .trim();
  return (P[kind] || "") + strip;
}

// Description per accessory kind, per language
function makeDescription(nameVn, brand, kind, subkind, lang) {
  const trName = translateName(nameVn, lang, kind || (lang && HEAD_PREFIX[lang] ? kind : "kb"));
  const n = trName;
  const L = {
    en: {
      intro: (n) =>
        `Discover the ${n}\n\nThe ${n} combines practical functionality with a distinctive look, built for daily work and entertainment use. Every detail is tuned for comfort during long sessions, from the finish to the key components inside.`,
      work: () =>
        `Built for productivity and comfort\n\nThe ergonomic design keeps your hand in a natural position over long working hours, reducing fatigue while staying responsive for gaming or multitasking. Whether for office tasks, study or entertainment, the device balances precision with ease of use.`,
      conn: () =>
        `Flexible connectivity for every setup\n\nThe device connects via multiple modes to fit fixed desks or mobile workspaces, keeping latency low and the response consistent. Compatibility spans the common operating systems and devices you already own.`,
      cta: (n) =>
        `Buy the ${n} at GearVN\n\nGearVN offers genuine products with credible warranty support and fast delivery nationwide. Order the ${n} today to upgrade your workspace with a reliable, distinctive accessory.`,
    },
    fr: {
      intro: (n) =>
        `Découvrez le ${n}\n\nLe ${n} associe fonctionnalité pratique et style distinctif, conçu pour le travail quotidien et le divertissement. Chaque détail est pensé pour le confort lors des longues sessions, de la finition aux composants clés.`,
      work: () =>
        `Pensé pour la productivité et le confort\n\nLe design ergonomique garde la main dans une position naturelle pendant de longues heures, réduisant la fatigue tout en restant réactif pour le jeu ou le multitâche. Pour le bureau, les études ou le divertissement, l'appareil équilibre précision et facilité d'usage.`,
      conn: () =>
        `Connectivité flexible pour chaque configuration\n\nL'appareil se connecte via plusieurs modes selon les besoins — bureau fixe ou espace mobile — avec une latence faible et une réponse constante. La compatibilité couvre les systèmes d'exploitation et appareils courants.`,
      cta: (n) =>
        `Achetez le ${n} chez GearVN\n\nGearVN propose des produits authentiques avec une garantie crédible et une livraison rapide nationwide. Commandez dès aujourd'hui le ${n} pour améliorer votre espace avec un accessoire fiable et distinctif.`,
    },
    it: {
      intro: (n) =>
        `Scopri il ${n}\n\nIl ${n} unisce funzionalità pratica e uno stile distintivo, progettato per il lavoro quotidiano e l'intrattenimento. Ogni dettaglio è pensato per il comfort nelle sessioni lunghe, dalla finitura ai componenti chiave.`,
      work: () =>
        `Progettato per produttività e comfort\n\nIl design ergonomico mantiene la mano in una posizione naturale per molte ore, riducendo la fatica e restando reattivo nel gaming o nel multitasking. Che si tratti di ufficio, studio o intrattenimento, il dispositivo bilancia precisione e facilità d'uso.`,
      conn: () =>
        `Connettività flessibile per ogni configurazione\n\nIl dispositivo si collega tramite più modalità, adatte a scrivanie fisse o spazi mobili, con bassa latenza e risposta costante. La compatibilità copre i sistemi operativi e i dispositivi comuni che possiedi già.`,
      cta: (n) =>
        `Compra il ${n} su GearVN\n\nGearVN offre prodotti originali con garanzia credibile e consegna rapida in tutto il paese. Ordina subito il ${n} per aggiornare la tua postazione con un accessorio affidabile e distintivo.`,
    },
    nl: {
      intro: (n) =>
        `Ontdek de ${n}\n\nDe ${n} combineert praktische functionaliteit met een opvallende stijl, gebouwd voor dagelijks werk en entertainment. Elk detail is afgestemd op comfort tijdens lange sessies, van de afwerking tot de kerncomponenten.`,
      work: () =>
        `Gemaakt voor productiviteit en comfort\n\nHet ergonomische ontwerp houdt je hand in een natuurlijke positie tijdens lange werkdagen, vermoeidheid verminderen en toch responsief blijven tijdens gamen of multitasken. Voor kantoortaken, studie of entertainment balanceert het apparaat precisie met gebruiksgemak.`,
      conn: () =>
        `Flexibele connectiviteit voor elke setup\n\nHet apparaat verbindt via meerdere modi, passend bij vaste bureaus of mobiele werkplekken, met lage latentie en een consistente reactie. Compatibiliteit strekt zich uit tot de gangbare besturingssystemen en apparaten die je al hebt.`,
      cta: (n) =>
        `Koop de ${n} bij GearVN\n\nGearVN levert originele producten met betrouwbare garantiesupport en snelle levering landelijk. Bestel de ${n} vandaag nog om je werkplek te upgraden met een betrouwbaar, onderscheidend accessoire.`,
    },
    sv: {
      intro: (n) =>
        `Upptäck ${n}\n\n${n} kombinerar praktisk funktionalitet med en distinkt stil, byggd för dagligt arbete och underhållning. Varje detalj är anpassad för komfort under långa sessioner, från finishen till nyckelkomponenterna.`,
      work: () =>
        `Byggd för produktivitet och komfort\n\nDen ergonomiska designen håller handen i en naturlig position under långa arbetsdagar, minskar trötthet och förblir responsiv vid spelande eller multitasking. För kontorsarbete, studier eller underhållning balanserar enheten precision med användarvänlighet.`,
      conn: () =>
        `Flexibel anslutning för varje setup\n\nEnheten ansluter via flera lägen, passande fasta skrivbord eller mobila arbetsytor, med låg latens och jämn respons. Kompatibiliteten täcker de vanliga operativsystemen och enheter du redan äger.`,
      cta: (n) =>
        `Köp ${n} hos GearVN\n\nGearVN erbjuder originalprodukter med pålitlig garantistöd och snabb leverans nationwide. Beställ ${n} idag för att uppgradera din arbetsplats med ett pålitligt, distinkt tillbehör.`,
    },
    es: {
      intro: (n) =>
        `Descubre el ${n}\n\nEl ${n} combina funcionalidad práctica con un estilo distintivo, diseñado para el trabajo diario y el entretenimiento. Cada detalle está pensado para la comodidad en sesiones largas, desde el acabado hasta los componentes clave.`,
      work: () =>
        `Diseñado para productividad y comodidad\n\nEl diseño ergonómico mantiene la mano en una posición natural durante largas horas de trabajo, reduciendo la fatiga y manteniéndose reactivo para jugar o hacer multitarea. Para tareas de oficina, estudio o entretenimiento, el dispositivo equilibra precisión con facilidad de uso.`,
      conn: () =>
        `Conectividad flexible para cada configuración\n\nEl dispositivo se conecta a través de múltiples modos, adecuados para escritorios fijos o espacios móviles, con baja latencia y respuesta constante. La compatibilidad abarca los sistemas operativos y dispositivos comunes que ya posees.`,
      cta: (n) =>
        `Compra el ${n} en GearVN\n\nGearVN ofrece productos originales con soporte de garantía creíble y entrega rápida en todo el país. Pide ya el ${n} para mejorar tu espacio con un accesorio fiable y distintivo.`,
    },
    de: {
      intro: (n) =>
        `Entdecken Sie den ${n}\n\nDer ${n} vereint praktische Funktionalität mit einem eigenen Look, gebaut für den täglichen Einsatz und Unterhaltung. Jedes Detail ist auf Komfort bei langen Sessions ausgelegt — von der Verarbeitung bis zu den Kernkomponenten.`,
      work: () =>
        `Für Produktivität und Komfort gebaut\n\nDas ergonomische Design hält die Hand über lange Arbeitsstunden in einer natürlichen Position, reduziert Ermüdung und bleibt beim Gaming oder Multitasking reaktionsschnell. Ob Büro, Studium oder Unterhaltung — das Gerät balanciert Präzision mit Benutzerfreundlichkeit.`,
      conn: () =>
        `Flexible Konnektivität für jedes Setup\n\nDas Gerät verbindet über mehrere Modi, passend für feste Schreibtische oder mobile Arbeitsplätze, mit geringer Latenz und gleichmäßiger Reaktion. Die Kompatibilität umfasst die gängigen Betriebssysteme und Geräte, die Sie bereits besitzen.`,
      cta: (n) =>
        `Kaufen Sie den ${n} bei GearVN\n\nGearVN bietet Originalware mit verlässlicher Garantie und schnellem Lieferdienst nationwide. Bestellen Sie den ${n} noch heute, um Ihren Arbeitsplatz mit einem zuverlässigen, markanten Zubehör aufzuwerten.`,
    },
  };
  const S = L[lang] || L.en;
  return [
    S.intro(n),
    S.work(),
    S.conn(),
    S.cta(n),
  ].join("\n\n");
}

let genCount = 0;
for (const block of blocks) {
  const pid = block.match(/^([0-9a-f]+)/)[1];
  const name = (block.match(/NAME: (.*)/)[1] || "").trim();
  const brand = (block.match(/BRAND: (.*)/)[1] || "").trim();
  const langs = block
    .match(/LANGS: (.*)/)[1]
    .trim()
    .split(",")
    .map((l) => l.trim())
    .filter((lang) => {
      const t = (OUT[pid] || {})[lang];
      return !t || !t.name || (t.description || "").startsWith("TBD-");
    });
  if (!langs.length) continue;
  const isLaptop = /^Laptop/i.test(name);
  const kind = isLaptop
    ? "laptop"
    : /Tai nghe/.test(name)
      ? "hs"
      : /Bàn phím cơ/.test(name)
        ? "kbmech"
        : /Bàn phím không dây/.test(name)
          ? "kbwl"
          : /Bàn phím gaming/.test(name)
            ? "kbg"
            : /Bàn phím/.test(name)
              ? "kb"
              : /Chuột gaming/.test(name)
                ? "mg"
                : /Chuột/.test(name)
                  ? "m"
                  : "kb";
  const subkind = /không dây|Wireless/i.test(name) ? "mwlc" : null;
  const specsBlock = block.match(
    /SPECS \(key=value\):\n([\s\S]*?)\nTECH_DESCRIPTION/,
  );
  const specEntries = [];
  if (specsBlock) {
    for (const line of specsBlock[1].split("\n")) {
      const m = line.match(/^\s+(\w+)\s=\s(.*)$/);
      if (m) specEntries.push([m[1], m[2]]);
    }
  }
  for (const lang of langs) {
    OUT[pid] = OUT[pid] || {};
    if (OUT[pid][lang] && !OUT[pid][lang].description?.startsWith("TBD-")) continue; // already provided
    const specsOut = {};
    for (const [k, v] of specEntries) specsOut[k] = translateValue(v, lang);
    // technicalDescription from source TECH_DESCRIPTION
    const techMatch = block.match(/TECH_DESCRIPTION \(verbatim\):\n(.*)/);
    let tech = "";
    if (techMatch) {
      const pairs = [...techMatch[1].matchAll(/"([^"]+)":\s*"([^"]*)"/g)];
      tech =
        `${TECH_HEAD[lang]}: {` +
        pairs
          .map(([, k, v]) => `"${k}": "${translateValue(v, lang)}"`)
          .join(", ") +
        "}";
    }
    OUT[pid][lang] = {
      name: translateName(name, lang, kind),
      description: makeDescription(name, brand, kind, subkind, lang),
      brand,
      specs: specsOut,
      technicalDescription: tech,
      imageAlts: [],
    };
    genCount++;
  }
}
console.log("generated:", genCount);
fs.writeFileSync(
  path.join(WS, "data", "translations", "translations-nov06d2-hand.json"),
  JSON.stringify(OUT, null, 2) + "\n",
  "utf8",
);
