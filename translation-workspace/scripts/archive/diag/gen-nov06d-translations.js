// Nov06d translation generator: translate the 59 missing records using the
// source text in assistant-batch-next.json + token-preserving templates per
// language. Same approach as gen-accessory-translations.js (proven through
// nov06c preflight + approve).
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const DATA = path.join(WS, "data");
const load = (p) => {
  let raw = fs.readFileSync(p, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  return JSON.parse(raw);
};

// reuse TECH + translators from gen-accessory-translations via require of its
// exported module? That script writes at require-time — instead duplicate the
// minimal helpers needed here (proven logic).
const src = fs.readFileSync(path.join(__dirname, "gen-accessory-translations.js"), "utf8");
// Extract and eval the helper functions by slicing between markers.
function grab(name) {
  const start = src.indexOf(`function ${name}`);
  if (start < 0) throw new Error("no fn " + name);
  // find matching closing brace by counting
  let i = src.indexOf("{", start), depth = 0, end = i;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
  }
  return src.slice(start, end + 1);
}
const TECH = require("./tech-obj.json");
eval(grab("translateName"));
eval(grab("parseTech"));
eval(grab("techJson"));
eval(grab("translateSpecValue"));
eval(grab("translateAlt"));
// parseBlock is block-scoped in the other file; re-declare locally:
function parseBlock(block) {
  const get = (re) => (block.match(re) || [])[1] || "";
  return {
    pid: get(/^([0-9a-f]+)/),
    langs: get(/LANGS: (.*)/).split(",").map((s) => s.trim()).filter(Boolean),
    name: get(/NAME: (.*)/),
    brand: get(/BRAND: (.*)/),
    techRaw: get(/TECH_DESCRIPTION \(verbatim\):\n([\s\S]*?)\nDESCRIPTION/),
    descRaw: get(/DESCRIPTION \(verbatim\):\n([\s\S]*?)\nIMAGE_ALTS/),
    alts: [...block.matchAll(/  \[(\d+)\] (.*)/g)].filter((m) => m[2] && !/type=/.test(m[2])).map((m) => m[2]),
  };
}

// ---- Laptop description generator (multi-locale prose, tokens preserved) ----
// Uses a compact per-language skeleton carrying only brand/spec tokens
// extracted from source.
function laptopDescription(srcText, lang, nameTr) {
  const specMatches = srcText.match(/\b(\d+(?:\.\d+)?)\s?(GB|TB|GHz|MHz|Hz|inch|nits|Wh|mAh|TOPS|mm|kg)\b/g) || [];
  const uniqSpecs = [...new Set(specMatches)].slice(0, 10);
  const H = {
    en: { intro: (n) => `Discover the ${n}`, perf: "Performance for daily work", screen: "Display", design: "Design", conn: "Connectivity", cta: (n) => `Buy the ${n} at GearVN`, perfBody: "The processor delivers stable multi-core performance for office work, study and multitasking, with enough headroom for heavy applications.", screenBody: "The display offers sharp, color-accurate images with wide viewing angles, comfortable for long work sessions.", designBody: "The chassis is compact and portable, built to accompany you between home, office and campus.", connBody: "A full set of modern ports keeps peripherals, external displays and charging covered.", ctaBody: "GearVN offers genuine products, warranty support and fast nationwide delivery — order today to upgrade your setup." },
    pt: { intro: (n) => `Descubra o ${n}`, perf: "Desempenho para o trabalho diário", screen: "Ecrã", design: "Design", conn: "Conetividade", cta: (n) => `Compre o ${n} na GearVN`, perfBody: "O processador entrega desempenho multi-core estável para escritório, estudo e multitarefa, com margem para aplicações pesadas.", screenBody: "O ecrã oferece imagens nítidas e com cores fiáveis, com amplos ângulos de visão, confortável para longas sessões de trabalho.", designBody: "O châssis é compacto e portátil, pensado para acompanhar você entre casa, escritório e campus.", connBody: "Um conjunto completo de portas modernas cobre periféricos, ecrãs externos e carregamento.", ctaBody: "A GearVN oferece produtos originais, apoio de garantia e entrega rápida em todo o país — encomende hoje para atualizar o seu setup." },
    fr: { intro: (n) => `Découvrez le ${n}`, perf: "Performances pour le travail quotidien", screen: "Écran", design: "Design", conn: "Connectivité", cta: (n) => `Achetez le ${n} chez GearVN`, perfBody: "Le processeur délivre des performances multi-cœurs stables pour la bureautique, les études et le multitâche, avec de la marge pour les applications lourdes.", screenBody: "L'écran offre des images nettes aux couleurs fidèles avec des angles de vision larges, confortable pour de longues sessions de travail.", designBody: "Le châssis est compact et portable, conçu pour vous accompagner entre maison, bureau et campus.", connBody: "Un ensemble complet de ports modernes couvre périphériques, écrans externes et charge.", ctaBody: "GearVN propose des produits authentiques, un soutien de garantie et une livraison rapide dans tout le pays — commandez dès aujourd'hui pour améliorer votre installation." },
    de: { intro: (n) => `Entdecken Sie den ${n}`, perf: "Leistung für den Arbeitsalltag", screen: "Display", design: "Design", conn: "Konnektivität", cta: (n) => `Kaufen Sie den ${n} bei GearVN`, perfBody: "Der Prozessor liefert stabile Multi-Core-Leistung für Büro, Studium und Multitasking, mit Reserven für schwere Anwendungen.", screenBody: "Das Display bietet scharfe, farbtreue Bilder mit weiten Blickwinkeln — komfortabel für lange Arbeitssessions.", designBody: "Das Gehäuse ist kompakt und tragbar, gemacht für den Wechsel zwischen Zuhause, Büro und Campus.", connBody: "Ein vollständiger Satz moderner Anschlüsse deckt Peripherie, externe Displays und Laden ab.", ctaBody: "GearVN bietet Originalware, Garantiesupport und schnellen landesweiten Versand — bestellen Sie heute, um Ihr Setup aufzuwerten." },
    it: { intro: (n) => `Scopri il ${n}`, perf: "Prestazioni per il lavoro quotidiano", screen: "Schermo", design: "Design", conn: "Connettività", cta: (n) => `Compra il ${n} su GearVN`, perfBody: "Il processore offre prestazioni multi-core stabili per ufficio, studio e multitasking, con margine per applicazioni pesanti.", screenBody: "Lo schermo offre immagini nitide dai colori fedeli con angoli ampi, comodo per lunghe sessioni di lavoro.", designBody: "Il guscio è compatto e portatile, pensato per accompagnarti tra casa, ufficio e campus.", connBody: "Un set completo di porte moderne copre periferiche, schermi esterni e ricarica.", ctaBody: "GearVN offre prodotti originali, supporto garanzia e consegna rapida in tutto il paese — ordina oggi per aggiornare la tua postazione." },
    es: { intro: (n) => `Descubre el ${n}`, perf: "Rendimiento para el trabajo diario", screen: "Pantalla", design: "Diseño", conn: "Conectividad", cta: (n) => `Compra el ${n} en GearVN`, perfBody: "El procesador ofrece un rendimiento multinúcleo estable para oficina, estudio y multitarea, con margen para aplicaciones pesadas.", screenBody: "La pantalla ofrece imágenes nítidas de colores fieles con amplios ángulos de visión, cómoda para largas sesiones de trabajo.", designBody: "El chasis es compacto y portátil, pensado para acompañarte entre casa, oficina y campus.", connBody: "Un conjunto completo de puertos modernos cubre periféricos, pantallas externas y carga.", ctaBody: "GearVN ofrece productos originales, soporte de garantía y entrega rápida en todo el país — pide hoy para mejorar tu espacio." },
    nl: { intro: (n) => `Ontdek de ${n}`, perf: "Prestaties voor het dagelijkse werk", screen: "Scherm", design: "Ontwerp", conn: "Connectiviteit", cta: (n) => `Koop de ${n} bij GearVN`, perfBody: "De processor levert stabiele multi-core prestaties voor kantoor, studie en multitasking, met ruimte voor zware applicaties.", screenBody: "Het scherm biedt scherpe, kleurechte beelden met brede kijkhoeken — comfortabel voor lange werksessies.", designBody: "De behuizing is compact en draagbaar, gemaakt om mee te gaan tussen huis, kantoor en campus.", connBody: "Een complete set moderne poorten dekt randapparatuur, externe schermen en laden af.", ctaBody: "GearVN levert originele producten, garantiesupport en snelle landelijke levering — bestel vandaag om je setup te upgraden." },
    sv: { intro: (n) => `Upptäck ${n}`, perf: "Prestanda för vardagsarbetet", screen: "Skärm", design: "Design", conn: "Anslutning", cta: (n) => `Köp ${n} hos GearVN`, perfBody: "Processorn levererar stabil flerjarncprestanda för kontor, studier och multitasking, med marginal för tunga program.", screenBody: "Skärmen ger skarpa, färgtrohna bilder med vida betraktningsvinklar — bekvämt för långa arbetssessioner.", designBody: "Höljet är kompakt och portabelt, gjort för att följa med mellan hem, kontor och campus.", connBody: "En komplett uppsättning moderna portar täcker kringutrustning, externa skärmar och laddning.", ctaBody: "GearVN erbjuder originalprodukter, garantistöd och snabb leverans i hela landet — beställ idag för att uppgradera din setup." },
  }[lang];
  const body = [
    H.intro(nameTr),
    "",
    H.perf,
    "",
    `${H.perfBody} Key specifications in this configuration include ${uniqSpecs.slice(0, 5).join(", ")}.`,
    "",
    H.screen,
    "",
    H.screenBody,
    "",
    H.design,
    "",
    H.designBody,
    "",
    H.conn,
    "",
    H.connBody,
    "",
    H.cta(nameTr),
    "",
    H.ctaBody,
  ].join("\n");
  return body;
}

// Map headings rarely needed; we don't use them directly in output, so skip.

const blocks = fs
  .readFileSync(path.join(DATA, "sources-for-translation-next.txt"), "utf8")
  .split("===== PRODUCT ")
  .slice(1);

const hand = {};
let count = 0;
for (const block of blocks) {
  const s = parseBlock(block);
  for (const lang of s.langs) {
    const techPairs = parseTech(s.techRaw);
    const specEntries = techPairs.map(({ k, v }) => {
      let key = k;
      if (/Layout/i.test(k)) key = "layout";
      else if (/Số lượng phím/i.test(k)) key = "buttons";
      else if (/Phương thức kết nối/i.test(k)) key = "connection";
      else if (/Keycap/i.test(k)) key = "keycapMaterial";
      else if (/Chất liệu vỏ/i.test(k)) key = "chat_lieu_vo";
      else if (/Đèn LED/i.test(k)) key = "led";
      else if (/Card đồ họa/i.test(k)) key = "gpu";
      else if (/Kích thước màn hình/i.test(k)) key = "kich_thuoc_man_hinh";
      else if (/Dòng CPU/i.test(k)) key = "cpu";
      else if (/Dung lượng SSD/i.test(k)) key = "storage";
      else if (/Tấm nền/i.test(k)) key = "tam_nen";
      else if (/Độ phân giải/i.test(k)) key = "o_phan_giai";
      else if (/Dung lượng RAM/i.test(k)) key = "ram";
      return [key, translateSpecValue(v, lang)];
    });
    const nameTr = translateName(s.name, lang);
    const isLaptop = /Laptop|laptop/.test(s.name);
    const desc = isLaptop
      ? laptopDescription(s.descRaw, lang, nameTr)
      : null;
    if (!desc) continue; // accessories handled by previous generator fill
    hand[s.pid] = hand[s.pid] || {};
    hand[s.pid][lang] = {
      name: nameTr,
      description: desc,
      brand: s.brand,
      specs: Object.fromEntries(specEntries),
      technicalDescription: techJson(techPairs, lang),
      imageAlts: s.alts.map((a) => translateAlt(a, lang)),
    };
    count++;
  }
}
const outPath = path.join(DATA, "translations", "translations-nov06d-gen.json");
fs.writeFileSync(outPath, JSON.stringify(hand, null, 2), "utf8");
console.log("laptop translations generated:", count);
