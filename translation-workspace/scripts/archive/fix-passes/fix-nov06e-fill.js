// Generator for nov06e leftovers (90 records across 45 accessory + 22 laptop
// blocks). Uses the correct kind mapping from the batch list: mixes it/fr/de/
// en/es/pt/nl/sv per block. Reuses gen-nov06e's per-language templates but
// with hand-picked kinds per tail.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const HAND_ACC = path.join(WS, "data", "translations", "translations-nov06e-hand.json");
const hand = JSON.parse(fs.readFileSync(HAND_ACC, "utf8"));
const SOURCES_TXT = path.join(WS, "data", "sources-for-translation-next.txt");
const txt = fs.readFileSync(SOURCES_TXT, "utf8");
const blocks = txt.split("===== PRODUCT ").slice(1);
const blockByPid = new Map(blocks.map((b) => [b.match(/^([0-9a-f]+)/)[1], b]));

// Name translations for common brands + generic nouns by lang (chainable)
const GENERIC = [
  [/Bàn phím cơ Gaming/g, { en: "Gaming mechanical keyboard ", fr: "Clavier mécanique gaming ", it: "Tastiera meccanica gaming ", nl: "Gaming mechanisch toetsenbord ", sv: "Gaming mekaniskt tangentbord ", pt: "Teclado mecânico gaming ", es: "Teclado mecánico gaming ", de: "Gaming mechanische Tastatur " }],
  [/Bàn phím cơ/g, { en: "Mechanical keyboard ", fr: "Clavier mécanique ", it: "Tastiera meccanica ", nl: "Mechanisch toetsenbord ", sv: "Mekaniskt tangentbord ", pt: "Teclado mecânico ", es: "Teclado mecánico ", de: "Mechanische Tastatur " }],
  [/Bàn phím Không dây/g, { en: "Wireless keyboard ", fr: "Clavier sans fil ", it: "Tastiera wireless ", nl: "Draadloos toetsenbord ", sv: "Trådlöst tangentbord ", pt: "Teclado sem fios ", es: "Teclado inalámbrico ", de: "Kabellose Tastatur " }],
  [/Bàn phím có dây/g, { en: "Wired keyboard ", fr: "Clavier filaire ", it: "Tastiera cablata ", nl: "Bedraad toetsenbord ", sv: "Trådbundet tangentbord ", pt: "Teclado com fios ", es: "Teclado con cable ", de: "Kabelgebundene Tastatur " }],
  [/Bàn phím gaming/g, { en: "Gaming keyboard ", fr: "Clavier gaming ", it: "Tastiera gaming ", nl: "Gaming-toetsenbord ", sv: "Gamingtangentbord ", pt: "Teclado gaming ", es: "Teclado gaming ", de: "Gaming-Tastatur " }],
  [/Bàn phím/g, { en: "Keyboard ", fr: "Clavier ", it: "Tastiera ", nl: "Toetsenbord ", sv: "Tangentbord ", pt: "Teclado ", es: "Teclado ", de: "Tastatur " }],
  [/Chuột gaming/g, { en: "Gaming mouse ", fr: "Souris gaming ", it: "Mouse gaming ", nl: "Gaming-muis ", sv: "Spelmus ", pt: "Rato gaming ", es: "Ratón gaming ", de: "Gaming-Maus " }],
  [/Chuột Không dây/g, { en: "Wireless mouse ", fr: "Souris sans fil ", it: "Mouse wireless ", nl: "Draadloze muis ", sv: "Trådlös mus ", pt: "Rato sem fios ", es: "Ratón inalámbrico ", de: "Kabellose Maus " }],
  [/Chuột không dây/g, { en: "Wireless mouse ", fr: "Souris sans fil ", it: "Mouse wireless ", nl: "Draadloze muis ", sv: "Trådlös mus ", pt: "Rato sem fios ", es: "Ratón inalámbrico ", de: "Kabellose Maus " }],
  [/Chuột/g, { en: "Mouse ", fr: "Souris ", it: "Mouse ", nl: "Muis ", sv: "Mus ", pt: "Rato ", es: "Ratón ", de: "Maus " }],
  [/Tai nghe True Wireless/g, { en: "True wireless earbuds ", fr: "Écouteurs true wireless ", it: "Auricolari true wireless ", nl: "True wireless oordopjes ", sv: "True wireless öronsnäckor ", pt: "Auscultadores true wireless ", es: "Auriculares true wireless ", de: "True-Wireless-Kopfhörer " }],
  [/Tai nghe/g, { en: "Headset ", fr: "Casque ", it: "Cuffie ", nl: "Headset ", sv: "Headset ", pt: "Auscultadores ", es: "Auriculares ", de: "Headset " }],
  [/Laptop gaming/g, { en: "Gaming laptop ", fr: "PC portable gaming ", it: "PC portatile gaming ", nl: "Gaming laptop ", sv: "Gaming bärbar dator ", pt: "Portátil gaming ", es: "Portátil gaming ", de: "Gaming-Laptop " }],
  [/Laptop/g, { en: "Laptop ", fr: "PC portable ", it: "PC portatile ", nl: "Laptop ", sv: "Bärbar dator ", pt: "Portátil ", es: "Portátil ", de: "Laptop " }],
];

// Trailing VN words commonly appearing at the end of product names
const SUFFIX_TR = [
  [/ Không dây$/g, { en: " Wireless", fr: " sans fil", it: " wireless", nl: " Draadloos", sv: " Trådlös", pt: " Sem fios", es: " Inalámbrico", de: " Kabellos" }],
];

// Color words from name (each is INSIDE parens/after + — keep exact count)
const COLOR_TR = [
  [/Xanh dương \+ Trắng \+ Tím đậm/g, { en: "Blue + White + Deep Purple", fr: "Bleu + Blanc + Violet foncé", it: "Blu + Bianco + Viola scuro", nl: "Blauw + Wit + Donkerpaars", sv: "Blå + Vit + Mörklila", pt: "Azul + Branco + Roxo profundo", es: "Azul + Blanco + Morado oscuro", de: "Blau + Weiß + Dunkelviolett" }],
  [/Trắng \+ Tím Gradient - Seiya/g, { en: "White + Purple Gradient - Seiya", fr: "Blanc + Violet dégradé - Seiya", it: "Bianco + Viola sfumato - Seiya", nl: "Wit + Paars verloop - Seiya", sv: "Vit + Lila gradient - Seiya", pt: "Branco + Roxo gradiente - Seiya", es: "Blanco + Morado degradado - Seiya", de: "Weiß + Lila Verlauf - Seiya" }],
  [/Đen \+ Trắng \+ Hồng/g, { en: "Black + White + Pink", fr: "Noir + Blanc + Rose", it: "Nero + Bianco + Rosa", nl: "Zwart + Wit + Roze", sv: "Svart + Vit + Rosa", pt: "Preto + Branco + Rosa", es: "Negro + Blanco + Rosa", de: "Schwarz + Weiß + Rosa" }],
  [/Black Gradient Grey Wood/g, { en: "Black Gradient Grey Wood" }],
  [/Đen \+ Trắng \+ Xanh Dương/g, { en: "Black + White + Blue", fr: "Noir + Blanc + Bleu", it: "Nero + Bianco + Blu", nl: "Zwart + Wit + Blauw", sv: "Svart + Vit + Blå", pt: "Preto + Branco + Azul", es: "Negro + Blanco + Azul", de: "Schwarz + Weiß + Blau" }],
  [/Gray Black Dream Switch/g, { en: "Gray Black Dream Switch" }],
  [/Trắng Dream Switch/g, { en: "White Dream Switch", fr: "Blanc Dream Switch", it: "Bianco Dream Switch", nl: "Wit Dream Switch", sv: "Vit Dream Switch", pt: "Branco Dream Switch", es: "Blanco Dream Switch", de: "Weiß Dream Switch" }],
  [/White Red Switch/g, {}],
  [/White Blue Switch/g, {}],
  [/Black Blue Switch/g, {}],
  [/White Blue Switch/g, {}],
  [/Brown Switch/g, {}],
  [/Space Gray Scissor/g, {}],
  [/Black Brown Switch/g, {}],
  [/Lake Placid Blue/g, {}],
  [/Moon Cat trắng/g, { en: "Moon Cat White", fr: "Moon Cat Blanc", it: "Moon Cat Bianco", nl: "Moon Cat Wit", sv: "Moon Cat Vit", pt: "Moon Cat Branco", es: "Moon Cat Blanco", de: "Moon Cat Weiß" }],
  [/Moon Cat hồng/g, { en: "Moon Cat Pink", fr: "Moon Cat Rose", it: "Moon Cat Rosa", nl: "Moon Cat Roze", sv: "Moon Cat Rosa", pt: "Moon Cat Rosa", es: "Moon Cat Rosa", de: "Moon Cat Rosa" }],
  [/Đen contour/g, { en: "Black contour", fr: "Noir contour", it: "Nero contorno", nl: "Zwart contour", sv: "Svart kontur", pt: "Preto contorno", es: "Negro contorno", de: "Schwarz Kontur" }],
  [/Blue Font Red Switch/g, {}],
  [/White Mint Brown Switch/g, {}],
  [/Light Speed Pink/g, {}],
  [/GX RGB Tactile/g, {}],
  [/Light Speed Tactile Switch White/g, { en: "Light Speed Tactile Switch White" }],
  [/Pale Grey/g, {}],
  [/White Red switch/g, {}],
];

function translateName(name, lang) {
  let out = name;
  for (const [re, words] of GENERIC) {
    if (words[lang]) { out = out.replace(re, words[lang]); break; }
  }
  for (const [re, words] of SUFFIX_TR) {
    if (words[lang]) out = out.replace(re, words[lang]);
  }
  for (const [re, words] of COLOR_TR) {
    if (words[lang]) out = out.replace(re, words[lang]);
  }
  return out;
}

const HEAD = { en: "Specifications", fr: "Spécifications", it: "Specifiche", nl: "Specificaties", sv: "Specifikationer", pt: "Especificações", es: "Especificaciones", de: "Technische Daten" };

const KEY_TR = {
  "Phương thức kết nối": { en: "Connection", fr: "Connexion", it: "Connessione", nl: "Verbinding", sv: "Anslutning", pt: "Ligação", es: "Conexión", de: "Verbindung" },
  "Màu sắc": { en: "Color", fr: "Couleur", it: "Colore", nl: "Kleur", sv: "Färg", pt: "Cor", es: "Color", de: "Farbe" },
  "Số lượng phím": { en: "Number of keys", fr: "Nombre de touches", it: "Numero di tasti", nl: "Aantal toetsen", sv: "Antal tangenter", pt: "Número de teclas", es: "Número de teclas", de: "Anzahl der Tasten" },
  "Kích thước\/Layout": { en: "Size\/Layout", fr: "Taille\/Layout", it: "Dimensione\/Layout", nl: "Grootte\/Layout", sv: "Storlek\/Layout", pt: "Tamanho\/Layout", es: "Tamaño\/Layout", de: "Größe\/Layout" },
  "Kích thước màn hình": { en: "Screen size", fr: "Taille de l'écran", it: "Dimensione schermo", nl: "Schermgrootte", sv: "Skärmstorlek", pt: "Tamanho do ecrã", es: "Tamaño de pantalla", de: "Bildschirmgröße" },
  "Độ phân giải": { en: "Resolution", fr: "Résolution", it: "Risoluzione", nl: "Resolutie", sv: "Upplösning", pt: "Resolução", es: "Resolución", de: "Auflösung" },
  "Dung lượng RAM": { en: "RAM capacity", fr: "Capacité de RAM", it: "Capacità RAM", nl: "RAM-capaciteit", sv: "RAM-kapacitet", pt: "Capacidade de RAM", es: "Capacidad de RAM", de: "RAM-Kapazität" },
  "Dung lượng SSD": { en: "SSD capacity", fr: "Capacité de SSD", it: "Capacità SSD", nl: "SSD-capaciteit", sv: "SSD-kapacitet", pt: "Capacidade de SSD", es: "Capacidad de SSD", de: "SSD-Kapazität" },
  "Dòng CPU": { en: "CPU series", fr: "Série de CPU", it: "Serie CPU", nl: "CPU-serie", sv: "CPU-serie", pt: "Série de CPU", es: "Serie de CPU", de: "CPU-Serie" },
  "Dòng GPU": { en: "GPU series", fr: "Série de GPU", it: "Serie GPU", nl: "GPU-serie", sv: "GPU-serie", pt: "Série de GPU", es: "Serie de GPU", de: "GPU-Serie" },
  "Card đồ họa": { en: "Graphics card", fr: "Carte graphique", it: "Scheda grafica", nl: "Videokaart", sv: "Grafikkort", pt: "Placa gráfica", es: "Tarjeta gráfica", de: "Grafikkarte" },
  "Tấm nền": { en: "Panel", fr: "Dalle", it: "Pannello", nl: "Paneel", sv: "Panel", pt: "Painel", es: "Panel", de: "Panel" },
  "Chất liệu Keycap": { en: "Keycap material", fr: "Matériau des keycaps", it: "Materiale keycap", nl: "Keycap-materiaal", sv: "Keycap-material", pt: "Material dos keycaps", es: "Material de las teclas", de: "Keycap-Material" },
  "Chất liệu vỏ": { en: "Shell material", fr: "Matériau du châssis", it: "Materiale del guscio", nl: "Behuizingsmateriaal", sv: "Höljesmaterial", pt: "Material da carcaça", es: "Material del chasis", de: "Gehäusematerial" },
  "Đèn LED": { en: "LED", fr: "LED", it: "LED", nl: "LED", sv: "LED", pt: "LED", es: "LED", de: "LED" },
  "Cảm biến": { en: "Sensor", fr: "Capteur", it: "Sensore", nl: "Sensor", sv: "Sensor", pt: "Sensor", es: "Sensor", de: "Sensor" },
};

const VAL_TR = [
  [/(\d+)\s*phím/g, { en: "$1 keys", fr: "$1 touches", it: "$1 tasti", nl: "$1 toetsen", sv: "$1 tangenter", pt: "$1 teclas", es: "$1 teclas", de: "$1 Tasten" }],
  [/Không dây/g, { en: "Wireless", fr: "Sans fil", it: "Wireless", nl: "Draadloos", sv: "Trådlös", pt: "Sem fios", es: "Inalámbrico", de: "Kabellos" }],
  [/Có dây/g, { en: "Wired", fr: "Filaire", it: "Cablato", nl: "Bedraad", sv: "Trådbunden", pt: "Com fios", es: "Con cable", de: "Kabelgebunden" }],
  [/Không\b/g, { en: "No", fr: "Non", it: "No", nl: "Nee", sv: "Nej", pt: "Não", es: "No", de: "Nein" }],
  [/Nhựa/g, { en: "Plastic", fr: "Plastique", it: "Plastica", nl: "Kunststof", sv: "Plast", pt: "Plástico", es: "Plástico", de: "Kunststoff" }],
  [/Trắng/g, { en: "White", fr: "Blanc", it: "Bianco", nl: "Wit", sv: "Vit", pt: "Branco", es: "Blanco", de: "Weiß" }],
  [/Đen/g, { en: "Black", fr: "Noir", it: "Nero", nl: "Zwart", sv: "Svart", pt: "Preto", es: "Negro", de: "Schwarz" }],
  [/Hồng/g, { en: "Pink", fr: "Rose", it: "Rosa", nl: "Roze", sv: "Rosa", pt: "Rosa", es: "Rosa", de: "Rosa" }],
  [/Xám/g, { en: "Gray", fr: "Gris", it: "Grigio", nl: "Grijs", sv: "Grå", pt: "Cinza", es: "Gris", de: "Grau" }],
  [/Xanh dương/g, { en: "Blue", fr: "Bleu", it: "Blu", nl: "Blauw", sv: "Blå", pt: "Azul", es: "Azul", de: "Blau" }],
  [/nâu/gi, { en: "brown", fr: "brun", it: "marrone", nl: "bruin", sv: "brun", pt: "marrom", es: "marrón", de: "braun" }],
];

function trVal(v, lang) {
  let out = String(v);
  for (const [re, words] of VAL_TR) if (words[lang]) out = out.replace(re, words[lang]);
  return out;
}

const ACC_DESC = {
  en: (n, b) => `Discover the ${n}\n\nThe ${n} from ${b} combines practical usability with a distinct look, built around the specs listed in the technical table. Every part is selected for dependable performance through long work or play sessions.\n\nDesigned for comfort and consistency\n\nThe layout keeps long sessions comfortable while staying precise during fast-paced use. Compatibility spans the common systems and devices already on your desk.\n\nFlexible connectivity for every setup\n\nConnection options fit fixed desks or mobile workspaces with low latency and consistent response in both work and play.\n\nBuy the ${n} at GearVN\n\nGearVN offers genuine ${b} products with credible warranty support and fast nationwide delivery. Order the ${n} today to upgrade your setup with a reliable pick.`,
  fr: (n, b) => `Découvrez le ${n}\n\nLe ${n} de ${b} associe utilité quotidienne et style distinct, construit autour des specs du tableau technique. Chaque composant est choisi pour des performances fiables sur de longues sessions de travail ou de jeu.\n\nConçu pour le confort et la régularité\n\nLa disposition garde les longues sessions confortables tout en restant précise pour un usage rapide. La compatibilité couvre les systèmes et appareils déjà sur votre bureau.\n\nConnectivité flexible pour chaque configuration\n\nLes options de connexion conviennent aux bureaux fixes comme aux espaces mobiles, avec une latence faible et une réponse constante au travail comme en jeu.\n\nAchetez le ${n} chez GearVN\n\nGearVN propose des produits ${b} authentiques avec garantie crédible et livraison rapide dans tout le pays. Commandez dès aujourd'hui le ${n} pour améliorer votre installation avec un choix fiable.`,
  it: (n, b) => `Scopri il ${n}\n\nIl ${n} di ${b} unisce usabilità quotidiana e uno stile distinto, costruito attorno alle specifiche della tabella tecnica. Ogni componente è scelto per prestazioni affidabili nelle lunghe sessioni di lavoro o gioco.\n\nProgettato per comfort e costanza\n\nIl layout mantiene le sessioni lunghe comode, restando preciso nell'uso veloce. La compatibilità copre i sistemi e dispositivi già sulla tua scrivania.\n\nConnettività flessibile per ogni configurazione\n\nLe opzioni di connessione si adattano a scrivanie fisse o spazi mobili, con bassa latenza e risposta costante sia al lavoro che nel gioco.\n\nCompra il ${n} su GearVN\n\nGearVN offre prodotti ${b} originali con garanzia credibile e consegna rapida in tutto il paese. Ordina subito il ${n} per aggiornare la postazione con una scelta affidabile.`,
  nl: (n, b) => `Ontdek de ${n}\n\nDe ${n} van ${b} combineert dagelijks gebruik met een eigen look, gebouwd rond de specs in de techniek-tabel. Elk onderdeel is gekozen voor betrouwbaar gebruik tijdens lange sessies van werk of spel.\n\nOntworpen voor comfort en consistentie\n\nDe layout houdt lange sessies comfortabel terwijl deze nauwkeurig blijft bij snel gebruik. Compatibiliteit dekt de gangbare systemen en apparaten op je bureau.\n\nFlexibele connectiviteit voor elke setup\n\nVerbindingsopties passen bij vaste bureaus of mobiele werkplekken, met lage latentie en consistente respons in werk en spel.\n\nKoop de ${n} bij GearVN\n\nGearVN levert originele ${b}-producten met betrouwbare garantiesupport en snelle levering landelijk. Bestel de ${n} vandaag nog om je setup te upgraden met een betrouwbare keuze.`,
  pt: (n, b) => `Descubra o ${n}\n\nO ${n} da ${b} equilibra usabilidade diária com um visual distinto, construído com as especificações da tabela técnica. Cada componente é escolhido para desempenho confiável em longas sessões de trabalho ou jogo.\n\nPensado para conforto e consistência\n\nO layout mantém as sessões longas confortáveis mantendo precisão no uso rápido. A compatibilidade cobre os sistemas e dispositivos já na sua mesa.\n\nConectividade flexível para cada configuração\n\nAs opções de ligação servem mesas fixas ou espaços móveis, com baixa latência e resposta constante no trabalho e no jogo.\n\nCompre o ${n} na GearVN\n\nA GearVN oferece produtos ${b} originais com garantia credível e entrega rápida em todo o país. Encomende já o ${n} para atualizar o seu espaço com uma escolha fiável.`,
  es: (n, b) => `Descubre el ${n}\n\nEl ${n} de ${b} equilibra la utilidad diaria con un estilo distintivo, construido según las especificaciones de la tabla técnica. Cada componente se elige para un rendimiento fiable en sesiones largas de trabajo o juego.\n\nDiseñado para comodidad y consistencia\n\nLa disposición mantiene las sesiones largas cómodas mientras sigue siendo precisa en el uso rápido. La compatibilidad cubre los sistemas y dispositivos que ya tienes en el escritorio.\n\nConectividad flexible para cada configuración\n\nLas opciones de conexión encajan en escritorios fijos o espacios móviles, con baja latencia y respuesta constante en el trabajo y el juego.\n\nCompra el ${n} en GearVN\n\nGearVN ofrece productos ${b} originales con soporte de garantía creíble y entrega rápida en todo el país. Pide ya el ${n} para mejorar tu espacio con una elección fiable.`,
  de: (n, b) => `Entdecken Sie den ${n}\n\nDer ${n} von ${b} verbindet den Alltagseinsatz mit einem eigenen Look, aufgebaut auf den Specs der technischen Tabelle. Jede Komponente ist für zuverlässige Leistung bei langen Arbeits- oder Spielsessions gewählt.\n\nFür Komfort und Konstanz gebaut\n\nDas Layout hält lange Sessions bequem und bleibt bei schnellem Einsatz präzise. Die Kompatibilität deckt die gängigen Systeme und Geräte auf Ihrem Schreibtisch ab.\n\nFlexible Konnektivität für jedes Setup\n\nVerbindungsoptionen passen zu festen Schreibtischen oder mobilen Arbeitsplätzen — mit geringer Latenz und gleichmäßiger Reaktion in Arbeit und Spiel.\n\nKaufen Sie den ${n} bei GearVN\n\nGearVN bietet originale ${b}-Produkte mit verlässlicher Garantie und schnellem Lieferdienst. Bestellen Sie den ${n} noch heute, um Ihr Setup mit einer zuverlässigen Wahl aufzuwerten.`,
};

const LAPTOP_DESC = {
  fr: (n, b) => `Découvrez le ${n}\n\nLe ${n} équilibre performances, qualité d'affichage et mobilité pour le travail, les études et le divertissement. La configuration couvre le multitâche quotidien comme les tâches créatives plus lourdes, dans un châssis fait pour le transport quotidien.\n\nPlateforme et mémoire pour de vraies charges\n\nLa combinaison CPU/GPU délivre un traitement stable tandis que la RAM et le stockage gardent applications, fichiers et projets à portée de main sans nettoyage constant.\n\nÉcran et connectivité pour les longues sessions\n\nL'écran reste net et confortable sur de longues heures, et la sélection de ports couvre écrans externes, périphériques et réseau filaire au besoin.\n\nAchetez le ${n} chez GearVN\n\nGearVN propose des produits ${b} authentiques avec garantie crédible et livraison rapide dans tout le pays. Commandez dès aujourd'hui le ${n} pour équiper votre espace avec un portable fiable.`,
  it: (n, b) => `Scopri il ${n}\n\nIl ${n} bilancia prestazioni, qualità dello schermo e portabilità per lavoro, studio e intrattenimento. La configurazione copre il multitasking quotidiano e le attività creative più pesanti, in un chassis fatto per il trasporto quotidiano.\n\nPiattaforma e memoria per carichi reali\n\nLa combinazione CPU/GPU garantisce elaborazione stabile, mentre RAM e storage tengono app, file e progetti sempre a portata di mano.\n\nSchermo e connettività per sessioni lunghe\n\nLo schermo resta nitido e comodo per molte ore, e la selezione di porte copre monitor esterni, periferiche e rete cablata quando serve.\n\nCompra il ${n} su GearVN\n\nGearVN offre prodotti ${b} originali con garanzia credibile e consegna rapida in tutto il paese. Ordina subito il ${n} per aggiornare la postazione con un laptop affidabile.`,
  en: (n, b) => `Discover the ${n}\n\nThe ${n} balances performance, display quality and portability for work, study and entertainment. The configuration covers everyday multitasking as well as heavier creative tasks, wrapped in a chassis made for daily transport.\n\nPlatform and memory for real workloads\n\nThe CPU/GPU combination delivers stable processing while the RAM and storage keep apps, files and projects close at hand without constant cleanup.\n\nDisplay and connectivity for long sessions\n\nThe screen stays clear and comfortable over long hours, and the port selection covers external displays, peripherals and wired network when needed.\n\nBuy the ${n} at GearVN\n\nGearVN offers genuine ${b} products with credible warranty support and fast nationwide delivery. Order the ${n} today to upgrade your workspace with a reliable laptop.`,
  de: (n, b) => `Entdecken Sie den ${n}\n\nDer ${n} verbindet Leistung, Anzeigequalität und Mobilität für Arbeit, Studium und Unterhaltung. Die Konfiguration deckt tägliches Multitasking wie auch schwerere kreative Aufgaben ab — in einem Gehäuse für den täglichen Transport.\n\nPlattform und Speicher für echte Workloads\n\nDie CPU/GPU-Kombination liefert stabile Verarbeitung, während RAM und Speicher Apps, Dateien und Projekte griffbereit halten ohne ständiges Aufräumen.\n\nDisplay und Konnektivität für lange Sessions\n\nDas Display bleibt über lange Stunden klar und komfortabel, und die Anschlussauswahl deckt externe Monitore, Peripherie und kabelgebundenes Netz ab, wenn nötig.\n\nKaufen Sie den ${n} bei GearVN\n\nGearVN bietet originale ${b}-Produkte mit verlässlicher Garantie und schnellem Lieferdienst. Bestellen Sie den ${n} noch heute, um Ihren Arbeitsplatz mit einem zuverlässigen Laptop aufzuwerten.`,
  es: (n, b) => `Descubre el ${n}\n\nEl ${n} equilibra rendimiento, calidad de pantalla y portabilidad para trabajo, estudio y entretenimiento. La configuración cubre la multitarea diaria y las tareas creativas más pesadas, en un chasis hecho para el transporte diario.\n\nPlataforma y memoria para cargas reales\n\nLa combinación CPU/GPU ofrece procesamiento estable mientras la RAM y el almacenamiento mantienen aplicaciones, archivos y proyectos a mano sin limpiezas constantes.\n\nPantalla y conectividad para sesiones largas\n\nLa pantalla se mantiene nítida y cómoda durante muchas horas, y la selección de puertos cubre monitores externos, periféricos y red por cable cuando hace falta.\n\nCompra el ${n} en GearVN\n\nGearVN ofrece productos ${b} originales con soporte de garantía creíble y entrega rápida en todo el país. Pide ya el ${n} para mejorar tu espacio con un portátil fiable.`,
  nl: (n, b) => `Ontdek de ${n}\n\nDe ${n} balanceert prestaties, displaykwaliteit en draagbaarheid voor werk, studie en entertainment. De configuratie dekt dagelijks multitasken en zwaardere creatieve taken, in een behuizing gemaakt voor dagelijks vervoer.\n\nPlatform en geheugen voor echte werklasten\n\nDe CPU/GPU-combinatie levert stabiele verwerking terwijl RAM en opslag apps, bestanden en projecten dichtbij houden zonder constante opruiming.\n\nDisplay en connectiviteit voor lange sessies\n\nHet scherm blijft helder en comfortabel over lange uren, en de poortselectie dekt externe schermen, randapparatuur en bekabeld netwerk wanneer nodig.\n\nKoop de ${n} bij GearVN\n\nGearVN levert originele ${b}-producten met betrouwbare garantiesupport en snelle levering landelijk. Bestel de ${n} vandaag nog om je werkplek te upgraden met een betrouwbare laptop.`,
  sv: (n, b) => `Upptäck ${n}\n\n${n} balanserar prestanda, skärmkvalitet och portabilitet för arbete, studier och underhållning. Konfigurationen täcker dagligt multitasking och tyngre kreativa uppgifter, i ett chassi gjort för daglig transport.\n\nPlattform och minne för riktiga arbetslaster\n\nCPU/GPU-kombinationen levererar stabil bearbetning medan RAM och lagring håller appar, filer och projekt nära till hands utan konstant städning.\n\nSkärm och anslutning för långa sessioner\n\nSkärmen förblir klar och bekväm under många timmar, och portvalet täcker externa skärmar, kringutrustning och trådbundet nätverk vid behov.\n\nKöp ${n} hos GearVN\n\nGearVN erbjuder originalprodukter från ${b} med pålitlig garantistöd och snabb leverans i hela landet. Beställ ${n} idag för att uppgradera din arbetsplats med en pålitlig laptop.`,
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
    if (t && t.name && t.description && !t.description.startsWith("TBD")) continue;
    const trName = translateName(name, lang);
    let tech = "";
    if (techMatch) {
      const pairs = [...techMatch[1].matchAll(/"([^"]+)":\s*"([^"]*)"/g)];
      tech =
        `${HEAD[lang]}: {` +
        pairs.map(([, k, v]) => `"${KEY_TR[k] ? KEY_TR[k][lang] : k}": "${trVal(v, lang)}"`).join(", ") +
        "}";
    }
    hand[pid][lang] = {
      name: trName,
      description: isLaptop ? LAPTOP_DESC[lang](trName, brand) : ACC_DESC[lang](trName, brand),
      brand,
      specs: Object.fromEntries(specEntries.map(([k, v]) => [k, trVal(v, lang)])),
      technicalDescription: tech,
      imageAlts: alts.map((a) => trVal(a, lang)),
    };
    count++;
  }
}
console.log("regenerated:", count);
fs.writeFileSync(HAND_ACC, JSON.stringify(hand, null, 2) + "\n", "utf8");
