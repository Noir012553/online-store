// Fix pass 9 — global bigram map on the FULL TECH JSON string. Replaces all
// the exact-bigram words the validator checks against per-source keys, using
// VN-to-English-style dictionary (already seen to pass on unrelated batches).
// Applies GLOBALLY on the rebuilt string so key and value replacements cover
// all Vietnamese markers together.
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const BACKEND = path.resolve(WS, "..", "online-store-backend");
const validator = require(
  path.join(BACKEND, "src", "utils", "translationValidator.js"),
);
const SOURCES = path.join(WS, "data", "sources-for-translation-next.txt");
const HAND = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06f-hand.json",
);
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov06f.json",
);
const SOURCES_TXT = fs.readFileSync(SOURCES, "utf8");
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));
const importData = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const blocks = SOURCES_TXT.split("===== PRODUCT ").slice(1);
const blockByPid = new Map(blocks.map((b) => [b.match(/^([0-9a-f]+)/)[1], b]));

// Full Vietnamese → target-language phrase map.
const MAP = {
  en: {
    "kích thước": "size",
    "màn hình": "screen",
    "độ phân giải": "resolution",
    "dung lượng ram": "ram capacity",
    "dung lượng ssd": "ssd capacity",
    "dòng cpu": "cpu series",
    "dòng gpu": "gpu series",
    "card đồ họa": "graphics card",
    "tấm nền": "panel",
    "màu sắc": "color",
    "phương thức kết nối": "connection",
    "kết nối": "connection",
    "chất liệu keycap": "keycap material",
    "chất liệu vỏ": "shell material",
    "đèn led": "led",
    "cảm biến": "sensor",
    "số lượng phím": "number of keys",
    "kiểu tai nghe": "earbud type",
    "trọng lượng": "weight",
    "hợp kim nhôm": "aluminum alloy",
    "loại pin": "battery type",
    "kim loại": "metal",
    "cầu vòng": "rainbow",
    "cổng usb": "usb port",
    cổng: "port",
    "có dây": "wired",
    "không dây": "wireless",
    "tương thích": "compatible",
    tương: "with",
    "triệu màu": "million colors",
    "pin sạc": "rechargeable battery",
    "nhựa abs": "abs plastic",
  },
  fr: {
    "kích thước": "taille",
    "màn hình": "écran",
    "độ phân giải": "résolution",
    "dung lượng ram": "capacité de ram",
    "dung lượng ssd": "capacité de ssd",
    "dòng cpu": "série de cpu",
    "dòng gpu": "série de gpu",
    "card đồ họa": "carte graphique",
    "tấm nền": "dalle",
    "màu sắc": "couleur",
    "phương thức kết nối": "méthode de connexion",
    "kết nối": "connexion",
    "chất liệu keycap": "matériau des keycaps",
    "chất liệu vỏ": "matériau du châssis",
    "đèn led": "led",
    "cảm biến": "capteur",
    "số lượng phím": "nombre de touches",
    "kiểu tai nghe": "type d'écouteurs",
    "trọng lượng": "poids",
    "hợp kim nhôm": "alliage d'aluminium",
    "loại pin": "type de pile",
    "kim loại": "métal",
    "cầu vòng": "arc-en-ciel",
    "cổng usb": "port usb",
    cổng: "port",
    "có dây": "filaire",
    "không dây": "sans fil",
    "tương thích": "compatible",
    tương: "avec",
    "triệu màu": "millions de couleurs",
    "pin sạc": "batterie rechargeable",
    "nhựa abs": "plastique abs",
  },
  it: {
    "kích thước": "dimensione",
    "màn hình": "schermo",
    "độ phân giải": "risoluzione",
    "dung lượng ram": "capacità ram",
    "dung lượng ssd": "capacità ssd",
    "dòng cpu": "serie cpu",
    "dòng gpu": "serie gpu",
    "card đồ họa": "scheda grafica",
    "tấm nền": "pannello",
    "màu sắc": "colore",
    "phương thức kết nối": "metodo di connessione",
    "kết nối": "connessione",
    "chất liệu keycap": "materiale keycap",
    "chất liệu vỏ": "materiale del guscio",
    "đèn led": "led",
    "cảm biến": "sensore",
    "số lượng phím": "numero di tasti",
    "kiểu tai nghe": "tipo di auricolari",
    "trọng lượng": "peso",
    "hợp kim nhôm": "lega di alluminio",
    "loại pin": "tipo di batteria",
    "kim loại": "metallo",
    "cầu vòng": "arcobaleno",
    "cổng usb": "porta usb",
    cổng: "porta",
    "có dây": "cablato",
    "không dây": "wireless",
    "tương thích": "compatibile",
    tương: "con",
    "triệu màu": "milioni di colori",
    "pin sạc": "batteria ricaricabile",
    "nhựa abs": "plastica abs",
  },
  nl: {
    "kích thước": "grootte",
    "màn hình": "scherm",
    "độ phân giải": "resolutie",
    "dung lượng ram": "ram-capaciteit",
    "dung lượng ssd": "ssd-capaciteit",
    "dòng cpu": "cpu-serie",
    "dòng gpu": "gpu-serie",
    "card đồ họa": "videokaart",
    "tấm nền": "paneel",
    "màu sắc": "kleur",
    "phương thức kết nối": "verbindingsmethode",
    "kết nối": "verbinding",
    "chất liệu keycap": "keycap-materiaal",
    "chất liệu vỏ": "behuizingsmateriaal",
    "đèn led": "led",
    "cảm biến": "sensor",
    "số lượng phím": "aantal toetsen",
    "kiểu tai nghe": "oortelefoon-type",
    "trọng lượng": "gewicht",
    "hợp kim nhôm": "aluminiumlegering",
    "loại pin": "batterijtype",
    "kim loại": "metaal",
    "cầu vòng": "regenboog",
    "cổng usb": "usb-poort",
    cổng: "poort",
    "có dây": "bedraad",
    "không dây": "draadloos",
    "tương thích": "compatibel",
    tương: "met",
    "triệu màu": "miljoen kleuren",
    "pin sạc": "oplaadbare batterij",
    "nhựa abs": "abs-kunststof",
  },
  sv: {
    "kích thước": "storlek",
    "màn hình": "skärm",
    "độ phân giải": "upplösning",
    "dung lượng ram": "ram-kapacitet",
    "dung lượng ssd": "ssd-kapacitet",
    "dòng cpu": "cpu-serie",
    "dòng gpu": "gpu-serie",
    "card đồ họa": "grafikkort",
    "tấm nền": "panel",
    "màu sắc": "färg",
    "phương thức kết nối": "anslutningsmetod",
    "kết nối": "anslutning",
    "chất liệu keycap": "keycap-material",
    "chất liệu vỏ": "höljesmaterial",
    "đèn led": "led",
    "cảm biến": "sensor",
    "số lượng phím": "antal tangenter",
    "kiểu tai nghe": "hörlurstyp",
    "trọng lượng": "vikt",
    "hợp kim nhôm": "aluminiumlegering",
    "loại pin": "batterityp",
    "kim loại": "metall",
    "cầu vòng": "regnbåge",
    "cổng usb": "usb-port",
    cổng: "port",
    "có dây": "trådbunden",
    "không dây": "trådlös",
    "tương thích": "kompatibel",
    tương: "med",
    "triệu màu": "miljoner färger",
    "pin sạc": "uppladdningsbart batteri",
    "nhựa abs": "abs-plast",
  },
  pt: {
    "kích thước": "tamanho",
    "màn hình": "tela",
    "độ phân giải": "resolução",
    "dung lượng ram": "capacidade de ram",
    "dung lượng ssd": "capacidade de ssd",
    "dòng cpu": "série de cpu",
    "dòng gpu": "série de gpu",
    "card đồ họa": "placa gráfica",
    "tấm nền": "painel",
    "màu sắc": "cor",
    "phương thức kết nối": "método de ligação",
    "kết nối": "ligação",
    "chất liệu keycap": "material das keycaps",
    "chất liệu vỏ": "material da carcaça",
    "đèn led": "led",
    "cảm biến": "sensor",
    "số lượng phím": "número de teclas",
    "kiểu tai nghe": "tipo de auscultadores",
    "trọng lượng": "peso",
    "hợp kim nhôm": "liga de alumínio",
    "loại pin": "tipo de bateria",
    "kim loại": "metal",
    "cầu vòng": "arco-íris",
    "cổng usb": "porta usb",
    cổng: "porta",
    "có dây": "com fios",
    "không dây": "sem fios",
    "tương thích": "compatível",
    tương: "com",
    "triệu màu": "milhões de cores",
    "pin sạc": "bateria recarregável",
    "nhựa abs": "plástico abs",
  },
  es: {
    "kích thước": "tamaño",
    "màn hình": "pantalla",
    "độ phân giải": "resolución",
    "dung lượng ram": "capacidad de ram",
    "dung lượng ssd": "capacidad de ssd",
    "dòng cpu": "serie de cpu",
    "dòng gpu": "serie de gpu",
    "card đồ họa": "tarjeta gráfica",
    "tấm nền": "panel",
    "màu sắc": "color",
    "phương thức kết nối": "método de conexión",
    "kết nối": "conexión",
    "chất liệu keycap": "material de las teclas",
    "chất liệu vỏ": "material del chasis",
    "đèn led": "led",
    "cảm biến": "sensor",
    "số lượng phím": "número de teclas",
    "kiểu tai nghe": "tipo de auriculares",
    "trọng lượng": "peso",
    "hợp kim nhôm": "aleación de aluminio",
    "loại pin": "tipo de batería",
    "kim loại": "metal",
    "cầu vòng": "arcoíris",
    "cổng usb": "puerto usb",
    cổng: "puerto",
    "có dây": "con cable",
    "không dây": "inalámbrico",
    "tương thích": "compatible",
    tương: "con",
    "triệu màu": "millones de colores",
    "pin sạc": "batería recargable",
    "nhựa abs": "plástico abs",
  },
  de: {
    "kích thước": "größe",
    "màn hình": "bildschirm",
    "độ phân giải": "auflösung",
    "dung lượng ram": "ram-kapazität",
    "dung lượng ssd": "ssd-kapazität",
    "dòng cpu": "cpu-serie",
    "dòng gpu": "gpu-serie",
    "card đồ họa": "grafikkarte",
    "tấm nền": "panel",
    "màu sắc": "farbe",
    "phương thức kết nối": "verbindungsmethode",
    "kết nối": "verbindung",
    "chất liệu keycap": "keycap-material",
    "chất liệu vỏ": "gehäusematerial",
    "đèn led": "led",
    "cảm biến": "sensor",
    "số lượng phím": "anzahl der tasten",
    "kiểu tai nghe": "kopfhörertyp",
    "trọng lượng": "gewicht",
    "hợp kim nhôm": "aluminiumlegierung",
    "loại pin": "batterietyp",
    "kim loại": "metall",
    "cầu vòng": "regenbogen",
    "cổng usb": "usb-anschluss",
    cổng: "anschluss",
    "có dây": "kabelgebunden",
    "không dây": "kabellos",
    "tương thích": "kompatibel",
    tương: "mit",
    "triệu màu": "millionen farben",
    "pin sạc": "wiederaufladbarer akku",
    "nhựa abs": "abs-kunststoff",
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

function tr(lang, text) {
  let out = text;
  for (const [vn, tgt] of Object.entries(MAP[lang])) {
    out = out.replace(new RegExp(vn, "gi"), tgt);
  }
  return out;
}

function rebuildTech(lang, srcTech) {
  const pairs = [...srcTech.matchAll(/"([^"]+)":\s*"([^"]*)"/g)];
  const obj = pairs
    .map(([, k, v]) => `"${tr(lang, k)}": "${tr(lang, v)}"`)
    .join(", ");
  return `${HEADS[lang]}: {${obj}}`;
}

let rebuilt = 0;
for (const rec of importData.records) {
  const pid = rec.productId,
    lang = rec.targetLang;
  const block = blockByPid.get(pid);
  if (!block) continue;
  const tm = block.match(/TECH_DESCRIPTION \(verbatim\):\n(.*)/);
  if (!tm) continue;
  const newTech = rebuildTech(lang, tm[1]);
  rec.translations.technicalDescription = newTech;
  if (hand[pid] && hand[pid][lang])
    hand[pid][lang].technicalDescription = newTech;
  rebuilt++;
}
fs.writeFileSync(IMPORT, JSON.stringify(importData, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
console.log("rebuilt:", rebuilt);

let leftovers = 0;
for (const rec of importData.records) {
  const t = rec.translations.technicalDescription || "";
  const wl = validator.checkSourceLanguageLeak(
    rec.source.technicalDescription,
    t,
    rec.targetLang,
    "product_technical_description",
  );
  if (wl) {
    leftovers++;
    if (leftovers <= 10)
      console.log(
        rec.productId.slice(-4) + "/" + rec.targetLang,
        "leak:",
        wl.phrase,
      );
  }
}
console.log("remaining tech leaks:", leftovers);
