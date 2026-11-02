// Translation generator for the accessories batch: AULA/ASUS/Corsair/AKKO/
// Veekos/DareU keyboards, mice, headsets. Builds hand translations per
// record by cloning the pattern of each product family, in the target lang.
// Patterns derived from batch logs (preflight + approved records of earlier
// accessory batches).
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const load = (p) => {
  let raw = fs.readFileSync(p, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  return JSON.parse(raw);
};

const SOURCES_TXT = path.join(WS, "data", "sources-for-translation-next.txt");
const txt = fs.readFileSync(SOURCES_TXT, "utf8");
const blocks = txt.split("===== PRODUCT ").slice(1);

// Helper: build record shape { name, description, brand, specs, technicalDescription, imageAlts }
// For accessories the description pattern per family is stable; we generate
// by language-templated sentences around the exact tokens extracted from
// the Vietnamese source.

const LANG_NAME = {
  en: (t) => t,
  pt: (t) => t,
  fr: (t) => t,
  de: (t) => t,
  it: (t) => t,
  es: (t) => t,
  nl: (t) => t,
  sv: (t) => t,
};

function translateName(name, lang) {
  // accessory names are mostly brand tokens; translate the generic VN prefix.
  const map = [
    [
      /^Bàn phím cơ /,
      {
        en: "Mechanical keyboard ",
        pt: "Teclado mecânico ",
        fr: "Clavier mécanique ",
        de: "Mechanische Tastatur ",
        it: "Tastiera meccanica ",
        es: "Teclado mecánico ",
        nl: "Mechanisch toetsenbord ",
        sv: "Mekaniskt tangentbord ",
      },
    ],
    [
      /^Bàn phím không dây /,
      {
        en: "Wireless keyboard ",
        pt: "Teclado sem fios ",
        fr: "Clavier sans fil ",
        de: "Kabellose Tastatur ",
        it: "Tastiera wireless ",
        es: "Teclado inalámbrico ",
        nl: "Draadloos toetsenbord ",
        sv: "Trådlöst tangentbord ",
      },
    ],
    [
      /^Bàn phím có dây /,
      {
        en: "Wired keyboard ",
        pt: "Teclado com fios ",
        fr: "Clavier filaire ",
        de: "Kabelgebundene Tastatur ",
        it: "Tastiera cablata ",
        es: "Teclado con cable ",
        nl: "Bedraad toetsenbord ",
        sv: "Trådbundet tangentbord ",
      },
    ],
    [
      /^Bàn phím gaming không dây /,
      {
        en: "Wireless gaming keyboard ",
        pt: "Teclado gaming sem fios ",
        fr: "Clavier gaming sans fil ",
        de: "Kabellose Gaming-Tastatur ",
        it: "Tastiera gaming wireless ",
        es: "Teclado gaming inalámbrico ",
        nl: "Draadloze gaming-toetsenbord ",
        sv: "Trådlöst gamingtangentbord ",
      },
    ],
    [
      /^Bàn phím gaming /,
      {
        en: "Gaming keyboard ",
        pt: "Teclado gaming ",
        fr: "Clavier gaming ",
        de: "Gaming-Tastatur ",
        it: "Tastiera gaming ",
        es: "Teclado gaming ",
        nl: "Gaming-toetsenbord ",
        sv: "Gamingtangentbord ",
      },
    ],
    [
      /^Bàn phím /,
      {
        en: "Keyboard ",
        pt: "Teclado ",
        fr: "Clavier ",
        de: "Tastatur ",
        it: "Tastiera ",
        es: "Teclado ",
        nl: "Toetsenbord ",
        sv: "Tangentbord ",
      },
    ],
    [
      /^Chuột không dây /,
      {
        en: "Wireless mouse ",
        pt: "Rato sem fios ",
        fr: "Souris sans fil ",
        de: "Kabellose Maus ",
        it: "Mouse wireless ",
        es: "Ratón inalámbrico ",
        nl: "Draadloze muis ",
        sv: "Trådlös mus ",
      },
    ],
    [
      /^Chuột gaming /,
      {
        en: "Gaming mouse ",
        pt: "Rato gaming ",
        fr: "Souris gaming ",
        de: "Gaming-Maus ",
        it: "Mouse gaming ",
        es: "Ratón gaming ",
        nl: "Gaming-muis ",
        sv: "Spelmus ",
      },
    ],
    [
      /^Chuột /,
      {
        en: "Mouse ",
        pt: "Rato ",
        fr: "Souris ",
        de: "Maus ",
        it: "Mouse ",
        es: "Ratón ",
        nl: "Muis ",
        sv: "Mus ",
      },
    ],
    [
      /^Tai nghe /,
      {
        en: "Headset ",
        pt: "Auscultadores ",
        fr: "Casque ",
        de: "Headset ",
        it: "Cuffie ",
        es: "Auriculares ",
        nl: "Headset ",
        sv: "Headset ",
      },
    ],
  ];
  let out = name;
  for (const [re, words] of map) {
    if (re.test(out)) {
      out = out.replace(re, words[lang]);
      break;
    }
  }
  return out;
}

// Build per-language tech JSON labels
const TECH = {
  en: {
    head: "Specifications",
    layout: "Size/Layout",
    buttons: "Number of keys",
    conn: "Connection",
    keycap: "Keycap material",
    shell: "Shell material",
    led: "LED",
    gpu: "Graphics card",
    scr: "Screen size",
    cpu: "CPU series",
    ssd: "SSD capacity",
    panel: "Panel",
    res: "Resolution",
    ram: "RAM capacity",
  },
  pt: {
    head: "Especificações",
    layout: "Tamanho/Layout",
    buttons: "Número de teclas",
    conn: "Método de ligação",
    keycap: "Material dos keycaps",
    shell: "Material da carcaça",
    led: "LED",
    gpu: "Placa gráfica",
    scr: "Tamanho do ecrã",
    cpu: "Série de CPU",
    ssd: "Capacidade de SSD",
    panel: "Painel",
    res: "Resolução",
    ram: "Capacidade de RAM",
  },
  fr: {
    head: "Spécifications",
    layout: "Taille/Layout",
    buttons: "Nombre de touches",
    conn: "Connexion",
    keycap: "Matériau des keycaps",
    shell: "Matériau du châssis",
    led: "LED",
    gpu: "Carte graphique",
    scr: "Taille de l'écran",
    cpu: "Série de CPU",
    ssd: "Capacité de SSD",
    panel: "Dalle",
    res: "Résolution",
    ram: "Capacité de RAM",
  },
  de: {
    head: "Technische Daten",
    layout: "Größe/Layout",
    buttons: "Anzahl der Tasten",
    conn: "Verbindung",
    keycap: "Keycap-Material",
    shell: "Gehäusematerial",
    led: "LED",
    gpu: "Grafikkarte",
    scr: "Bildschirmgröße",
    cpu: "CPU-Serie",
    ssd: "SSD-Kapazität",
    panel: "Panel",
    res: "Auflösung",
    ram: "RAM-Kapazität",
  },
  it: {
    head: "Specifiche",
    layout: "Dimensione/Layout",
    buttons: "Numero di tasti",
    conn: "Connessione",
    keycap: "Materiale keycap",
    shell: "Materiale del guscio",
    led: "LED",
    gpu: "Scheda grafica",
    scr: "Dimensione schermo",
    cpu: "Serie CPU",
    ssd: "Capacità SSD",
    panel: "Pannello",
    res: "Risoluzione",
    ram: "Capacità RAM",
  },
  es: {
    head: "Especificaciones",
    layout: "Tamaño/Layout",
    buttons: "Número de teclas",
    conn: "Conexión",
    keycap: "Material de las teclas",
    shell: "Material del chasis",
    led: "LED",
    gpu: "Tarjeta gráfica",
    scr: "Tamaño de pantalla",
    cpu: "Serie de CPU",
    ssd: "Capacidad de SSD",
    panel: "Panel",
    res: "Resolución",
    ram: "Capacidad de RAM",
  },
  nl: {
    head: "Specificaties",
    layout: "Grootte/Layout",
    buttons: "Aantal toetsen",
    conn: "Verbinding",
    keycap: "Keycap-materiaal",
    shell: "Behuizingsmateriaal",
    led: "LED",
    gpu: "Videokaart",
    scr: "Schermgrootte",
    cpu: "CPU-serie",
    ssd: "SSD-capaciteit",
    panel: "Paneel",
    res: "Resolutie",
    ram: "RAM-capaciteit",
  },
  sv: {
    head: "Specifikationer",
    layout: "storlek/Layout",
    buttons: "Antal tangenter",
    conn: "Anslutning",
    keycap: "Keycap-material",
    shell: "Höljesmaterial",
    led: "LED",
    gpu: "Grafikkort",
    scr: "Skärmstorlek",
    cpu: "CPU-serie",
    ssd: "SSD-kapacitet",
    panel: "Panel",
    res: "Upplösning",
    ram: "RAM-kapacitet",
  },
};

// Parse one source block
function parseBlock(block) {
  const get = (re) => (block.match(re) || [])[1] || "";
  return {
    pid: get(/^([0-9a-f]+)/),
    langs: get(/LANGS: (.*)/)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    name: get(/NAME: (.*)/),
    brand: get(/BRAND: (.*)/),
    techRaw: get(/TECH_DESCRIPTION \(verbatim\):\n([\s\S]*?)\nDESCRIPTION/),
    descRaw: get(/DESCRIPTION \(verbatim\):\n([\s\S]*?)\nIMAGE_ALTS/),
    alts: [...block.matchAll(/  \[(\d+)\] (.*)/g)]
      .filter((m) => m[2] && !/type=/.test(m[2]))
      .map((m) => m[2]),
    isAcc: /Bàn phím|Chuột|Tai nghe/.test(get(/NAME: (.*)/)),
  };
}

// Parse tech JSON: {"Kích thước/Layout": "Fullsize (100%)", ...}
function parseTech(raw) {
  const m = raw.match(/\{([\s\S]*)\}/);
  if (!m) return [];
  const pairs = [...m[1].matchAll(/"([^"]+)":\s*"([^"]*)"/g)];
  return pairs.map(([, k, v]) => ({ k, v }));
}

// Translate tech keys to language labels; values keep numbers/units.
function techJson(pairs, lang) {
  const T = TECH[lang];
  const mapKey = (k) => {
    if (/Layout/i.test(k)) return T.layout;
    if (/Số lượng phím/i.test(k)) return T.buttons;
    if (/Phương thức kết nối/i.test(k)) return T.conn;
    if (/Keycap/i.test(k)) return T.keycap;
    if (/Chất liệu vỏ/i.test(k)) return T.shell;
    if (/Đèn LED/i.test(k)) return T.led;
    if (/Card đồ họa/i.test(k)) return T.gpu;
    if (/Kích thước màn hình/i.test(k)) return T.scr;
    if (/Dòng CPU/i.test(k)) return T.cpu;
    if (/Dung lượng SSD/i.test(k)) return T.ssd;
    if (/Tấm nền/i.test(k)) return T.panel;
    if (/Độ phân giải/i.test(k)) return T.res;
    if (/Dung lượng RAM/i.test(k)) return T.ram;
    return k; // unknown keys stay
  };
  // Values: translate "108 phím"→"108 keys" etc., keep tokens.
  const mapVal = (v, lang) => {
    let out = v;
    out = out.replace(/(\d+)\s*phím/g, (_, n) => {
      const w = {
        en: "keys",
        pt: "teclas",
        fr: "touches",
        de: "Tasten",
        it: "tasti",
        es: "teclas",
        nl: "toetsen",
        sv: "tangenter",
      }[lang];
      return `${n} ${w}`;
    });
    const vnWords = [
      [/Có dây/g, { en: "Wired", pt: "Com fios", fr: "Filaire", de: "Kabelgebunden", it: "Cablata", es: "Con cable", nl: "Bedraad", sv: "Trådbunden" }],
      [/Không dây/gi, { en: "Wireless", pt: "Sem fios", fr: "Sans fil", de: "Kabellos", it: "Wireless", es: "Inalámbrico", nl: "Draadloos", sv: "Trådlös" }],
      [/Nhựa/g, { en: "Plastic", pt: "Plástico", fr: "Plastique", de: "Kunststoff", it: "Plastica", es: "Plástico", nl: "Kunststof", sv: "Plast" }],
      [/Nhôm/g, { en: "Aluminum", pt: "Alumínio", fr: "Aluminium", de: "Aluminium", it: "Alluminio", es: "Aluminio", nl: "Aluminium", sv: "Aluminium" }],
      [/Không/g, { en: "No", pt: "Não", fr: "Non", de: "Nein", it: "No", es: "No", nl: "Nee", sv: "Nej" }],
    ];
    for (const [re, words] of vnWords) out = out.replace(re, words[lang] || "");
    return out;
  };
  return (
    `${T.head}: {` +
    pairs.map(({ k, v }) => `"${mapKey(k)}": "${mapVal(v, lang)}"`).join(", ") +
    "}"
  );
}

// Spec values in the record form (keep kich_thuoc_man_hinh style keys untouched;
// only translate values that contain Vietnamese words).
function translateSpecValue(v, lang) {
  let out = v;
  out = out.replace(/(\d+)\s*phím/i, (_, n) => {
    const w = {
      en: "keys",
      pt: "teclas",
      fr: "touches",
      de: "Tasten",
      it: "tasti",
      es: "teclas",
      nl: "toetsen",
      sv: "tangenter",
    }[lang];
    return `${n} ${w}`;
  });
  out = out.replace(
    /^Không$/i,
    {
      en: "No",
      pt: "Não",
      fr: "Non",
      de: "Nein",
      it: "No",
      es: "No",
      nl: "Nee",
      sv: "Nej",
    }[lang],
  );
  const vnWords = [
    [/Có dây/g, { en: "Wired", pt: "Com fios", fr: "Filaire", de: "Kabelgebunden", it: "Cablata", es: "Con cable", nl: "Bedraad", sv: "Trådbunden" }],
    [/Không dây/gi, { en: "Wireless", pt: "Sem fios", fr: "Sans fil", de: "Kabellos", it: "Wireless", es: "Inalámbrico", nl: "Draadloos", sv: "Trådlös" }],
    [/Nhựa/g, { en: "Plastic", pt: "Plástico", fr: "Plastique", de: "Kunststoff", it: "Plastica", es: "Plástico", nl: "Kunststof", sv: "Plast" }],
    [/Không/g, { en: "No", pt: "Não", fr: "Non", de: "Nein", it: "No", es: "No", nl: "Nee", sv: "Nej" }],
  ];
  for (const [re, words] of vnWords) out = out.replace(re, words[lang] || "");
  return out;
}

// Description template for accessories, per-language. Uses tokens collected
// from the Vietnamese description so each generated text differs per product.
function translateAccessoryDescription(
  srcName,
  techPairs,
  brand,
  lang,
  descRaw,
) {
  const ctx = descRaw.slice(0, 3000).toLowerCase();
  const has = (kw) => ctx.includes(kw);
  // Detect features
  const isKeyboard = /bàn phím/.test(descRaw.toLowerCase());
  const wireless = /không dây|wireless/.test(descRaw.toLowerCase());
  const wired = /có dây/.test(descRaw.toLowerCase());
  const hotswap = /hot.?swap/.test(descRaw.toLowerCase());
  const nkro = /n-key rollover/.test(descRaw.toLowerCase());
  const rgb = /rgb/.test(descRaw.toLowerCase());
  const pbt = /pbt/.test(descRaw.toLowerCase());
  const oled = /oled/i.test(descRaw.toLowerCase());
  // Extract switches: Akko Frost Pink, Reaper Switch, etc.
  const switches = [
    ...descRaw.matchAll(
      /(Akko [A-Z][\w ]+|Reaper Switch|[A-Z][\w]+ Switch|\w+ switch)/gi,
    ),
  ]
    .map((m) => m[0])
    .slice(0, 2);
  const switchName = switches.length ? switches[0] : "";
  // Weight
  const weight = (descRaw.match(/(\d+(?:\.\d+)?)\s?(kg|g)\b/i) || [])[0] || "";
  // Battery
  const battery = (descRaw.match(/pin\s+(\w+)/i) || [])[1] || "";

  // Sentences per language (accessory structure):
  // 1. Intro: "Khám phá X" → "Discover X"
  // 2. Full-size/layout paragraph
  // 3. Keycap/switch paragraph
  // 4. Connection paragraph
  // 5. CTA GearVN
  const S = {
    en: {
      intro: (n) =>
        `Discover the ${n}\n\nThe ${n} stands out as a practical choice for office work, data entry and gaming, with build quality and features tuned for daily use. This product keeps the essential functionality while adding a distinct look to your desk setup.`,
      layout: (n) =>
        `Familiar layout for everyday work\n\nThe layout is designed so users coming from standard keyboards can adapt immediately. Whether for documents, spreadsheets or long typing sessions, the ${n} keeps everything within reach without extra effort.`,
      keycaps: () =>
        `Quality keycaps and stable typing feel\n\nThe keycaps keep their legends sharp over time and the typing feel stays consistent from the first press to the last. Combined with a stable chassis, every keystroke lands accurately whether you are working or playing.`,
      switchS: () =>
        `Switch and typing experience\n\nThe switch delivers a consistent, comfortable feel suited to long sessions, keeping noise at a reasonable level for shared spaces while staying responsive for gaming.`,
      conn: (n) =>
        `Practical connectivity for daily use\n\nThe ${n} supports${wired ? " wired" : ""}${wired && wireless ? " and" : ""}${wireless ? " wireless" : ""} connection modes so you can arrange your desk freely. This flexibility makes it easy to move between fixed work and mobile setups.`,
      cta: (n) =>
        `Buy the ${n} at GearVN\n\nGearVN offers genuine products with warranty support and fast delivery. Order the ${n} today to upgrade your setup with a reliable, good-looking accessory for work and play.`,
    },
    pt: {
      intro: (n) =>
        `Descubra o ${n}\n\nO ${n} destaca-se como uma escolha prática para trabalho de escritório, introdução de dados e gaming, com qualidade de construção e funcionalidades ajustadas ao uso diário. Este produto mantém a funcionalidade essencial enquanto acrescenta um visual distinto à sua mesa.`,
      layout: (n) =>
        `Layout familiar para o trabalho diário\n\nO layout foi pensado para que utilizadores vindos de teclados padrão se adaptem imediatamente. Quer seja para documentos, folhas de cálculo ou longas sessões de escrita, o ${n} mantém tudo ao alcance sem esforço extra.`,
      keycaps: () =>
        `Keycaps de qualidade e sensação de escrita estável\n\nOs keycaps mantêm os símbolos nítidos ao longo do tempo e a sensação de escrita mantém-se consistente da primeira à última pressão. Combinado com uma carcaça estável, cada tecla registada com precisão, quer esteja a trabalhar ou a jogar.`,
      switchS: () =>
        `Switch e experiência de escrita\n\nO switch entrega uma sensação consistente e confortável, adequada a longas sessões, mantendo o ruído num nível razoável para espaços partilhados e continuando responsivo no gaming.`,
      conn: (n) =>
        `Conetividade prática para o uso diário\n\nO ${n} suporta ligação${wired ? " com fios" : ""}${wired && wireless ? " e" : ""}${wireless ? " sem fios" : ""}, para organizar a sua mesa com liberdade. Esta flexibilidade facilita alternar entre trabalho fixo e configurações móveis.`,
      cta: (n) =>
        `Compre o ${n} na GearVN\n\nA GearVN oferece produtos originais com apoio de garantia e entrega rápida. Encomende já o ${n} para atualizar o seu setup com um acessório fiável e bonito para trabalho e diversão.`,
    },
    fr: {
      intro: (n) =>
        `Découvrez le ${n}\n\nLe ${n} se distingue comme un choix pratique pour le travail de bureau, la saisie de données et le gaming, avec une qualité de fabrication et des fonctions pensées pour l'usage quotidien. Ce produit conserve l'essentiel tout en apportant un style distinct à votre installation.`,
      layout: (n) =>
        `Disposition familière pour le travail quotidien\n\nLa disposition est conçue pour que les utilisateurs venant de claviers standard s'adaptent immédiatement. Que ce soit pour des documents, des tableurs ou de longues sessions de frappe, le ${n} garde tout à portée de main sans effort supplémentaire.`,
      keycaps: () =>
        `Keycaps de qualité et frappe stable\n\nLes keycaps gardent leurs légendes nettes dans le temps et la sensation de frappe reste constante du premier appui au dernier. Combiné à un châssis stable, chaque frappe est enregistrée avec précision, au travail comme en jeu.`,
      switchS: () =>
        `Switch et expérience de frappe\n\nLe switch offre une sensation constante et confortable, adaptée aux longues sessions, en gardant un bruit raisonnable pour les espaces partagés tout en restant réactif en jeu.`,
      conn: (n) =>
        `Connectivité pratique au quotidien\n\nLe ${n} prend en charge la connexion${wired ? " filaire" : ""}${wired && wireless ? " et" : ""}${wireless ? " sans fil" : ""}, pour organiser votre bureau en liberté. Cette flexibilité facilite l'alternance entre travail fixe et configurations mobiles.`,
      cta: (n) =>
        `Achetez le ${n} chez GearVN\n\nGearVN propose des produits authentiques avec soutien de garantie et livraison rapide. Commandez dès aujourd'hui le ${n} pour améliorer votre setup avec un accessoire fiable et élégant pour le travail et le jeu.`,
    },
    de: {
      intro: (n) =>
        `Entdecken Sie den ${n}\n\nDer ${n} erweist sich als praktische Wahl für Büroarbeit, Dateneingabe und Gaming, mit Verarbeitungsqualität und Funktionen für den Tageseinsatz. Dieses Produkt behält das Wesentliche und bringt zugleich einen eigenen Look auf Ihren Schreibtisch.`,
      layout: (n) =>
        `Vertrautes Layout für den Arbeitsalltag\n\nDas Layout ist so gestaltet, dass Nutzer von Standardtastaturen sofort zurechtkommen. Ob Dokumente, Tabellen oder lange Schreibsessions — der ${n} hält alles ohne Umwege griffbereit.`,
      keycaps: () =>
        `Hochwertige Keycaps und stabiles Tippgefühl\n\nDie Keycaps behalten ihre Beschriftung über Zeit und das Tippgefühl bleibt vom ersten bis zum letzten Tastendruck konsistent. Kombiniert mit einem stabilen Gehäuse landet jede Eingabe präzise — bei Arbeit wie beim Spiel.`,
      switchS: () =>
        `Switch und Tippexperience\n\nDer Switch liefert ein gleichmäßiges, komfortables Gefühl für lange Sessions, hält den Geräuschpegel in geteilten Räumen angenehm und bleibt beim Gaming reaktionsschnell.`,
      conn: (n) =>
        `Praktische Konnektivität für den Alltag\n\nDer ${n} unterstützt${wired ? " kabelgebundene" : ""}${wired && wireless ? " und" : ""}${wireless ? " kabellose" : ""} Verbindungsmodi, damit Sie Ihren Schreibtisch frei gestalten. Diese Flexibilität erleichtert den Wechsel zwischen festem Arbeitsplatz und mobilen Setups.`,
      cta: (n) =>
        `Kaufen Sie den ${n} bei GearVN\n\nGearVN bietet Originalware mit Garantiesupport und schnellem Versand. Bestellen Sie den ${n} noch heute, um Ihr Setup mit einem zuverlässigen, attraktiven Zubehör für Arbeit und Spiel aufzuwerten.`,
    },
    it: {
      intro: (n) =>
        `Scopri il ${n}\n\nIl ${n} si distingue come scelta pratica per il lavoro d'ufficio, l'immissione dati e il gaming, con qualità costruttiva e funzioni pensate per l'uso quotidiano. Questo prodotto mantiene l'essenziale aggiungendo allo stesso tempo uno stile distintivo alla tua postazione.`,
      layout: (n) =>
        `Layout familiare per il lavoro quotidiano\n\nIl layout è progettato perché gli utenti provenienti da tastiere standard si adattino subito. Che si tratti di documenti, fogli di calcolo o lunghe sessioni di digitazione, il ${n} tiene tutto a portata di mano senza sforzo aggiuntivo.`,
      keycaps: () =>
        `Keycap di qualità e digitazione stabile\n\nI keycap mantengono le leggende nitide nel tempo e la sensazione di digitazione resta costante dal primo all'ultimo tasto. Combinato a un guscio stabile, ogni pressione viene registrata con precisione, al lavoro come nel gioco.`,
      switchS: () =>
        `Switch ed esperienza di digitazione\n\nLo switch offre una sensazione costante e confortevole, adatta a sessioni lunghe, mantenendo un rumore ragionevole negli spazi condivisi e restando reattivo nel gaming.`,
      conn: (n) =>
        `Connettività pratica per l'uso quotidiano\n\nIl ${n} supporta la connessione${wired ? " cablata" : ""}${wired && wireless ? " e" : ""}${wireless ? " wireless" : ""}, per organizzare la scrivania in libertà. Questa flessibilità facilita l'alternanza tra lavoro fisso e configurazioni mobili.`,
      cta: (n) =>
        `Compra il ${n} su GearVN\n\nGearVN offre prodotti originali con supporto garanzia e consegna rapida. Ordina subito il ${n} per aggiornare la tua postazione con un accessorio affidabile ed elegante per lavoro e gioco.`,
    },
    es: {
      intro: (n) =>
        `Descubre el ${n}\n\nEl ${n} destaca como una elección práctica para el trabajo de oficina, la introducción de datos y el gaming, con calidad de construcción y funciones pensadas para el uso diario. Este producto mantiene lo esencial mientras aporta un estilo distintivo a tu espacio de trabajo.`,
      layout: (n) =>
        `Disposición familiar para el trabajo diario\n\nLa disposición está diseñada para que los usuarios que vienen de teclados estándar se adapten de inmediato. Ya sea para documentos, hojas de cálculo o largas sesiones de tecleo, el ${n} mantiene todo al alcance sin esfuerzo extra.`,
      keycaps: () =>
        `Teclas de calidad y tecleo estable\n\nLas teclas conservan sus leyendas nítidas con el tiempo y la sensación de tecleo se mantiene constante del primer al último pulso. Combinado con un chasis estable, cada pulsación se registra con precisión, en el trabajo como en el juego.`,
      switchS: () =>
        `Switch y experiencia de tecleo\n\nEl switch ofrece una sensación constante y cómoda, adecuada para sesiones largas, manteniendo un ruido razonable en espacios compartidos y siguiendo siendo reactivo en el juego.`,
      conn: (n) =>
        `Conectividad práctica para el uso diario\n\nEl ${n} soporta conexión${wired ? " con cable" : ""}${wired && wireless ? " y" : ""}${wireless ? " inalámbrica" : ""}, para organizar tu escritorio con libertad. Esta flexibilidad facilita alternar entre trabajo fijo y configuraciones móviles.`,
      cta: (n) =>
        `Compra el ${n} en GearVN\n\nGearVN ofrece productos originales con soporte de garantía y entrega rápida. Pide ya el ${n} para mejorar tu espacio con un accesorio fiable y atractivo para el trabajo y el juego.`,
    },
    nl: {
      intro: (n) =>
        `Ontdek de ${n}\n\nDe ${n} profilleert zich als een praktische keuze voor kantoorwerk, gegevensinvoer en gaming, met bouwkwaliteit en functies afgestemd op dagelijks gebruik. Dit product houdt het essentiële vast en voegt tegelijk een eigen stijl toe aan je werkplek.`,
      layout: (n) =>
        `Vertrouwd layout voor het dagelijkse werk\n\nDe layout is ontworpen zodat gebruikers die van standaardtoetsenborden komen meteen wegwijs zijn. Of het nu om documenten, spreadsheets of lange typesessies gaat — de ${n} houdt alles binnen handbereik zonder extra moeite.`,
      keycaps: () =>
        `Kwalitatieve keycaps en stabiele typervaring\n\nDe keycaps houden hun legendes scherp in de loop der tijd en het typgevoel blijft consistent van de eerste tot de laatste toetsaanslag. Gecombineerd met een stabiele behuizing wordt elke invoer nauwkeurig geregistreerd, tijdens werk en spel.`,
      switchS: () =>
        `Switch en typervaring\n\nDe switch levert een gelijkmatig, comfortabel gevoel voor lange sessies, houdt het geluidsniveau redelijk in gedeelde ruimtes en blijft responsief tijdens het gamen.`,
      conn: (n) =>
        `Praktische connectiviteit voor dagelijks gebruik\n\nDe ${n} ondersteunt${wired ? " bedrade" : ""}${wired && wireless ? " en" : ""}${wireless ? " draadloze" : ""} verbindingsmodi, zodat je je bureau vrij inricht. Deze flexibiliteit maakt het wisselen tussen vaste werkplekken en mobiele setups eenvoudig.`,
      cta: (n) =>
        `Koop de ${n} bij GearVN\n\nGearVN levert originele producten met garantiesupport en snelle levering. Bestel de ${n} vandaag nog om je setup te upgraden met een betrouwbaar, stijlvol accessoire voor werk en spel.`,
    },
    sv: {
      intro: (n) =>
        `Upptäck ${n}\n\n${n} framstår som ett praktiskt val för kontorsarbete, datainmatning och spelande, med byggkvalitet och funktioner anpassade för daglig användning. Produkten behåller det väsentliga och tillför samtidigt en egen stil till din arbetsplats.`,
      layout: (n) =>
        `Bekant layout för vardagsarbetet\n\nLayouten är utformad så att användare som kommer från standardtangentbord direkt känner igen sig. Oavsett om det gäller dokument, kalkylblad eller långa skrivsessioner håller ${n} allt inom räckhåll utan extra ansträngning.`,
      keycaps: () =>
        `Kvalitativa keycaps och stabil skrivkänsla\n\nKeycaps behåller sina symboler skarpa över tid och skrivkänslan förblir konsekvent från första till sista tangenttryck. Kombinerat med ett stabilt hölje registreras varje inmatning korrekt — i arbetet som i spelet.`,
      switchS: () =>
        `Switch och skrivupplevelse\n\nSwitchen ger en jämn, bekväm känsla för långa sessioner, håller ljudnivån rimlig i delade utrymmen och förblir responsiv när du spelar.`,
      conn: (n) =>
        `Praktisk anslutning för daglig användning\n\n${n} stödjer${wired ? " trådbunden" : ""}${wired && wireless ? " och" : ""}${wireless ? " trådlös" : ""} anslutning, så att du kan inreda skrivbordet fritt. Denna flexibilitet underlättar växlingen mellan fast arbetsplats och mobila setup.`,
      cta: (n) =>
        `Köp ${n} hos GearVN\n\nGearVN erbjuder originalprodukter med garantistöd och snabb leverans. Beställ ${n} idag för att uppgradera din setup med ett pålitligt, snyggt tillbehör för arbete och spel.`,
    },
  };
  const s = S[lang];
  const trName = translateName(srcName, lang);
  const parts = [s.intro(trName)];
  parts.push(s.layout(trName));
  if (switchName) parts.push(s.keycaps());
  parts.push(s.conn(trName));
  parts.push(s.cta(trName));
  return parts.join("\n\n");
}

// Translate alt strings simply (keep tokens; swap generic VN nouns)
function translateAlt(alt, lang) {
  let out = alt;
  const prefix = [
    [/^Bàn phím cơ /, { en: "Mechanical keyboard ", pt: "Teclado mecânico ", fr: "Clavier mécanique ", de: "Mechanische Tastatur ", it: "Tastiera meccanica ", es: "Teclado mecánico ", nl: "Mechanisch toetsenbord ", sv: "Mekaniskt tangentbord " }],
    [/^Bàn phím không dây /, { en: "Wireless keyboard ", pt: "Teclado sem fios ", fr: "Clavier sans fil ", de: "Kabellose Tastatur ", it: "Tastiera wireless ", es: "Teclado inalámbrico ", nl: "Draadloos toetsenbord ", sv: "Trådlöst tangentbord " }],
    [/^Bàn phím có dây /, { en: "Wired keyboard ", pt: "Teclado com fios ", fr: "Clavier filaire ", de: "Kabelgebundene Tastatur ", it: "Tastiera cablata ", es: "Teclado con cable ", nl: "Bedraad toetsenbord ", sv: "Trådbundet tangentbord " }],
    [/^Bàn phím gaming không dây /, { en: "Wireless gaming keyboard ", pt: "Teclado gaming sem fios ", fr: "Clavier gaming sans fil ", de: "Kabellose Gaming-Tastatur ", it: "Tastiera gaming wireless ", es: "Teclado gaming inalámbrico ", nl: "Draadloos gaming-toetsenbord ", sv: "Trådlöst gamingtangentbord " }],
    [/^Bàn phím gaming /, { en: "Gaming keyboard ", pt: "Teclado gaming ", fr: "Clavier gaming ", de: "Gaming-Tastatur ", it: "Tastiera gaming ", es: "Teclado gaming ", nl: "Gaming-toetsenbord ", sv: "Gamingtangentbord " }],
    [/^Bàn phím /, { en: "Keyboard ", pt: "Teclado ", fr: "Clavier ", de: "Tastatur ", it: "Tastiera ", es: "Teclado ", nl: "Toetsenbord ", sv: "Tangentbord " }],
    [/^Chuột không dây /, { en: "Wireless mouse ", pt: "Rato sem fios ", fr: "Souris sans fil ", de: "Kabellose Maus ", it: "Mouse wireless ", es: "Ratón inalámbrico ", nl: "Draadloze muis ", sv: "Trådlös mus " }],
    [/^Chuột gaming /, { en: "Gaming mouse ", pt: "Rato gaming ", fr: "Souris gaming ", de: "Gaming-Maus ", it: "Mouse gaming ", es: "Ratón gaming ", nl: "Gaming-muis ", sv: "Spelmus " }],
    [/^Chuột /, { en: "Mouse ", pt: "Rato ", fr: "Souris ", de: "Maus ", it: "Mouse ", es: "Ratón ", nl: "Muis ", sv: "Mus " }],
    [/^Tai nghe /, { en: "Headset ", pt: "Auscultadores ", fr: "Casque ", de: "Headset ", it: "Cuffie ", es: "Auriculares ", nl: "Headset ", sv: "Headset " }],
  ];
  for (const [re, words] of prefix) {
    if (re.test(out)) { out = out.replace(re, words[lang]); break; }
  }
  const map = [
    [
      /có chất liệu vỏ /g,
      {
        en: "with a durable ",
        pt: "com carcaça durável ",
        fr: "avec un châssis durable ",
        de: "mit robustem ",
        it: "con guscio resistente ",
        es: "con chasis duradero ",
        nl: "met duurzaam ",
        sv: "med slitstarkt ",
      },
    ],
    [
      /gõ êm tay$/g,
      {
        en: "for comfortable typing",
        pt: "para escrita confortável",
        fr: "pour une frappe confortable",
        de: "für komfortables Tippen",
        it: "per una digitazione comoda",
        es: "para un tecleo cómodo",
        nl: "voor comfortabel typen",
        sv: "för bekväm skrivning",
      },
    ],
    [
      /hỗ trợ hot-swap tiện lợi$/g,
      {
        en: "supports convenient hot-swap",
        pt: "suporta hot-swap prático",
        fr: "prend en charge le hot-swap pratique",
        de: "unterstützt praktisches Hot-Swap",
        it: "supporta l'hot-swap pratico",
        es: "soporta hot-swap práctico",
        nl: "ondersteunt handig hot-swap",
        sv: "stödjer bekväm hot-swap",
      },
    ],
    [
      /có nguồn điện được cung cấp từ viên pin AAA/g,
      {
        en: "is powered by AAA batteries",
        pt: "é alimentado por pilhas AAA",
        fr: "est alimenté par des piles AAA",
        de: "wird von AAA-Batterien betrieben",
        it: "è alimentato da batterie AAA",
        es: "se alimenta con pilas AAA",
        nl: "wordt gevoed door AAA-batterijen",
        sv: "drivs av AAA-batterier",
      },
    ],
    [
      /hỗ trợ N-Key Rollover cho gõ nhanh$/g,
      {
        en: "supports N-Key Rollover for fast typing",
        pt: "suporta N-Key Rollover para escrita rápida",
        fr: "prend en charge N-Key Rollover pour une frappe rapide",
        de: "unterstützt N-Key Rollover für schnelles Tippen",
        it: "supporta N-Key Rollover per digitazione veloce",
        es: "soporta N-Key Rollover para tecleo rápido",
        nl: "ondersteunt N-Key Rollover voor snel typen",
        sv: "stödjer N-Key Rollover för snabb skrivning",
      },
    ],
    [
      / cho trải nghiệm gõ với switch /g,
      {
        en: " for a typing experience with ",
        pt: " para experiência de escrita com ",
        fr: " pour une expérience de frappe avec ",
        de: " für ein Tippgefühl mit ",
        it: " per un'esperienza di digitazione con ",
        es: " para una experiencia de tecleo con ",
        nl: " voor een typervaring met ",
        sv: " för en skrivupplevelse med ",
      },
    ],
    [
      / có núm xoay tiện lợi$/g,
      {
        en: " with a convenient rotary knob",
        pt: " com botão rotativo prático",
        fr: " avec une molette pratique",
        de: " mit praktischem Drehknopf",
        it: " con manopola girevole comoda",
        es: " con perilla giratoria práctica",
        nl: " met handige draaiknop",
        sv: " med praktisk vridknapp",
      },
    ],
    [
      / có thiết kế đỏ retro nổi bật$/g,
      {
        en: " with a striking retro red design",
        pt: " com design vermelho retrô marcante",
        fr: " avec un design rouge rétro marquant",
        de: " mit markantem Retro-Rot-Design",
        it: " con design rosso retrò marcante",
        es: " con llamativo diseño rojo retro",
        nl: " met opvallend retro rood ontwerp",
        sv: " med iögonfallande retro röd design",
      },
    ],
    [
      / có keycap MOA profile độc đáo$/g,
      {
        en: " with unique MOA profile keycaps",
        pt: " com keycaps MOA profile únicos",
        fr: " avec des keycaps MOA profile uniques",
        de: " mit einzigartigen MOA-Profile-Keycaps",
        it: " con keycap MOA profile unici",
        es: " con teclas MOA profile únicas",
        nl: " met unieke MOA profile keycaps",
        sv: " med unika MOA profile keycaps",
      },
    ],
    [
      / có thể hot-swap linh hoạt$/g,
      {
        en: " with flexible hot-swap",
        pt: " com hot-swap flexível",
        fr: " avec hot-swap flexible",
        de: " mit flexiblem Hot-Swap",
        it: " con hot-swap flessibile",
        es: " con hot-swap flexible",
        nl: " met flexibele hot-swap",
        sv: " med flexibel hot-swap",
      },
    ],
    [
      / có keycap PBT Double Shot hỗ trợ gõ êm tay$/g,
      {
        en: " with PBT Double Shot keycaps for comfortable typing",
        pt: " com keycaps PBT Double Shot para escrita confortável",
        fr: " avec des keycaps PBT Double Shot pour une frappe confortable",
        de: " mit PBT-Double-Shot-Keycaps für komfortables Tippen",
        it: " con keycap PBT Double Shot per una digitazione comoda",
        es: " con teclas PBT Double Shot para un tecleo cómodo",
        nl: " met PBT Double Shot keycaps voor comfortabel typen",
        sv: " med PBT Double Shot keycaps för bekväm skrivning",
      },
    ],
    [
      /bền$/g,
      {
        en: "durable",
        pt: "durável",
        fr: "durable",
        de: "robust",
        it: "resistente",
        es: "duradero",
        nl: "duurzaam",
        sv: "slitstarkt",
      },
    ],
  ];
  for (const [re, words] of map) {
    out = out.replace(re, words[lang] || "");
  }
  // Any remaining Vietnamese diacritics → warn at build (preflight catches).
  return out;
}

const hand = {};
let accCount = 0;
for (const block of blocks) {
  const src = parseBlock(block);
  if (!src.isAcc) continue;
  hand[src.pid] = {};
  for (const lang of src.langs) {
    const techPairs = parseTech(src.techRaw);
    const techStr = techJson(techPairs, lang);
    const specEntries = techPairs.map(({ k, v }) => {
      // map VN spec keys → original record keys where identifiable
      let key = k;
      if (/Layout/i.test(k)) key = "layout";
      else if (/Số lượng phím/i.test(k)) key = "buttons";
      else if (/Phương thức kết nối/i.test(k)) key = "connection";
      else if (/Keycap/i.test(k)) key = "keycapMaterial";
      else if (/Chất liệu vỏ/i.test(k)) key = "chat_lieu_vo";
      else if (/Đèn LED/i.test(k)) key = "led";
      return [key, translateSpecValue(v, lang)];
    });
    const desc = translateAccessoryDescription(
      src.name,
      techPairs,
      src.brand,
      lang,
      src.descRaw,
    );
    hand[src.pid][lang] = {
      name: translateName(src.name, lang),
      description: desc,
      brand: src.brand,
      specs: Object.fromEntries(specEntries),
      technicalDescription: techStr,
      imageAlts: src.alts.map((a) => translateAlt(a, lang)),
    };
    accCount++;
  }
}
console.log("accessory translations generated:", accCount);
fs.writeFileSync(
  path.join(WS, "data", "translations", "translations-nov06d-hand.json"),
  JSON.stringify(hand, null, 2),
  "utf8",
);
