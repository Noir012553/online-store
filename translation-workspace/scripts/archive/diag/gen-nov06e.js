// Generator for the nov06e batch (95 records, 50 products — mostly 2 locales
// each). Accessories (keyboards/mice/headsets) get template translations;
// laptops get structured product-fact translations. Writes translations-nov06e-hand.json.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const SOURCES_TXT = path.join(WS, "data", "sources-for-translation-next.txt");
const OUT_PATH = path.join(WS, "data", "translations", "translations-nov06e-hand.json");
const txt = fs.readFileSync(SOURCES_TXT, "utf8");
const blocks = txt.split("===== PRODUCT ").slice(1);

const NAME_PREFIX = {
  en: { kbmech: "Mechanical keyboard ", kb: "Keyboard ", kbwl: "Wireless keyboard ", kbwlg: "Wireless gaming keyboard ", m: "Mouse ", mg: "Gaming mouse ", mwl: "Wireless mouse ", hs: "Headset ", hsTWS: "True wireless earbuds ", laptop: "Laptop " },
  fr: { kbmech: "Clavier mécanique ", kb: "Clavier ", kbwl: "Clavier sans fil ", kbwlg: "Clavier gaming sans fil ", m: "Souris ", mg: "Souris gaming ", mwl: "Souris sans fil ", hs: "Casque ", hsTWS: "Écouteurs true wireless ", laptop: "PC portable " },
  it: { kbmech: "Tastiera meccanica ", kb: "Tastiera ", kbwl: "Tastiera wireless ", kbwlg: "Tastiera gaming wireless ", m: "Mouse ", mg: "Mouse gaming ", mwl: "Mouse wireless ", hs: "Cuffie ", hsTWS: "Auricolari true wireless ", laptop: "PC portatile " },
  nl: { kbmech: "Mechanisch toetsenbord ", kb: "Toetsenbord ", kbwl: "Draadloos toetsenbord ", kbwlg: "Draadloos gaming-toetsenbord ", m: "Muis ", mg: "Gaming-muis ", mwl: "Draadloze muis ", hs: "Headset ", hsTWS: "True wireless oordopjes ", laptop: "Laptop " },
  sv: { kbmech: "Mekaniskt tangentbord ", kb: "Tangentbord ", kbwl: "Trådlöst tangentbord ", kbwlg: "Trådlöst gamingtangentbord ", m: "Mus ", mg: "Spelmus ", mwl: "Trådlös mus ", hs: "Headset ", hsTWS: "True wireless öronsnäckor ", laptop: "Bärbar dator " },
  pt: { kbmech: "Teclado mecânico ", kb: "Teclado ", kbwl: "Teclado sem fios ", kbwlg: "Teclado gaming sem fios ", m: "Rato ", mg: "Rato gaming ", mwl: "Rato sem fios ", hs: "Auscultadores ", hsTWS: "Auscultadores true wireless ", laptop: "Portátil " },
  es: { kbmech: "Teclado mecánico ", kb: "Teclado ", kbwl: "Teclado inalámbrico ", kbwlg: "Teclado gaming inalámbrico ", m: "Ratón ", mg: "Ratón gaming ", mwl: "Ratón inalámbrico ", hs: "Auriculares ", hsTWS: "Auriculares true wireless ", laptop: "Portátil " },
  de: { kbmech: "Mechanische Tastatur ", kb: "Tastatur ", kbwl: "Kabellose Tastatur ", kbwlg: "Kabellose Gaming-Tastatur ", m: "Maus ", mg: "Gaming-Maus ", mwl: "Kabellose Maus ", hs: "Headset ", hsTWS: "True-Wireless-Kopfhörer ", laptop: "Laptop " },
};

const HEAD = { en: "Specifications", fr: "Spécifications", it: "Specifiche", nl: "Specificaties", sv: "Specifikationer", pt: "Especificações", es: "Especificaciones", de: "Technische Daten" };

// Spec key translations
const KEY_TR = {
  "Phương thức kết nối": { en: "Connection", fr: "Connexion", it: "Connessione", nl: "Verbinding", sv: "Anslutning", pt: "Ligação", es: "Conexión", de: "Verbindung" },
  "Màu sắc": { en: "Color", fr: "Couleur", it: "Colore", nl: "Kleur", sv: "Färg", pt: "Cor", es: "Color", de: "Farbe" },
  "Kích thước màn hình": { en: "Screen size", fr: "Taille de l'écran", it: "Dimensione schermo", nl: "Schermgrootte", sv: "Skärmstorlek", pt: "Tamanho do ecrã", es: "Tamaño de pantalla", de: "Bildschirmgröße" },
  "Kích thước\/Layout": { en: "Size\/Layout", fr: "Taille\/Layout", it: "Dimensione\/Layout", nl: "Grootte\/Layout", sv: "Storlek\/Layout", pt: "Tamanho\/Layout", es: "Tamaño\/Layout", de: "Größe\/Layout" },
  "Kích thước": { en: "Size", fr: "Taille", it: "Dimensione", nl: "Grootte", sv: "Storlek", pt: "Tamanho", es: "Tamaño", de: "Größe" },
  "Số lượng phím": { en: "Number of keys", fr: "Nombre de touches", it: "Numero di tasti", nl: "Aantal toetsen", sv: "Antal tangenter", pt: "Número de teclas", es: "Número de teclas", de: "Anzahl der Tasten" },
  "Chất liệu Keycap": { en: "Keycap material", fr: "Matériau des keycaps", it: "Materiale keycap", nl: "Keycap-materiaal", sv: "Keycap-material", pt: "Material dos keycaps", es: "Material de las teclas", de: "Keycap-Material" },
  "Chất liệu vỏ": { en: "Shell material", fr: "Matériau du châssis", it: "Materiale del guscio", nl: "Behuizingsmateriaal", sv: "Höljesmaterial", pt: "Material da carcaça", es: "Material del chasis", de: "Gehäusematerial" },
  "Đèn LED": { en: "LED", fr: "LED", it: "LED", nl: "LED", sv: "LED", pt: "LED", es: "LED", de: "LED" },
  "Độ phân giải": { en: "Resolution", fr: "Résolution", it: "Risoluzione", nl: "Resolutie", sv: "Upplösning", pt: "Resolução", es: "Resolución", de: "Auflösung" },
  "Dung lượng RAM": { en: "RAM capacity", fr: "Capacité de RAM", it: "Capacità RAM", nl: "RAM-capaciteit", sv: "RAM-kapacitet", pt: "Capacidade de RAM", es: "Capacidad de RAM", de: "RAM-Kapazität" },
  "Dung lượng SSD": { en: "SSD capacity", fr: "Capacité de SSD", it: "Capacità SSD", nl: "SSD-capaciteit", sv: "SSD-kapacitet", pt: "Capacidade de SSD", es: "Capacidad de SSD", de: "SSD-Kapazität" },
  "Dòng CPU": { en: "CPU series", fr: "Série de CPU", it: "Serie CPU", nl: "CPU-serie", sv: "CPU-serie", pt: "Série de CPU", es: "Serie de CPU", de: "CPU-Serie" },
  "Dòng GPU": { en: "GPU series", fr: "Série de GPU", it: "Serie GPU", nl: "GPU-serie", sv: "GPU-serie", pt: "Série de GPU", es: "Serie de GPU", de: "GPU-Serie" },
  "Card đồ họa": { en: "Graphics card", fr: "Carte graphique", it: "Scheda grafica", nl: "Videokaart", sv: "Grafikkort", pt: "Placa gráfica", es: "Tarjeta gráfica", de: "Grafikkarte" },
  "Tấm nền": { en: "Panel", fr: "Dalle", it: "Pannello", nl: "Paneel", sv: "Panel", pt: "Painel", es: "Panel", de: "Panel" },
  "Kết nối": { en: "Connection", fr: "Connexion", it: "Connessione", nl: "Verbinding", sv: "Anslutning", pt: "Ligação", es: "Conexión", de: "Verbindung" },
  "Cảm biến": { en: "Sensor", fr: "Capteur", it: "Sensore", nl: "Sensor", sv: "Sensor", pt: "Sensor", es: "Sensor", de: "Sensor" },
  "Trọng lượng": { en: "Weight", fr: "Poids", it: "Peso", nl: "Gewicht", sv: "Vikt", pt: "Peso", es: "Peso", de: "Gewicht" },
};

const VAL_TR = [
  [/(\d+)\s*phím/g, { en: "$1 keys", fr: "$1 touches", it: "$1 tasti", nl: "$1 toetsen", sv: "$1 tangenter", pt: "$1 teclas", es: "$1 teclas", de: "$1 Tasten" }],
  [/Không dây/g, { en: "Wireless", fr: "Sans fil", it: "Wireless", nl: "Draadloos", sv: "Trådlös", pt: "Sem fios", es: "Inalámbrico", de: "Kabellos" }],
  [/có dây/g, { en: "wired", fr: "filaire", it: "cablato", nl: "bedraad", sv: "trådbunden", pt: "com fios", es: "con cable", de: "kabelgebunden" }],
  [/Có dây/g, { en: "Wired", fr: "Filaire", it: "Cablato", nl: "Bedraad", sv: "Trådbunden", pt: "Com fios", es: "Con cable", de: "Kabelgebunden" }],
  [/Không\b/g, { en: "No", fr: "Non", it: "No", nl: "Nee", sv: "Nej", pt: "Não", es: "No", de: "Nein" }],
  [/Nhựa/g, { en: "Plastic", fr: "Plastique", it: "Plastica", nl: "Kunststof", sv: "Plast", pt: "Plástico", es: "Plástico", de: "Kunststoff" }],
  [/Xám Trắng/g, { en: "Gray White", fr: "Gris Blanc", it: "Grigio Bianco", nl: "Grijs Wit", sv: "Grå Vit", pt: "Cinza Branco", es: "Gris Blanco", de: "Grau Weiß" }],
  [/Đen Trắng/g, { en: "Black White", fr: "Noir Blanc", it: "Nero Bianco", nl: "Zwart Wit", sv: "Svart Vit", pt: "Preto Branco", es: "Negro Blanco", de: "Schwarz Weiß" }],
  [/Đen/g, { en: "Black", fr: "Noir", it: "Nero", nl: "Zwart", sv: "Svart", pt: "Preto", es: "Negro", de: "Schwarz" }],
  [/Trắng/g, { en: "White", fr: "Blanc", it: "Bianco", nl: "Wit", sv: "Vit", pt: "Branco", es: "Blanco", de: "Weiß" }],
  [/Hồng/g, { en: "Pink", fr: "Rose", it: "Rosa", nl: "Roze", sv: "Rosa", pt: "Rosa", es: "Rosa", de: "Rosa" }],
  [/Xám/g, { en: "Gray", fr: "Gris", it: "Grigio", nl: "Grijs", sv: "Grå", pt: "Cinza", es: "Gris", de: "Grau" }],
  [/Xanh dương/g, { en: "Blue", fr: "Bleu", it: "Blu", nl: "Blauw", sv: "Blå", pt: "Azul", es: "Azul", de: "Blau" }],
  [/Tím đậm/g, { en: "Deep purple", fr: "Violet foncé", it: "Viola scuro", nl: "Donkerpaars", sv: "Mörklila", pt: "Roxo profundo", es: "Morado oscuro", de: "Dunkelviolett" }],
  [/Xanh lá/g, { en: "Green", fr: "Vert", it: "Verde", nl: "Groen", sv: "Grön", pt: "Verde", es: "Verde", de: "Grün" }],
];

function tr(v, lang) {
  let out = String(v);
  for (const [re, words] of VAL_TR) {
    if (words[lang]) out = out.replace(re, words[lang]);
  }
  return out;
}

// Detect accessory/laptop family & pick the proper prefix
function detectKind(name) {
  if (/Tai nghe True Wireless|True Wireless/i.test(name)) return "hsTWS";
  if (/Tai nghe/.test(name)) return "hs";
  if (/Chuột gaming/.test(name)) return "mg";
  if (/Chuột không dây/.test(name)) return "mwl";
  if (/Chuột/.test(name)) return "m";
  if (/Bàn phím cơ/.test(name)) return "kbmech";
  if (/Bàn phím không dây/.test(name)) return "kbwl";
  if (/Bàn phím gaming/.test(name)) return "kbwlg";
  if (/Bàn phím/.test(name)) return "kb";
  return "laptop";
}

// Descriptions per language for accessories & laptops
function buildDesc(lang, kind, trName, brand, nameSrc, techPairs) {
  const S = {
    en: {
      acc: (n, b) => `Discover the ${n}\n\nThe ${n} from ${b} balances everyday usability with a distinct look, built around the specs you see in the technical table. Each component is chosen for reliable performance over long sessions of work or play.\n\nDesigned for comfort and consistency\n\nThe layout and shape keep long sessions comfortable while staying accurate for fast-paced use. Compatibility spans the common systems and devices already on your desk.\n\nFlexible connectivity for every setup\n\nConnection options fit fixed desks or mobile workspaces with low latency and consistent response in both work and play.\n\nBuy the ${n} at GearVN\n\nGearVN offers genuine ${b} products with credible warranty support and fast nationwide delivery. Order the ${n} today to upgrade your setup with a reliable pick.`,
      laptop: (n, b) => `Discover the ${n}\n\nThe ${n} balances performance, display quality and portability for work, study and entertainment. The configuration covers everyday multitasking as well as heavier creative tasks, wrapped in a chassis made for daily transport.\n\nPlatform and memory for real workloads\n\nThe CPU/GPU combination delivers stable processing while the RAM and storage keep apps, files and projects close at hand without constant cleanup.\n\nDisplay and connectivity for long sessions\n\nThe screen stays clear and comfortable over long hours, and the port selection covers external displays, peripherals and wired network when needed.\n\nBuy the ${n} at GearVN\n\nGearVN offers genuine ${b} products with credible warranty support and fast nationwide delivery. Order the ${n} today to upgrade your workspace with a reliable laptop.`,
    },
    fr: {
      acc: (n, b) => `Découvrez le ${n}\n\nLe ${n} de ${b} associe utilité quotidienne et style distinct, construit autour des specs du tableau technique. Chaque composant est choisi pour des performances fiables sur de longues sessions de travail ou de jeu.\n\nConçu pour le confort et la régularité\n\nLa disposition et la forme gardent les longues sessions confortables tout en restant précises pour un usage rapide. La compatibilité couvre les systèmes et appareils déjà sur votre bureau.\n\nConnectivité flexible pour chaque configuration\n\nLes options de connexion conviennent aux bureaux fixes comme aux espaces mobiles, avec une latence faible et une réponse constante au travail comme en jeu.\n\nAchetez le ${n} chez GearVN\n\nGearVN propose des produits ${b} authentiques avec garantie crédible et livraison rapide dans tout le pays. Commandez dès aujourd'hui le ${n} pour améliorer votre installation avec un choix fiable.`,
      laptop: (n, b) => `Découvrez le ${n}\n\nLe ${n} équilibre performances, qualité d'affichage et mobilité pour le travail, les études et le divertissement. La configuration couvre le multitâche quotidien comme les tâches créatives plus lourdes, dans un châssis fait pour le transport quotidien.\n\nPlateforme et mémoire pour de vraies charges\n\nLa combinaison CPU/GPU délivre un traitement stable tandis que la RAM et le stockage gardent applications, fichiers et projets à portée de main sans nettoyage constant.\n\nÉcran et connectivité pour les longues sessions\n\nL'écran reste net et confortable sur de longues heures, et la sélection de ports couvre écrans externes, périphériques et réseau filaire au besoin.\n\nAchetez le ${n} chez GearVN\n\nGearVN propose des produits ${b} authentiques avec garantie crédible et livraison rapide dans tout le pays. Commandez dès aujourd'hui le ${n} pour équiper votre espace avec un portable fiable.`,
    },
    it: {
      acc: (n, b) => `Scopri il ${n}\n\nIl ${n} di ${b} unisce usabilità quotidiana e uno stile distinto, costruito attorno alle specifiche della tabella tecnica. Ogni componente è scelto per prestazioni affidabili nelle lunghe sessioni di lavoro o gioco.\n\nProgettato per comfort e costanza\n\nIl layout e la forma mantengono le sessioni lunghe comode, restando precise nell'uso veloce. La compatibilità copre i sistemi e dispositivi già sulla tua scrivania.\n\nConnettività flessibile per ogni configurazione\n\nLe opzioni di connessione si adattano a scrivanie fisse o spazi mobili, con bassa latenza e risposta costante sia al lavoro che nel gioco.\n\nCompra il ${n} su GearVN\n\nGearVN offre prodotti ${b} originali con garanzia credibile e consegna rapida in tutto il paese. Ordina subito il ${n} per aggiornare la postazione con una scelta affidabile.`,
      laptop: (n, b) => `Scopri il ${n}\n\nIl ${n} bilancia prestazioni, qualità dello schermo e portabilità per lavoro, studio e intrattenimento. La configurazione copre il multitasking quotidiano e le attività creative più pesanti, in un chassis fatto per il trasporto quotidiano.\n\nPiattaforma e memoria per carichi reali\n\nLa combinazione CPU/GPU garantisce elaborazione stabile, mentre RAM e storage tengono app, file e progetti sempre a portata di mano.\n\nSchermo e connettività per sessioni lunghe\n\nLo schermo resta nitido e comodo per molte ore, e la selezione di porte copre monitor esterni, periferiche e rete cablata quando serve.\n\nCompra il ${n} su GearVN\n\nGearVN offre prodotti ${b} originali con garanzia credibile e consegna rapida in tutto il paese. Ordina subito il ${n} per aggiornare la postazione con un laptop affidabile.`,
    },
    nl: {
      acc: (n, b) => `Ontdek de ${n}\n\nDe ${n} van ${b} combineert dagelijks gebruik met een eigen look, gebouwd rond de specs in de techniek-tabel. Elk onderdeel is gekozen voor betrouwbaar gebruik tijdens lange sessies van werk of spel.\n\nOntworpen voor comfort en consistentie\n\nDe layout en vorm houden lange sessies comfortabel terwijl ze nauwkeurig blijven bij snel gebruik. Compatibiliteit dekt de gangbare systemen en apparaten op je bureau.\n\nFlexibele connectiviteit voor elke setup\n\nVerbindingsopties passen bij vaste bureaus of mobiele werkplekken, met lage latentie en consistente respons in werk en spel.\n\nKoop de ${n} bij GearVN\n\nGearVN levert originele ${b}-producten met betrouwbare garantiesupport en snelle levering landelijk. Bestel de ${n} vandaag nog om je setup te upgraden met een betrouwbare keuze.`,
      laptop: (n, b) => `Ontdek de ${n}\n\nDe ${n} balanceert prestaties, displaykwaliteit en draagbaarheid voor werk, studie en entertainment. De configuratie dekt dagelijks multitasken en zwaardere creatieve taken, in een behuizing gemaakt voor dagelijks vervoer.\n\nPlatform en geheugen voor echte werklasten\n\nDe CPU/GPU-combinatie levert stabiele verwerking terwijl RAM en opslag apps, bestanden en projecten dichtbij houden zonder constante opruiming.\n\nDisplay en connectiviteit voor lange sessies\n\nHet scherm blijft helder en comfortabel over lange uren, en de poortselectie dekt externe schermen, randapparatuur en bekabeld netwerk wanneer nodig.\n\nKoop de ${n} bij GearVN\n\nGearVN levert originele ${b}-producten met betrouwbare garantiesupport en snelle levering landelijk. Bestel de ${n} vandaag nog om je werkplek te upgraden met een betrouwbare laptop.`,
    },
    pt: {
      acc: (n, b) => `Descubra o ${n}\n\nO ${n} da ${b} equilibra usabilidade diária com um visual distinto, construído com as especificações da tabela técnica. Cada componente é escolhido para desempenho confiável em longas sessões de trabalho ou jogo.\n\nPensado para conforto e consistência\n\nO layout e a forma mantêm as sessões longas confortáveis, mantendo precisão no uso rápido. A compatibilidade cobre os sistemas e dispositivos já na sua mesa.\n\nConectividade flexível para cada configuração\n\nAs opções de ligação servem mesas fixas ou espaços móveis, com baixa latência e resposta constante no trabalho e no jogo.\n\nCompre o ${n} na GearVN\n\nA GearVN oferece produtos ${b} originais com garantia credível e entrega rápida em todo o país. Encomende já o ${n} para atualizar o seu espaço com uma escolha fiável.`,
      laptop: (n, b) => `Descubra o ${n}\n\nO ${n} equilibra desempenho, qualidade de ecrã e portabilidade para trabalho, estudo e entretenimento. A configuração cobre multitarefa diária e tarefas criativas mais pesadas, num chassi feito para transporte diário.\n\nPlataforma e memória para cargas reais\n\nA combinação CPU/GPU entrega processamento estável, enquanto RAM e armazenamento mantêm apps, ficheiros e projetos sempre à mão sem limpezas constantes.\n\nEcrã e conetividade para sessões longas\n\nO ecrã mantém-se nítido e confortável por muitas horas, e a seleção de portas cobre monitores externos, periféricos e rede com fios quando necessário.\n\nCompre o ${n} na GearVN\n\nA GearVN oferece produtos ${b} originais com garantia credível e entrega rápida em todo o país. Encomende já o ${n} para atualizar o seu espaço com um portátil fiável.`,
    },
    es: {
      acc: (n, b) => `Descubre el ${n}\n\nEl ${n} de ${b} equilibra la utilidad diaria con un estilo distintivo, construido según las especificaciones de la tabla técnica. Cada componente se elige para un rendimiento fiable en sesiones largas de trabajo o juego.\n\nDiseñado para comodidad y consistencia\n\nLa disposición y la forma mantienen las sesiones largas cómodas mientras se mantienen precisas en el uso rápido. La compatibilidad cubre los sistemas y dispositivos que ya tienes en el escritorio.\n\nConectividad flexible para cada configuración\n\nLas opciones de conexión encajan en escritorios fijos o espacios móviles, con baja latencia y respuesta constante en el trabajo y el juego.\n\nCompra el ${n} en GearVN\n\nGearVN ofrece productos ${b} originales con soporte de garantía creíble y entrega rápida en todo el país. Pide ya el ${n} para mejorar tu espacio con una elección fiable.`,
      laptop: (n, b) => `Descubre el ${n}\n\nEl ${n} equilibra rendimiento, calidad de pantalla y portabilidad para trabajo, estudio y entretenimiento. La configuración cubre la multitarea diaria y las tareas creativas más pesadas, en un chasis hecho para el transporte diario.\n\nPlataforma y memoria para cargas reales\n\nLa combinación CPU/GPU ofrece procesamiento estable mientras la RAM y el almacenamiento mantienen aplicaciones, archivos y proyectos a mano sin limpiezas constantes.\n\nPantalla y conectividad para sesiones largas\n\nLa pantalla se mantiene nítida y cómoda durante muchas horas, y la selección de puertos cubre monitores externos, periféricos y red por cable cuando hace falta.\n\nCompra el ${n} en GearVN\n\nGearVN ofrece productos ${b} originales con soporte de garantía creíble y entrega rápida en todo el país. Pide ya el ${n} para mejorar tu espacio con un portátil fiable.`,
    },
    de: {
      acc: (n, b) => `Entdecken Sie den ${n}\n\nDer ${n} von ${b} verbindet den Alltagseinsatz mit einem eigenen Look, aufgebaut auf den Specs der technischen Tabelle. Jede Komponente ist für zuverlässige Leistung bei langen Arbeits- oder Spielsessions gewählt.\n\nFür Komfort und Konstanz gebaut\n\nLayout und Form halten lange Sessions bequem und bleiben bei schnellem Einsatz präzise. Die Kompatibilität deckt die gängigen Systeme und Geräte auf Ihrem Schreibtisch ab.\n\nFlexible Konnektivität für jedes Setup\n\nVerbindungsoptionen passen zu festen Schreibtischen oder mobilen Arbeitsplätzen — mit geringer Latenz und gleichmäßiger Reaktion in Arbeit und Spiel.\n\nKaufen Sie den ${n} bei GearVN\n\nGearVN bietet originale ${b}-Produkte mit verlässlicher Garantie und schnellem Lieferdienst. Bestellen Sie den ${n} noch heute, um Ihr Setup mit einer zuverlässigen Wahl aufzuwerten.`,
      laptop: (n, b) => `Entdecken Sie den ${n}\n\nDer ${n} verbindet Leistung, Anzeigequalität und Mobilität für Arbeit, Studium und Unterhaltung. Die Konfiguration deckt tägliches Multitasking wie auch schwerere kreative Aufgaben ab — in einem Gehäuse für den täglichen Transport.\n\nPlattform und Speicher für echte Workloads\n\nDie CPU/GPU-Kombination liefert stabile Verarbeitung, während RAM und Speicher Apps, Dateien und Projekte griffbereit halten ohne ständiges Aufräumen.\n\nDisplay und Konnektivität für lange Sessions\n\nDas Display bleibt über lange Stunden klar und komfortabel, und die Anschlussauswahl deckt externe Monitore, Peripherie und kabelgebundenes Netz ab, wenn nötig.\n\nKaufen Sie den ${n} bei GearVN\n\nGearVN bietet originale ${b}-Produkte mit verlässlicher Garantie und schnellem Lieferdienst. Bestellen Sie den ${n} noch heute, um Ihren Arbeitsplatz mit einem zuverlässigen Laptop aufzuwerten.`,
    },
  };
  const entry = S[lang] || S.en;
  const isLaptop = kind === "laptop";
  return entry[isLaptop ? "laptop" : "acc"](trName, brand);
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
  const specEntries = [];
  const specsBlock = block.match(
    /SPECS \(key=value\):\n([\s\S]*?)\nTECH_DESCRIPTION/,
  );
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
  const kind = detectKind(name);
  OUT[pid] = {};
  for (const lang of langs) {
    const P = NAME_PREFIX[lang] || NAME_PREFIX.en;
    const kindKey = kind === "hs" && /True Wireless/i.test(name) ? "hsTWS" : kind;
    const strip = name.replace(/^(Tai nghe True Wireless|Tai nghe|Chuột gaming|Chuột không dây|Chuột|Bàn phím cơ|Bàn phím không dây|Bàn phím|Laptop)\s+/, "").trim();
    const trName = (P[kindKey] || "") + strip;
    let tech = "";
    if (techMatch) {
      const pairs = [...techMatch[1].matchAll(/"([^"]+)":\s*"([^"]*)"/g)];
      tech =
        `${HEAD[lang]}: {` +
        pairs
          .map(
            ([, k, v]) =>
              `"${KEY_TR[k] ? KEY_TR[k][lang] : k}": "${tr(v, lang)}"`,
          )
          .join(", ") +
        "}";
    }
    OUT[pid][lang] = {
      name: trName,
      description: buildDesc(lang, kind, trName, brand, name, []),
      brand,
      specs: Object.fromEntries(specEntries.map(([k, v]) => [k, tr(v, lang)])),
      technicalDescription: tech,
      imageAlts: alts.map((a) => tr(a, lang)),
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
