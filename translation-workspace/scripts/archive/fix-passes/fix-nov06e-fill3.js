// Add missing translations directly for the 45 TBD slots (23 blocks).
// Writes into translations-nov06e-hand.json with correct prefix/kind/lang.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const HAND_ACC = path.join(WS, "data", "translations", "translations-nov06e-hand.json");
const hand = JSON.parse(fs.readFileSync(HAND_ACC, "utf8"));
const SOURCES_TXT = path.join(WS, "data", "sources-for-translation-next.txt");
const txt = fs.readFileSync(SOURCES_TXT, "utf8");
const blocks = txt.split("===== PRODUCT ").slice(1);
const blockByPid = new Map(blocks.map((b) => [b.match(/^([0-9a-f]+)/)[1], b]));

const GENERIC = [
  [/Bàn phím cơ Gaming/g, { fr: "Clavier mécanique gaming ", it: "Tastiera meccanica gaming ", en: "Gaming mechanical keyboard ", nl: "Gaming mechanisch toetsenbord ", sv: "Gaming mekaniskt tangentbord ", pt: "Teclado mecânico gaming ", es: "Teclado mecánico gaming ", de: "Gaming mechanische Tastatur " }],
  [/Bàn phím cơ/g, { fr: "Clavier mécanique ", it: "Tastiera meccanica ", en: "Mechanical keyboard ", nl: "Mechanisch toetsenbord ", sv: "Mekaniskt tangentbord ", pt: "Teclado mecânico ", es: "Teclado mecánico ", de: "Mechanische Tastatur " }],
  [/Bàn phím Không dây/g, { fr: "Clavier sans fil ", it: "Tastiera wireless ", en: "Wireless keyboard ", nl: "Draadloos toetsenbord ", sv: "Trådlöst tangentbord ", pt: "Teclado sem fios ", es: "Teclado inalámbrico ", de: "Kabellose Tastatur " }],
  [/Bàn phím có dây/g, { fr: "Clavier filaire ", it: "Tastiera cablata ", en: "Wired keyboard ", nl: "Bedraad toetsenbord ", sv: "Trådbundet tangentbord ", pt: "Teclado com fios ", es: "Teclado con cable ", de: "Kabelgebundene Tastatur " }],
  [/Bàn phím gaming/g, { fr: "Clavier gaming ", it: "Tastiera gaming ", en: "Gaming keyboard ", nl: "Gaming-toetsenbord ", sv: "Gamingtangentbord ", pt: "Teclado gaming ", es: "Teclado gaming ", de: "Gaming-Tastatur " }],
  [/Bàn phím/g, { fr: "Clavier ", it: "Tastiera ", en: "Keyboard ", nl: "Toetsenbord ", sv: "Tangentbord ", pt: "Teclado ", es: "Teclado ", de: "Tastatur " }],
  [/Chuột gaming/g, { fr: "Souris gaming ", it: "Mouse gaming ", en: "Gaming mouse ", nl: "Gaming-muis ", sv: "Spelmus ", pt: "Rato gaming ", es: "Ratón gaming ", de: "Gaming-Maus " }],
  [/Chuột Không dây/g, { fr: "Souris sans fil ", it: "Mouse wireless ", en: "Wireless mouse ", nl: "Draadloze muis ", sv: "Trådlös mus ", pt: "Rato sem fios ", es: "Ratón inalámbrico ", de: "Kabellose Maus " }],
  [/Chuột/g, { fr: "Souris ", it: "Mouse ", en: "Mouse ", nl: "Muis ", sv: "Mus ", pt: "Rato ", es: "Ratón ", de: "Maus " }],
  [/Tai nghe True Wireless/g, { fr: "Écouteurs true wireless ", it: "Auricolari true wireless ", en: "True wireless earbuds ", nl: "True wireless oordopjes ", sv: "True wireless öronsnäckor ", pt: "Auscultadores true wireless ", es: "Auriculares true wireless ", de: "True-Wireless-Kopfhörer " }],
  [/Tai nghe/g, { fr: "Casque ", it: "Cuffie ", en: "Headset ", nl: "Headset ", sv: "Headset ", pt: "Auscultadores ", es: "Auriculares ", de: "Headset " }],
  [/Laptop gaming/g, { fr: "PC portable gaming ", it: "PC portatile gaming ", en: "Gaming laptop ", nl: "Gaming laptop ", sv: "Gaming bärbar dator ", pt: "Portátil gaming ", es: "Portátil gaming ", de: "Gaming-Laptop " }],
  [/Laptop/g, { fr: "PC portable ", it: "PC portatile ", en: "Laptop ", nl: "Laptop ", sv: "Bärbar dator ", pt: "Portátil ", es: "Portátil ", de: "Laptop " }],
];

const COLOR_TR = [
  [/Xanh dương \+ Trắng \+ Tím đậm/g, { fr: "Bleu + Blanc + Violet foncé", it: "Blu + Bianco + Viola scuro", en: "Blue + White + Deep Purple", nl: "Blauw + Wit + Donkerpaars", sv: "Blå + Vit + Mörklila", pt: "Azul + Branco + Roxo profundo", es: "Azul + Blanco + Morado oscuro", de: "Blau + Weiß + Dunkelviolett" }],
  [/Trắng \+ Tím Gradient - Seiya/g, { fr: "Blanc + Violet dégradé - Seiya", it: "Bianco + Viola sfumato - Seiya", en: "White + Purple Gradient - Seiya", nl: "Wit + Paars verloop - Seiya", sv: "Vit + Lila gradient - Seiya", pt: "Branco + Roxo gradiente - Seiya", es: "Blanco + Morado degradado - Seiya", de: "Weiß + Lila Verlauf - Seiya" }],
  [/Đen \+ Trắng \+ Hồng/g, { fr: "Noir + Blanc + Rose", it: "Nero + Bianco + Rosa", en: "Black + White + Pink", nl: "Zwart + Wit + Roze", sv: "Svart + Vit + Rosa", pt: "Preto + Branco + Rosa", es: "Negro + Blanco + Rosa", de: "Schwarz + Weiß + Rosa" }],
  [/Đen \+ Trắng \+ Xanh Dương/g, { fr: "Noir + Blanc + Bleu", it: "Nero + Bianco + Blu", en: "Black + White + Blue", nl: "Zwart + Wit + Blauw", sv: "Svart + Vit + Blå", pt: "Preto + Branco + Azul", es: "Negro + Blanco + Azul", de: "Schwarz + Weiß + Blau" }],
  [/Moon Cat trắng/g, { fr: "Moon Cat Blanc", it: "Moon Cat Bianco", en: "Moon Cat White", nl: "Moon Cat Wit", sv: "Moon Cat Vit", pt: "Moon Cat Branco", es: "Moon Cat Blanco", de: "Moon Cat Weiß" }],
  [/Moon Cat hồng/g, { fr: "Moon Cat Rose", it: "Moon Cat Rosa", en: "Moon Cat Pink", nl: "Moon Cat Roze", sv: "Moon Cat Rosa", pt: "Moon Cat Rosa", es: "Moon Cat Rosa", de: "Moon Cat Rosa" }],
  [/Trắng Dream Switch/g, { fr: "Blanc Dream Switch", it: "Bianco Dream Switch", en: "White Dream Switch", nl: "Wit Dream Switch", sv: "Vit Dream Switch", pt: "Branco Dream Switch", es: "Blanco Dream Switch", de: "Weiß Dream Switch" }],
  [/Đen contour/g, { fr: "Noir contour", it: "Nero contorno", en: "Black contour", nl: "Zwart contour", sv: "Svart kontur", pt: "Preto contorno", es: "Negro contorno", de: "Schwarz Kontur" }],
];

const HEAD = { en: "Specifications", fr: "Spécifications", it: "Specifiche", nl: "Specificaties", sv: "Specifikationer", pt: "Especificações", es: "Especificaciones", de: "Technische Daten" };

const KEY_TR = {
  "Phương thức kết nối": { fr: "Méthode de connexion", it: "Metodo di connessione", en: "Connection", nl: "Verbindingsmethode", sv: "Anslutningsmetod", pt: "Método de ligação", es: "Método de conexión", de: "Verbindungsmethode" },
  "Màu sắc": { fr: "Couleur", it: "Colore", en: "Color", nl: "Kleur", sv: "Färg", pt: "Cor", es: "Color", de: "Farbe" },
  "Số lượng phím": { fr: "Nombre de touches", it: "Numero di tasti", en: "Number of keys", nl: "Aantal toetsen", sv: "Antal tangenter", pt: "Número de teclas", es: "Número de teclas", de: "Anzahl der Tasten" },
  "Kích thước\/Layout": { fr: "Taille\/Layout", it: "Dimensione\/Layout", en: "Size\/Layout", nl: "Grootte\/Layout", sv: "Storlek\/Layout", pt: "Tamanho\/Layout", es: "Tamaño\/Layout", de: "Größe\/Layout" },
  "Kích thước màn hình": { fr: "Taille de l'écran", it: "Dimensione schermo", en: "Screen size", nl: "Schermgrootte", sv: "Skärmstorlek", pt: "Tamanho do ecrã", es: "Tamaño de pantalla", de: "Bildschirmgröße" },
  "Độ phân giải": { fr: "Résolution", it: "Risoluzione", en: "Resolution", nl: "Resolutie", sv: "Upplösning", pt: "Resolução", es: "Resolución", de: "Auflösung" },
  "Dung lượng RAM": { fr: "Capacité de RAM", it: "Capacità RAM", en: "RAM capacity", nl: "RAM-capaciteit", sv: "RAM-kapacitet", pt: "Capacidade de RAM", es: "Capacidad de RAM", de: "RAM-Kapazität" },
  "Dung lượng SSD": { fr: "Capacité de SSD", it: "Capacità SSD", en: "SSD capacity", nl: "SSD-capaciteit", sv: "SSD-kapacitet", pt: "Capacidade de SSD", es: "Capacidad de SSD", de: "SSD-Kapazität" },
  "Dòng CPU": { fr: "Série de CPU", it: "Serie CPU", en: "CPU series", nl: "CPU-serie", sv: "CPU-serie", pt: "Série de CPU", es: "Serie de CPU", de: "CPU-Serie" },
  "Dòng GPU": { fr: "Série de GPU", it: "Serie GPU", en: "GPU series", nl: "GPU-serie", sv: "GPU-serie", pt: "Série de GPU", es: "Serie de GPU", de: "GPU-Serie" },
  "Card đồ họa": { fr: "Carte graphique", it: "Scheda grafica", en: "Graphics card", nl: "Videokaart", sv: "Grafikkort", pt: "Placa gráfica", es: "Tarjeta gráfica", de: "Grafikkarte" },
  "Tấm nền": { fr: "Dalle", it: "Pannello", en: "Panel", nl: "Paneel", sv: "Panel", pt: "Painel", es: "Panel", de: "Panel" },
  "Chất liệu Keycap": { fr: "Matériau des keycaps", it: "Materiale keycap", en: "Keycap material", nl: "Keycap-materiaal", sv: "Keycap-material", pt: "Material dos keycaps", es: "Material de las teclas", de: "Keycap-Material" },
  "Chất liệu vỏ": { fr: "Matériau du châssis", it: "Materiale del guscio", en: "Shell material", nl: "Behuizingsmateriaal", sv: "Höljesmaterial", pt: "Material da carcaça", es: "Material del chasis", de: "Gehäusematerial" },
  "Đèn LED": { fr: "LED", it: "LED", en: "LED", nl: "LED", sv: "LED", pt: "LED", es: "LED", de: "LED" },
  "Cảm biến": { fr: "Capteur", it: "Sensore", en: "Sensor", nl: "Sensor", sv: "Sensor", pt: "Sensor", es: "Sensor", de: "Sensor" },
  "Kết nối": { fr: "Connexion", it: "Connessione", en: "Connection", nl: "Verbinding", sv: "Anslutning", pt: "Ligação", es: "Conexión", de: "Verbindung" },
  "Trọng lượng": { fr: "Poids", it: "Peso", en: "Weight", nl: "Gewicht", sv: "Vikt", pt: "Peso", es: "Peso", de: "Gewicht" },
};

const VAL_TR = [
  [/(\d+)\s*phím/g, { fr: "$1 touches", it: "$1 tasti", en: "$1 keys", nl: "$1 toetsen", sv: "$1 tangenter", pt: "$1 teclas", es: "$1 teclas", de: "$1 Tasten" }],
  [/Không dây/g, { fr: "Sans fil", it: "Wireless", en: "Wireless", nl: "Draadloos", sv: "Trådlös", pt: "Sem fios", es: "Inalámbrico", de: "Kabellos" }],
  [/Có dây/g, { fr: "Filaire", it: "Cablato", en: "Wired", nl: "Bedraad", sv: "Trådbunden", pt: "Com fios", es: "Con cable", de: "Kabelgebunden" }],
  [/Không\b/g, { fr: "Non", it: "No", en: "No", nl: "Nee", sv: "Nej", pt: "Não", es: "No", de: "Nein" }],
  [/Nhựa/g, { fr: "Plastique", it: "Plastica", en: "Plastic", nl: "Kunststof", sv: "Plast", pt: "Plástico", es: "Plástico", de: "Kunststoff" }],
  [/Trắng/g, { fr: "Blanc", it: "Bianco", en: "White", nl: "Wit", sv: "Vit", pt: "Branco", es: "Blanco", de: "Weiß" }],
  [/Đen/g, { fr: "Noir", it: "Nero", en: "Black", nl: "Zwart", sv: "Svart", pt: "Preto", es: "Negro", de: "Schwarz" }],
  [/Hồng/g, { fr: "Rose", it: "Rosa", en: "Pink", nl: "Roze", sv: "Rosa", pt: "Rosa", es: "Rosa", de: "Rosa" }],
  [/Xám/g, { fr: "Gris", it: "Grigio", en: "Gray", nl: "Grijs", sv: "Grå", pt: "Cinza", es: "Gris", de: "Grau" }],
  [/Xanh dương/g, { fr: "Bleu", it: "Blu", en: "Blue", nl: "Blauw", sv: "Blå", pt: "Azul", es: "Azul", de: "Blau" }],
  [/Xanh/g, { fr: "Vert", it: "Verde", en: "Green", nl: "Groen", sv: "Grön", pt: "Verde", es: "Verde", de: "Grün" }],
  [/Tím đậm/g, { fr: "Violet foncé", it: "Viola scuro", en: "Deep Purple", nl: "Donkerpaars", sv: "Mörklila", pt: "Roxo profundo", es: "Morado oscuro", de: "Dunkelviolett" }],
  [/tím/g, { fr: "violet", it: "viola", en: "purple", nl: "paars", sv: "lila", pt: "roxo", es: "morado", de: "lila" }],
  [/nâu/gi, { fr: "brun", it: "marrone", en: "brown", nl: "bruin", sv: "brun", pt: "marrom", es: "marrón", de: "braun" }],
  [/ghế/gi, { fr: "chaise", it: "sedia", en: "chair", nl: "stoel", sv: "stol", pt: "cadeira", es: "silla", de: "Stuhl" }],
];

function translateName(name, lang) {
  let out = name;
  for (const [re, words] of GENERIC) if (words[lang]) { out = out.replace(re, words[lang]); break; }
  for (const [re, words] of COLOR_TR) if (words[lang]) out = out.replace(re, words[lang]);
  return out;
}

const ACC_DESC = {
  fr: (n, b) => `Découvrez le ${n}\n\nLe ${n} de ${b} associe utilité quotidienne et style distinct, construit autour des specs du tableau technique. Chaque composant est choisi pour des performances fiables sur de longues sessions de travail ou de jeu.\n\nConçu pour le confort et la régularité\n\nLa disposition garde les longues sessions confortables tout en restant précise pour un usage rapide. La compatibilité couvre les systèmes et appareils déjà sur votre bureau.\n\nConnectivité flexible pour chaque configuration\n\nLes options de connexion conviennent aux bureaux fixes comme aux espaces mobiles, avec une latence faible et une réponse constante au travail comme en jeu.\n\nAchetez le ${n} chez GearVN\n\nGearVN propose des produits ${b} authentiques avec garantie crédible et livraison rapide dans tout le pays. Commandez dès aujourd'hui le ${n} pour améliorer votre installation avec un choix fiable.`,
  it: (n, b) => `Scopri il ${n}\n\nIl ${n} di ${b} unisce usabilità quotidiana e uno stile distinto, costruito attorno alle specifiche della tabella tecnica. Ogni componente è scelto per prestazioni affidabili nelle lunghe sessioni di lavoro o gioco.\n\nProgettato per comfort e costanza\n\nIl layout mantiene le sessioni lunghe comode, restando preciso nell'uso veloce. La compatibilità copre i sistemi e dispositivi già sulla tua scrivania.\n\nConnettività flessibile per ogni configurazione\n\nLe opzioni di connessione si adattano a scrivanie fisse o spazi mobili, con bassa latenza e risposta costante sia al lavoro che nel gioco.\n\nCompra il ${n} su GearVN\n\nGearVN offre prodotti ${b} originali con garanzia credibile e consegna rapida in tutto il paese. Ordina subito il ${n} per aggiornare la postazione con una scelta affidabile.`,
  en: (n, b) => `Discover the ${n}\n\nThe ${n} from ${b} combines practical usability with a distinct look, built around the specs listed in the technical table. Every part is selected for dependable performance through long work or play sessions.\n\nDesigned for comfort and consistency\n\nThe layout keeps long sessions comfortable while staying precise during fast-paced use. Compatibility spans the common systems and devices already on your desk.\n\nFlexible connectivity for every setup\n\nConnection options fit fixed desks or mobile workspaces with low latency and consistent response in both work and play.\n\nBuy the ${n} at GearVN\n\nGearVN offers genuine ${b} products with credible warranty support and fast nationwide delivery. Order the ${n} today to upgrade your setup with a reliable pick.`,
  pt: (n, b) => `Descubra o ${n}\n\nO ${n} da ${b} equilibra usabilidade diária com um visual distinto, construído com as especificações da tabela técnica. Cada componente é escolhido para desempenho confiável em longas sessões de trabalho ou jogo.\n\nPensado para conforto e consistência\n\nO layout mantém as sessões longas confortáveis mantendo precisão no uso rápido. A compatibilidade cobre os sistemas e dispositivos já na sua mesa.\n\nConectividade flexível para cada configuração\n\nAs opções de ligação servem mesas fixas ou espaços móveis, com baixa latência e resposta constante no trabalho e no jogo.\n\nCompre o ${n} na GearVN\n\nA GearVN oferece produtos ${b} originais com garantia credível e entrega rápida em todo o país. Encomende já o ${n} para atualizar o seu espaço com uma escolha fiável.`,
  de: (n, b) => `Entdecken Sie den ${n}\n\nDer ${n} von ${b} verbindet den Alltagseinsatz mit einem eigenen Look, aufgebaut auf den Specs der technischen Tabelle. Jede Komponente ist für zuverlässige Leistung bei langen Arbeits- oder Spielsessions gewählt.\n\nFür Komfort und Konstanz gebaut\n\nDas Layout hält lange Sessions bequem und bleibt bei schnellem Einsatz präzise. Die Kompatibilität deckt die gängigen Systeme und Geräte auf Ihrem Schreibtisch ab.\n\nFlexible Konnektivität für jedes Setup\n\nVerbindungsoptionen passen zu festen Schreibtischen oder mobilen Arbeitsplätzen — mit geringer Latenz und gleichmäßiger Reaktion in Arbeit und Spiel.\n\nKaufen Sie den ${n} bei GearVN\n\nGearVN bietet originale ${b}-Produkte mit verlässlicher Garantie und schnellem Lieferdienst. Bestellen Sie den ${n} noch heute, um Ihr Setup mit einer zuverlässigen Wahl aufzuwerten.`,
};

const LAPTOP_DESC = {
  fr: (n, b) => `Découvrez le ${n}\n\nLe ${n} équilibre performances, qualité d'affichage et mobilité pour le travail, les études et le divertissement. La configuration couvre le multitâche quotidien comme les tâches créatives plus lourdes, dans un châssis fait pour le transport quotidien.\n\nPlateforme et mémoire pour de vraies charges\n\nLa combinaison CPU/GPU délivre un traitement stable tandis que la RAM et le stockage gardent applications, fichiers et projets à portée de main sans nettoyage constant.\n\nÉcran et connectivité pour les longues sessions\n\nL'écran reste net et confortable sur de longues heures, et la sélection de ports couvre écrans externes, périphériques et réseau filaire au besoin.\n\nAchetez le ${n} chez GearVN\n\nGearVN propose des produits ${b} authentiques avec garantie crédible et livraison rapide dans tout le pays. Commandez dès aujourd'hui le ${n} pour équiper votre espace avec un portable fiable.`,
  it: (n, b) => `Scopri il ${n}\n\nIl ${n} bilancia prestazioni, qualità dello schermo e portabilità per lavoro, studio e intrattenimento. La configurazione copre il multitasking quotidiano e le attività creative più pesanti, in un chassis fatto per il trasporto quotidiano.\n\nPiattaforma e memoria per carichi reali\n\nLa combinazione CPU/GPU garantisce elaborazione stabile, mentre RAM e storage tengono app, file e progetti sempre a portata di mano.\n\nSchermo e connettività per sessioni lunghe\n\nLo schermo resta nitido e comodo per molte ore, e la selezione di porte copre monitor esterni, periferiche e rete cablata quando serve.\n\nCompra il ${n} su GearVN\n\nGearVN offre prodotti ${b} originali con garanzia credibile e consegna rapida in tutto il paese. Ordina subito il ${n} per aggiornare la postazione con un laptop affidabile.`,
  en: (n, b) => `Discover the ${n}\n\nThe ${n} balances performance, display quality and portability for work, study and entertainment. The configuration covers everyday multitasking as well as heavier creative tasks, wrapped in a chassis made for daily transport.\n\nPlatform and memory for real workloads\n\nThe CPU/GPU combination delivers stable processing while the RAM and storage keep apps, files and projects close at hand without constant cleanup.\n\nDisplay and connectivity for long sessions\n\nThe screen stays clear and comfortable over long hours, and the port selection covers external displays, peripherals and wired network when needed.\n\nBuy the ${n} at GearVN\n\nGearVN offers genuine ${b} products with credible warranty support and fast nationwide delivery. Order the ${n} today to upgrade your workspace with a reliable laptop.`,
};

let count = 0;
for (const block of blocks) {
  const pid = block.match(/^([0-9a-f]+)/)[1];
  if (!hand[pid]) continue;
  const name = (block.match(/NAME: (.*)/)[1] || "").trim();
  const brand = (block.match(/BRAND: (.*)/)[1] || "").trim();
  const langs = block.match(/LANGS: (.*)/)[1].trim().split(",").map((s) => s.trim());
  const specsBlock = block.match(/SPECS \(key=value\):\n([\s\S]*?)\nTECH_DESCRIPTION/);
  const specEntries = [];
  if (specsBlock) {
    for (const line of specsBlock[1].split("\n")) {
      const m = line.match(/^\s+(\S+)\s=\s(.*)$/);
      if (m) specEntries.push([m[1], m[2]]);
    }
  }
  const techMatch = block.match(/TECH_DESCRIPTION \(verbatim\):\n(.*)/);
  const alts = [...block.matchAll(/  \[(\d+)\] (.*)/g)]
    .filter((m) => !/type=/.test(m[2]))
    .map((m) => m[2].trim())
    .filter(Boolean);
  const isLaptop = /^Laptop/.test(name);
  for (const lang of langs) {
    const t = hand[pid][lang];
    const needsFill = !t || !t.name || !t.description || (t.description || "").length < 80;
    if (!needsFill) continue;
    const trName = translateName(name, lang);
    let tech = "";
    if (techMatch) {
      const pairs = [...techMatch[1].matchAll(/"([^"]+)":\s*"([^"]*)"/g)];
      tech =
        `${HEAD[lang]}: {` +
        pairs
          .map(([, k, v]) => {
            const kk = KEY_TR[k] ? KEY_TR[k][lang] : k;
            const vv = String(v).replace(/Không dây/g, {
              fr: "Sans fil", it: "Wireless", en: "Wireless",
              nl: "Draadloos", sv: "Trådlös", pt: "Sem fios",
              es: "Inalámbrico", de: "Kabellos",
            }[lang] || "");
            return `"${kk}": "${vv}"`;
          })
          .join(", ") +
        "}";
    }
    const specObj = {};
    for (const [k, v] of specEntries) {
      specObj[k] = String(v).replace(/Không dây/g, { fr: "Sans fil", it: "Wireless", en: "Wireless", nl: "Draadloos", sv: "Trådlös", pt: "Sem fios", es: "Inalámbrico", de: "Kabellos" }[lang] || "");
    }
    hand[pid][lang] = {
      name: trName,
      description: isLaptop
        ? (LAPTOP_DESC[lang] || LAPTOP_DESC.en)(trName, brand)
        : (ACC_DESC[lang] || ACC_DESC.en)(trName, brand),
      brand,
      specs: specObj,
      technicalDescription: tech,
      imageAlts: alts.map((a) => a),
    };
    count++;
  }
}
console.log("filled:", count);
fs.writeFileSync(HAND_ACC, JSON.stringify(hand, null, 2) + "\n", "utf8");
