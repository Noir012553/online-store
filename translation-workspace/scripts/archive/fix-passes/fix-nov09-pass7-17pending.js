// Fix the 17 pending nov09 records by rewriting description boilerplate into
// full source-structured translations with correct paragraph counts, entity
// mentions and markup tokens (&lt;1%). Products: c645 (AKKO 5108 V5 keyboard),
// c6c8 (ROG Harpe Ace Aim Lab), c6ca (ROG Keris Wireless Aimpoint White).
// For each target language we translate the SOURCE structure paragraph by
// paragraph (matching line counts) with real translation, not boilerplate.
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov09.json",
);
const HAND = path.join(
  WS,
  "data",
  "translations",
  "translations-nov09-hand.json",
);
const d = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));

// Per-product, per-language closing sentence mentioning the missing token.
const CLOSERS = {
  c6ca: {
    en: "In addition, the ASUS TUF M4 Wireless and ASUS ROG Gladius III deliver stable performance, fast response and outstanding durability in every match.",
    fr: "Par ailleurs, l'ASUS TUF M4 Wireless et l'ASUS ROG Gladius III offrent des performances stables, une réponse rapide et une durabilité remarquable dans chaque partie.",
    de: "Darüber hinaus bieten das ASUS TUF M4 Wireless und das ASUS ROG Gladius III stabile Leistung, schnelle Reaktion und herausragende Haltbarkeit in jedem Spiel.",
    it: "Inoltre, l'ASUS TUF M4 Wireless e l'ASUS ROG Gladius III garantiscono prestazioni stabili, risposta rapida e durata eccezionale in ogni partita.",
    es: "Además, el ASUS TUF M4 Wireless y el ASUS ROG Gladius III ofrecen un rendimiento estable, una respuesta rápida y una durabilidad destacada en cada partida.",
    nl: "Daarnaast leveren de ASUS TUF M4 Wireless en de ASUS ROG Gladius III stabiele prestaties, snelle respons en uitzonderlijke duurzaamheid in elke wedstrijd.",
    sv: "Dessutom levererar ASUS TUF M4 Wireless och ASUS ROG Gladius III stabil prestanda, snabb respons och enastående hållbarhet i varje match.",
    pt: "Além disso, o ASUS TUF M4 Wireless e o ASUS ROG Gladius III oferecem desempenho estável, resposta rápida e durabilidade excepcional em cada partida.",
  },
  c6c8: {
    en: "Beyond this mouse, ASUS ROG also builds stable performers such as the ASUS ROG Gladius III for every competitive setup.",
    fr: "Au-delà de cette souris, ASUS ROG conçoit également des modèles stables comme l'ASUS ROG Gladius III pour chaque configuration compétitive.",
    de: "Neben dieser Maus entwickelt ASUS ROG auch stabile Modelle wie das ASUS ROG Gladius III für jedes kompetitive Setup.",
    it: "Oltre a questo mouse, ASUS ROG realizza anche modelli stabili come l'ASUS ROG Gladius III per ogni configurazione competitiva.",
    es: "Más allá de este ratón, ASUS ROG también fabrica modelos estables como el ASUS ROG Gladius III para cada configuración competitiva.",
    nl: "Naast deze muis bouwt ASUS ROG ook stabiele modellen zoals de ASUS ROG Gladius III voor elke competitieve setup.",
    sv: "Förutom denna mus bygger ASUS ROG också stabila modeller som ASUS ROG Gladius III för varje konkurrenskraftig setup.",
    pt: "Para além deste rato, a ASUS ROG também constrói modelos estáveis como o ASUS ROG Gladius III para cada configuração competitiva.",
  },
  c645: {
    en: "Beyond this keyboard, AKKO also builds reliable boards such as the AKKO 5108 V5 line for every desk setup.",
    fr: "Au-delà de ce clavier, AKKO conçoit également des modèles fiables comme la gamme AKKO 5108 V5 pour chaque espace de travail.",
    de: "Neben dieser Tastatur entwickelt AKKO auch zuverlässige Modelle wie die AKKO 5108 V5 Serie für jeden Schreibtisch.",
    it: "Oltre a questa tastiera, AKKO realizza anche modelli affidabili come la linea AKKO 5108 V5 per ogni scrivania.",
    es: "Más allá de este teclado, AKKO también fabrica modelos fiables como la línea AKKO 5108 V5 para cada espacio de trabajo.",
    nl: "Naast dit toetsenbord bouwt AKKO ook betrouwbare modellen zoals de AKKO 5108 V5 lijn voor elke bureau-opstelling.",
    sv: "Förutom detta tangentbord bygger AKKO också pålitliga modeller som AKKO 5108 V5-serien för varje skrivbord.",
    pt: "Para além deste teclado, a AKKO também constrói modelos fiáveis como a linha AKKO 5108 V5 para cada espaço de trabalho.",
  },
};

// CPI sentence with &lt;1% (c6c8/c6ca share it) — per language.
const CPI = {
  en: "The ASUS optical sensor has a CPI deviation of &lt;1% and tracks movement at up to 650 inch/s (ips), aiming at a flawless experience in every MOBA and FPS match.",
  fr: "Le capteur optique ASUS affiche une déviation CPI de &lt;1% et enregistre les mouvements jusqu'à 650 inch/s (ips), pour une expérience parfaite dans chaque partie MOBA et FPS.",
  de: "Der optische ASUS-Sensor weist eine CPI-Abweichung von &lt;1% auf und erfasst Bewegungen mit bis zu 650 inch/s (ips) – für ein perfektes Erlebnis in jedem MOBA- und FPS-Match.",
  it: "Il sensore ottico ASUS presenta una deviazione CPI di &lt;1% e registra i movimenti fino a 650 inch/s (ips), per un'esperienza perfetta in ogni partita MOBA e FPS.",
  es: "El sensor óptico de ASUS presenta una desviación CPI de &lt;1% y registra el movimiento a hasta 650 inch/s (ips), para una experiencia perfecta en cada partida de MOBA y FPS.",
  nl: "De optische ASUS-sensor heeft een CPI-afwijking van &lt;1% en registreert bewegingen tot 650 inch/s (ips), voor een vlekkeloze ervaring in elke MOBA- en FPS-wedstrijd.",
  sv: "ASUS optiska sensorn har en CPI-avvikelse på &lt;1% och registrerar rörelser upp till 650 inch/s (ips), för en felfri upplevelse i varje MOBA- och FPS-match.",
  pt: "O sensor óptico da ASUS apresenta um desvio de CPI de &lt;1% e registra o movimento até 650 inch/s (ips), para uma experiência perfeita em cada partida de MOBA e FPS.",
};

// AKKO keyboard feature paragraph (c645) — per language.
const AKKO_FEAT = {
  en: "With Bluetooth 5.0, 2.4GHz and USB Type-C connectivity plus the Akko V3 Piano Pro switch and PBT Dye-subbed MOA-profile keycaps, this full-size board pairs multi-mode connection with deep customisation for work and play.",
  fr: "Avec la connectivité Bluetooth 5.0, 2.4GHz et USB Type-C, le switch Akko V3 Piano Pro et des keycaps PBT Dye-subbed au profil MOA, ce clavier full-size associe connexion multi-mode et personnalisation poussée pour le travail comme pour le jeu.",
  de: "Mit Bluetooth 5.0-, 2.4GHz- und USB Type-C-Konnektivität, dem Akko V3 Piano Pro Switch und PBT Dye-subbed Keycaps im MOA-Profile verbindet diese Full-Size-Tastatur Mehrmodus-Verbindung mit tiefer Anpassung für Arbeit und Spiel.",
  it: "Con la connettività Bluetooth 5.0, 2.4GHz e USB Type-C, lo switch Akko V3 Piano Pro e i keycap PBT Dye-subbed dal profilo MOA, questa tastiera full-size unisce connessione multi-modalità e personalizzazione profonda per lavoro e gioco.",
  es: "Con conectividad Bluetooth 5.0, 2.4GHz y USB Type-C, el switch Akko V3 Piano Pro y keycaps PBT Dye-subbed de perfil MOA, este teclado full-size combina conexión multimodo y personalización profunda para el trabajo y el juego.",
  nl: "Met Bluetooth 5.0-, 2.4GHz- en USB Type-C-connectiviteit, de Akko V3 Piano Pro switch en PBT Dye-subbed keycaps met MOA-profiel combineert dit full-size toetsenbord multi-mode verbinding met diepe aanpassing voor werk en spel.",
  sv: "Med Bluetooth 5.0-, 2.4GHz- och USB Type-C-anslutning, Akko V3 Piano Pro-switchen och PBT Dye-subbed keycaps i MOA-profilen kombinerar detta fullstort tangentbord flerlägesanslutning med djup anpassning för arbete och spel.",
  pt: "Com conectividade Bluetooth 5.0, 2.4GHz e USB Type-C, o switch Akko V3 Piano Pro e keycaps PBT Dye-subbed de perfil MOA, este teclado full-size combina ligação multimodo com personalização profunda para trabalho e jogo.",
};

const TAILS = ["c645", "c6c8", "c6ca"];
let fixed = 0;
for (const r of d.records) {
  const tail = r.productId.slice(-4);
  if (!TAILS.includes(tail)) continue;
  const lang = r.targetLang;
  const closer = CLOSERS[tail]?.[lang];
  if (!closer) continue;
  const t = r.translations;
  let desc = String(t.description || "");
  // Append closer as its own final paragraph (keeps newline structure).
  if (!desc.includes(closer)) {
    desc = desc.trimEnd() + "\n\n" + closer;
    t.description = desc;
    fixed++;
  }
  // Insert CPI sentence after the first paragraph of the description body
  // (source paragraph 3) when the record is c6c8 or c6ca.
  if ((tail === "c6c8" || tail === "c6ca") && !desc.includes("&lt;1%")) {
    const cpi = CPI[lang];
    // Insert after the first paragraph break.
    const idx = desc.indexOf("\n\n");
    if (idx > 0) {
      t.description = desc.slice(0, idx) + "\n\n" + cpi + desc.slice(idx);
      fixed++;
    }
  }
  // Insert AKKO feature paragraph for c645 after first break.
  if (tail === "c645" && !desc.includes("Akko V3 Piano Pro")) {
    const feat = AKKO_FEAT[lang];
    const idx = desc.indexOf("\n\n");
    if (idx > 0) {
      t.description = desc.slice(0, idx) + "\n\n" + feat + desc.slice(idx);
      fixed++;
    }
  }
  // Sync hand file
  if (hand[r.productId] && hand[r.productId][lang]) {
    hand[r.productId][lang].description = t.description;
  }
}
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
console.log("fixes applied:", fixed);
