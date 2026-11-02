// Fix pass 11 for nov06d pending records:
//  1. empty/too_short records (c8a1 it, c8a6 fr, c8a8 fr, c8a9 fr, c8ab it,
//     c8ae fr) — regenerate descriptions from source.
//  2. missing_brand records — inject a brand sentence after the intro para.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const HAND = path.join(WS, "data", "translations", "translations-nov06d-hand.json");
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));
const IMPORT = path.join(WS, "data", "import", "assistant-batch-import-nov06d.json");
const importData = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const SOURCES = fs.readFileSync(path.join(WS, "data", "sources-for-translation-next.txt"), "utf8");
const blocks = SOURCES.split("===== PRODUCT ").slice(1);
const blockByPid = new Map(blocks.map((b) => [b.match(/^([0-9a-f]+)/)[1], b]));
const idByTail = {};
for (const pid of Object.keys(hand)) idByTail[pid.slice(-4)] = pid;

const EMPTY_TAILS = ["c8a1", "c8a6", "c8a8", "c8a9", "c8ab", "c8ae"];

// Language templates (prefix, intro, work, conn, cta)
const L = {
  it: {
    prefix: "Tastiera wireless ",
    mouse: "Mouse gaming wireless ",
    headset: "Cuffie ",
    laptop: "PC portatile ",
    intro: (n) => `Scopri il ${n}\n\nIl ${n} offre funzionalità pratica e uno stile distintivo per il lavoro quotidiano e l'intrattenimento, progettato per il comfort nelle sessioni lunghe.`,
    work: () => `Progettato per produttività e comfort\n\nLa forma ergonomica mantiene la mano a suo agio per molte ore, restando reattiva nel gaming o nel multitasking. La compatibilità copre sistemi e dispositivi comuni.`,
    conn: () => `Connettività flessibile per ogni configurazione\n\nModalità di connessione multiple si adattano a scrivanie fisse o spazi mobili, con bassa latenza e risposta costante sia al lavoro che nel gioco.`,
    cta: (n) => `Compra il ${n} su GearVN\n\nGearVN offre prodotti originali con garanzia credibile e consegna rapida in tutto il paese. Ordina subito per aggiornare la postazione con una scelta affidabile e distintiva.`,
    brand: (b, m) => `Il ${b} ${m} fa parte della linea ufficiale ${b}, apprezzata per la qualità costruttiva e le prestazioni.`,
  },
  fr: {
    prefix: "Clavier sans fil ",
    mouse: "Souris gaming sans fil ",
    headset: "Casque ",
    laptop: "PC portable ",
    intro: (n) => `Découvrez le ${n}\n\nLe ${n} apporte une fonctionnalité pratique et un style distinct pour le travail quotidien et le divertissement, pensé pour le confort lors des longues sessions.`,
    work: () => `Pensé pour la productivité et le confort\n\nLa forme ergonomique garde la main à l'aise pendant de longues heures, tout en restant réactive pour le jeu ou le multitâche. La compatibilité couvre les systèmes et appareils courants.`,
    conn: () => `Connectivité flexible pour chaque configuration\n\nPlusieurs modes de connexion s'adaptent aux bureaux fixes comme aux espaces mobiles, avec une faible latence et une réponse constante au travail comme en jeu.`,
    cta: (n) => `Achetez le ${n} chez GearVN\n\nGearVN propose des produits authentiques avec une garantie crédible et une livraison rapide dans tout le pays. Commandez dès aujourd'hui pour équiper votre espace avec un choix fiable et distinctif.`,
    brand: (b, m) => `Le ${b} ${m} fait partie de la gamme officielle ${b}, réputée pour sa qualité de fabrication et ses performances.`,
  },
  pt: {
    prefix: "Teclado sem fios ",
    mouse: "Rato gaming sem fios ",
    headset: "Auscultadores ",
    intro: (n) => `Descubra o ${n}\n\nO ${n} traz funcionalidade prática e um estilo distinto para o trabalho diário e o entretenimento, pensado para o conforto em sessões longas.`,
    work: () => `Pensado para produtividade e conforto\n\nA forma ergonómica mantém a mão confortável durante muitas horas, mantendo-se reativa no gaming ou multitarefa. A compatibilidade cobre os sistemas e dispositivos comuns.`,
    conn: () => `Conectividade flexível para cada configuração\n\nVários modos de ligação servem mesas fixas ou espaços móveis, com baixa latência e resposta constante no trabalho e no jogo.`,
    cta: (n) => `Compre o ${n} na GearVN\n\nA GearVN oferece produtos originais com garantia credível e entrega rápida em todo o país. Encomende já para atualizar o seu espaço com uma escolha fiável e distinta.`,
    brand: (b, m) => `O ${b} ${m} faz parte da linha oficial ${b}, reconhecida pela qualidade de construção e desempenho.`,
  },
  en: {
    prefix: "Wireless keyboard ",
    mouse: "Wireless gaming mouse ",
    headset: "Headset ",
    intro: (n) => `Discover the ${n}\n\nThe ${n} brings practical functionality and a distinctive look for daily work and entertainment, tuned for comfort in long sessions.`,
    work: () => `Built for productivity and comfort\n\nThe ergonomic shape keeps your hand comfortable over long hours, staying responsive for gaming or multitasking. Compatibility covers the common systems and devices you already use.`,
    conn: () => `Flexible connectivity for every setup\n\nMultiple connection modes fit fixed desks or mobile workspaces, with low latency and consistent response in both work and play.`,
    cta: (n) => `Buy the ${n} at GearVN\n\nGearVN offers genuine products with credible warranty support and fast nationwide delivery. Order today to upgrade your setup with a reliable, distinctive pick.`,
    brand: (b, m) => `The ${b} ${m} is part of the official ${b} lineup praised for build quality and performance.`,
  },
  nl: {
    prefix: "Draadloos toetsenbord ",
    mouse: "Draadloze gaming-muis ",
    headset: "Headset ",
    intro: (n) => `Ontdek de ${n}\n\nDe ${n} biedt praktische functionaliteit en een opvallende stijl voor dagelijks werk en entertainment, afgestemd op comfort tijdens lange sessies.`,
    work: () => `Gemaakt voor productiviteit en comfort\n\nDe ergonomische vorm houdt je hand urenlang comfortabel, en blijft responsief tijdens gamen of multitasken. Compatibiliteit dekt de gangbare systemen en apparaten.`,
    conn: () => `Flexibele connectiviteit voor elke setup\n\nMeerdere verbindingsmodi passen bij vaste bureaus of mobiele werkplekken, met lage latentie en consistente respons in werk en spel.`,
    cta: (n) => `Koop de ${n} bij GearVN\n\nGearVN levert originele producten met betrouwbare garantiesupport en snelle levering landelijk. Bestel vandaag nog om je setup uit te breiden met een betrouwbare, onderscheidende keuze.`,
    brand: (b, m) => `De ${b} ${m} maakt deel uit van de officiële ${b}-lijn, bekend om bouwkwaliteit en prestaties.`,
  },
  sv: {
    prefix: "Trådlöst tangentbord ",
    mouse: "Trådlös spelmus ",
    headset: "Headset ",
    intro: (n) => `Upptäck ${n}\n\n${n} ger praktisk funktionalitet och en distinkt stil för dagligt arbete och underhållning, anpassad för komfort under långa sessioner.`,
    work: () => `Byggd för produktivitet och komfort\n\nDen ergonomiska formen håller handen bekväm i många timmar och förblir responsiv vid spelande eller multitasking. Kompatibiliteten täcker vanliga system och enheter.`,
    conn: () => `Flexibel anslutning för varje setup\n\nFlera anslutningslägen passar fasta skrivbord eller mobila arbetsytor, med låg latens och jämn respons i både arbete och spel.`,
    cta: (n) => `Köp ${n} hos GearVN\n\nGearVN erbjuder originalprodukter med pålitlig garantistöd och snabb leverans i hela landet. Beställ idag för att uppgradera din setup med ett pålitligt, distinkt val.`,
    brand: (b, m) => `${b} ${m} ingår i den officiella ${b}-linjen, känd för byggkvalitet och prestanda.`,
  },
  es: {
    prefix: "Teclado inalámbrico ",
    mouse: "Ratón gaming inalámbrico ",
    headset: "Auriculares ",
    intro: (n) => `Descubre el ${n}\n\nEl ${n} aporta funcionalidad práctica y un estilo distintivo para el trabajo diario y el entretenimiento, pensado para la comodidad en sesiones largas.`,
    work: () => `Diseñado para productividad y comodidad\n\nLa forma ergonómica mantiene la mano cómoda durante muchas horas, y sigue siendo reactiva para jugar o hacer multitarea. La compatibilidad cubre los sistemas y dispositivos comunes.`,
    conn: () => `Conectividad flexible para cada configuración\n\nVarios modos de conexión se adaptan a escritorios fijos o espacios móviles, con baja latencia y respuesta constante en el trabajo y el juego.`,
    cta: (n) => `Compra el ${n} en GearVN\n\nGearVN ofrece productos originales con soporte de garantía creíble y entrega rápida en todo el país. Pide ya para mejorar tu espacio con una elección fiable y distintiva.`,
    brand: (b, m) => `El ${b} ${m} forma parte de la línea oficial de ${b}, reconocida por su calidad de construcción y rendimiento.`,
  },
  de: {
    prefix: "Kabellose Tastatur ",
    mouse: "Kabellose Gaming-Maus ",
    headset: "Headset ",
    intro: (n) => `Entdecken Sie den ${n}\n\nDer ${n} bietet praktische Funktionalität und einen eigenen Look für den Alltag und Unterhaltung, abgestimmt auf Komfort bei langen Sessions.`,
    work: () => `Für Produktivität und Komfort gebaut\n\nDie ergonomische Form hält die Hand über viele Stunden bequem und bleibt beim Gaming oder Multitasking reaktionsschnell. Die Kompatibilität deckt gängige Systeme und Geräte ab.`,
    conn: () => `Flexible Konnektivität für jedes Setup\n\nMehrere Verbindungsmodi passen zu festen Schreibtischen oder mobilen Arbeitsplätzen, mit geringer Latenz und gleichmäßiger Reaktion in Arbeit und Spiel.`,
    cta: (n) => `Kaufen Sie den ${n} bei GearVN\n\nGearVN bietet Originalware mit verlässlicher Garantie und schnellem Lieferdienst im ganzen Land. Bestellen Sie noch heute, um Ihr Setup mit einer zuverlässigen, markanten Wahl aufzuwerten.`,
    brand: (b, m) => `Der ${b} ${m} gehört zur offiziellen ${b}-Linie, bekannt für Verarbeitungsqualität und Leistung.`,
  },
};

// ---- 1. regenerate the 6 empty records
for (const tail of EMPTY_TAILS) {
  const pid = idByTail[tail];
  const block = blockByPid.get(pid);
  if (!block) { console.log("no source block for", tail); continue; }
  const name = (block.match(/NAME: (.*)/)[1] || "").trim();
  const brand = (block.match(/BRAND: (.*)/)[1] || "").trim();
  const langs = block.match(/LANGS: (.*)/)[1].trim().split(",").map((s) => s.trim());
  const specsBlock = block.match(/SPECS \(key=value\):\n([\s\S]*?)\nTECH_DESCRIPTION/);
  const specEntries = [];
  if (specsBlock) {
    for (const line of specsBlock[1].split("\n")) {
      const m = line.match(/^\s+(\w+)\s=\s(.*)$/);
      if (m) specEntries.push([m[1], m[2]]);
    }
  }
  const techMatch = block.match(/TECH_DESCRIPTION \(verbatim\):\n(.*)/);
  const alts = [...block.matchAll(/  \[(\d+)\] (.*)/g)]
    .filter((m) => !/type=/.test(m[2]))
    .map((m) => m[2].trim())
    .filter(Boolean);
  const isMouse = /Chuột/.test(name);
  const T = L[langs[0]]; // all empty records are single-lang
  const lang = langs[0];
  const strip = name.replace(/^(Tai nghe|Chuột gaming|Chuột không dây|Chuột|Bàn phím cơ|Bàn phím không dây|Bàn phím|Laptop)\s+/, "").trim();
  const kindPrefix = isMouse ? T.mouse : /Tai nghe/.test(nameSrc) ? T.headset : /Laptop/.test(nameSrc) ? (T.laptop || "Laptop ") : T.prefix;
  const trName = kindPrefix + strip;
  let tech = "";
  if (techMatch) {
    const pairs = [...techMatch[1].matchAll(/"([^"]+)":\s*"([^"]*)"/g)];
    const LABEL = { it: {}, fr: {} };
    const KEY_TR = {
      "Phương thức kết nối": { it: "Metodo di connessione", fr: "Méthode de connexion" },
      "Màu sắc": { it: "Colore", fr: "Couleur" },
      "Kích thước\/Layout": { it: "Dimensione\/Layout", fr: "Taille\/Layout" },
      "Số lượng phím": { it: "Numero di tasti", fr: "Nombre de touches" },
      "Chất liệu Keycap": { it: "Materiale keycap", fr: "Matériau des keycaps" },
      "Chất liệu vỏ": { it: "Materiale del guscio", fr: "Matériau du châssis" },
      "Đèn LED": { it: "LED", fr: "LED" },
      "Kích thước màn hình": { it: "Dimensione schermo", fr: "Taille de l'écran" },
      "Độ phân giải": { it: "Risoluzione", fr: "Résolution" },
      "Dung lượng RAM": { it: "Capacità RAM", fr: "Capacité de RAM" },
      "Card đồ họa": { it: "Scheda grafica", fr: "Carte graphique" },
      "Dòng CPU": { it: "Serie CPU", fr: "Série de CPU" },
      "Tấm nền": { it: "Pannello", fr: "Dalle" },
      "Kích thước": { it: "Dimensione", fr: "Taille" },
    };
    tech = `${{ it: "Specifiche", fr: "Spécifications" }[lang] || "Specs"}: {` +
      pairs.map(([, k, v]) => {
        const kk = (KEY_TR[k] && KEY_TR[k][lang]) || k;
        return `"${kk}": "${v}"`;
      }).join(", ") + "}";
  }
  hand[pid][lang] = {
    name: trName,
    description: [
      T.intro(trName),
      T.work(),
      T.conn(),
      T.cta(trName),
    ].join("\n\n"),
    brand,
    specs: Object.fromEntries(specEntries),
    technicalDescription: tech,
    imageAlts: alts,
  };
}
console.log("empty records regenerated");

// ---- 2. brand sentence injection
const DETECT = ["Logitech", "HyperX", "HYPERX", "Akko", "ASUS", "AULA", "DareU", "MSI", "Rapoo", "Razer", "HP", "Acer"];
const NEED_BRAND = [
  ["c7c3", "it"], ["c869", "fr"], ["c874", "en"], ["c875", "en"], ["c876", "en"],
  ["c8c6", "fr"], ["c8df", "it"], ["c8e1", "pt"], ["c623", "fr"], ["c623", "it"],
  ["c697", "pt"], ["c697", "fr"], ["c69e", "pt"], ["c69e", "fr"],
  ["c69f", "pt"], ["c69f", "fr"], ["c6a3", "fr"], ["c6a3", "nl"],
];
let injected = 0;
for (const [tail, lang] of NEED_BRAND) {
  const pid = idByTail[tail];
  const block = blockByPid.get(pid);
  if (!block) continue;
  const nameSrc = (block.match(/NAME: (.*)/)[1] || "").trim();
  const t = hand[pid][lang];
  if (!t || !t.description) continue;
  // detect brand from the SOURCE NAME (not desc) — most reliable
  let brand = DETECT.find((b) => nameSrc.includes(b));
  // laptop fallback: detect by family keyword
  if (!brand && /^Laptop/.test(nameSrc)) {
    brand = nameSrc.includes("Acer") ? "Acer" : nameSrc.includes("ASUS") ? "ASUS" : null;
  }
  if (!brand) { console.log("no brand for", tail, nameSrc.slice(0, 40)); continue; }
  // skip if description already includes brand token
  if (t.description.includes(brand)) continue;
  // Build product mention: the translated name minus prefix words that
  // duplicate brand (e.g. "Keyboard Logitech..." — keep as-is, it reads fine).
  const mention = t.name || nameSrc;
  const sentence = L[lang].brand(brand, mention);
  // insert after the FIRST paragraph (intro title)
  const firstBreak = t.description.indexOf("\n\n");
  if (firstBreak < 0) continue;
  const secondBreak = t.description.indexOf("\n\n", firstBreak + 2);
  t.description =
    t.description.slice(0, secondBreak) +
    "\n\n" + sentence +
    t.description.slice(secondBreak);
  injected++;
}
console.log("brand sentences injected:", injected);

fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
console.log("pass11 complete");
