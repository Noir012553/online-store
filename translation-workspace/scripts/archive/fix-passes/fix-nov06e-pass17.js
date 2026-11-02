// Fix pass 17 for the 20 pending records (all laptops):
//  1. Double space in names + descriptions from "PC portable  Lenovo..." —
//     normalize and prefix correctly per language ("Bärbar dator" is sv —
//     but desc was EN template: fix desc per lang properly).
//  2. Inject brand sentence (Lenovo/MSI) after intro para per record.
//  3. c8c8/de + c8c8/it: descriptions are in WRONG language (English) —
//     rewrite properly.
//  4. c8f0/c8f8 source_content_changed → these were stale hash: re-export and
//     patch the hash from fresh DB snapshot.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const HAND = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06e-hand.json",
);
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov06e.json",
);
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));
const importData = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const idByTail = {};
for (const pid of Object.keys(hand)) idByTail[pid.slice(-4)] = pid;

const PREFIX = {
  fr: "PC portable ",
  it: "PC portatile ",
  es: "Portátil ",
  de: "Laptop ",
  en: "Laptop ",
  nl: "Laptop ",
  sv: "Bärbar dator ",
  pt: "Portátil ",
};
const DESC = {
  fr: (n, b) =>
    `Découvrez le ${n}\n\nLe ${n} de ${b} équilibre performances, qualité d'affichage et mobilité pour le travail, les études et le divertissement. La configuration couvre le multitâche quotidien comme les tâches créatives plus lourdes, dans un châssis fait pour le transport quotidien.\n\nPlateforme et mémoire pour de vraies charges\n\nLa combinaison CPU/GPU délivre un traitement stable tandis que la RAM et le stockage gardent applications, fichiers et projets à portée de main sans nettoyage constant.\n\nÉcran et connectivité pour les longues sessions\n\nL'écran reste net et confortable sur de longues heures, et la sélection de ports couvre écrans externes, périphériques et réseau filaire au besoin.\n\nAchetez le ${n} chez GearVN\n\nGearVN propose des produits ${b} authentiques avec garantie crédible et livraison rapide dans tout le pays. Commandez dès aujourd'hui le ${n} pour équiper votre espace avec un portable fiable.`,
  es: (n, b) =>
    `Descubre el ${n}\n\nEl ${n} de ${b} equilibra rendimiento, calidad de pantalla y portabilidad para trabajo, estudio y entretenimiento. La configuración cubre la multitarea diaria y las tareas creativas más pesadas, en un chasis hecho para el transporte diario.\n\nPlataforma y memoria para cargas reales\n\nLa combinación CPU/GPU ofrece procesamiento estable mientras la RAM y el almacenamiento mantienen aplicaciones, archivos y proyectos a mano sin limpiezas constantes.\n\nPantalla y conectividad para sesiones largas\n\nLa pantalla se mantiene nítida y cómoda durante muchas horas, y la selección de puertos cubre monitores externos, periféricos y red por cable cuando hace falta.\n\nCompra el ${n} en GearVN\n\nGearVN ofrece productos ${b} originales con soporte de garantía creíble y entrega rápida en todo el país. Pide ya el ${n} para mejorar tu espacio con un portátil fiable.`,
  sv: (n, b) =>
    `Upptäck ${n}\n\n${n} från ${b} balanserar prestanda, skärmkvalitet och portabilitet för arbete, studier och underhållning. Konfigurationen täcker dagligt multitasking och tyngre kreativa uppgifter, i ett chassi gjort för daglig transport.\n\nPlattform och minne för riktiga arbetslaster\n\nCPU/GPU-kombinationen levererar stabil bearbetning medan RAM och lagring håller appar, filer och projekt nära till hands utan konstant städning.\n\nSkärm och anslutning för långa sessioner\n\nSkärmen förblir klar och bekväm under många timmar, och portvalet täcker externa skärmar, kringutrustning och trådbundet nätverk vid behov.\n\nKöp ${n} hos GearVN\n\nGearVN erbjuder originalprodukter från ${b} med pålitlig garantistöd och snabb leverans i hela landet. Beställ ${n} idag för att uppgradera din arbetsplats med en pålitlig laptop.`,
  de: (n, b) =>
    `Entdecken Sie den ${n}\n\nDer ${n} von ${b} verbindet Leistung, Anzeigequalität und Mobilität für Arbeit, Studium und Unterhaltung. Die Konfiguration deckt tägliches Multitasking wie auch schwerere kreative Aufgaben ab — in einem Gehäuse für den täglichen Transport.\n\nPlattform und Speicher für echte Workloads\n\nDie CPU/GPU-Kombination liefert stabile Verarbeitung, während RAM und Speicher Apps, Dateien und Projekte griffbereit halten ohne ständiges Aufräumen.\n\nDisplay und Konnektivität für lange Sessions\n\nDas Display bleibt über lange Stunden klar und komfortabel, und die Anschlussauswahl deckt externe Monitore, Peripherie und kabelgebundenes Netz ab, wenn nötig.\n\nKaufen Sie den ${n} bei GearVN\n\nGearVN bietet originale ${b}-Produkte mit verlässlicher Garantie und schnellem Lieferdienst. Bestellen Sie den ${n} noch heute, um Ihren Arbeitsplatz mit einem zuverlässigen Laptop aufzuwerten.`,
  it: (n, b) =>
    `Scopri il ${n}\n\nIl ${n} di ${b} bilancia prestazioni, qualità dello schermo e portabilità per lavoro, studio e intrattenimento. La configurazione copre il multitasking quotidiano e le attività creative più pesanti, in un chassis fatto per il trasporto quotidiano.\n\nPiattaforma e memoria per carichi reali\n\nLa combinazione CPU/GPU garantisce elaborazione stabile, mentre RAM e storage tengono app, file e progetti sempre a portata di mano.\n\nSchermo e connettività per sessioni lunghe\n\nLo schermo resta nitido e comodo per molte ore, e la selezione di porte copre monitor esterni, periferiche e rete cablata quando serve.\n\nCompra il ${n} su GearVN\n\nGearVN offre prodotti ${b} originali con garanzia credibile e consegna rapida in tutto il paese. Ordina subito il ${n} per aggiornare la postazione con un laptop affidabile.`,
};

// Target records needing rewrite (all with double-space names)
const TARGETS = ["c7fb", "c803", "c8c4", "c8c5", "c8c8"];
for (const tail of TARGETS) {
  const pid = idByTail[tail];
  for (const [lang, t] of Object.entries(hand[pid])) {
    // normalize double spaces
    t.name = (t.name || "").replace(/\s{2,}/g, " ");
    t.description = (t.description || "").replace(/\s{2,}/g, " ");
    // Fix descriptions in wrong language (sv desc was English, de/it desc English)
    if (lang === "sv" && !/^Upptäck/.test(t.description)) {
      const brand = /Lenovo/.test(t.name) ? "Lenovo" : "MSI";
      const stripped = t.name.replace(
        /^(Bärbar dator |PC portable |Portátil |Laptop |PC portatile )/,
        "",
      );
      const name = `Bärbar dator ${stripped}`;
      t.description = DESC.sv(name, brand);
    }
    if (lang === "de" && !/^Entdecken Sie/.test(t.description)) {
      const brand = /Lenovo/.test(t.name) ? "Lenovo" : "MSI";
      const stripped = t.name.replace(
        /^(Bärbar dator |PC portable |Portátil |Laptop |PC portatile )/,
        "",
      );
      const name = `Laptop ${stripped}`;
      t.description = DESC.de(name, brand);
    }
    if (lang === "it" && !/^Scopri il/.test(t.description)) {
      const brand = /Lenovo/.test(t.name) ? "Lenovo" : "MSI";
      const stripped = t.name.replace(
        /^(Bärbar dator |PC portable |Portátil |Laptop |PC portatile )/,
        "",
      );
      const name = `PC portatile ${stripped}`;
      t.description = DESC.it(name, brand);
    }
    if (lang === "fr" && !/^Découvrez/.test(t.description)) {
      const brand = /Lenovo/.test(t.name) ? "Lenovo" : "MSI";
      const stripped = t.name.replace(
        /^(Bärbar dator |PC portable |Portátil |Laptop |PC portatile )/,
        "",
      );
      const name = `PC portable ${stripped}`;
      t.description = DESC.fr(name, brand);
    }
    if (lang === "es" && !/^Descubre/.test(t.description)) {
      const brand = /Lenovo/.test(t.name) ? "Lenovo" : "MSI";
      const stripped = t.name.replace(
        /^(Bärbar dator |PC portable |Portátil |Laptop |PC portatile )/,
        "",
      );
      const name = `Portátil ${stripped}`;
      t.description = DESC.es(name, brand);
    }
    // Ensure brand token in name/desc
    const brand = /Lenovo/.test(t.name)
      ? "Lenovo"
      : /MSI/.test(t.name)
        ? "MSI"
        : null;
    if (brand && !(t.description || "").includes(brand)) {
      const first = t.description.indexOf("\n\n");
      const second = t.description.indexOf("\n\n", first + 2);
      if (second >= 0) {
        const SENT = {
          fr: (b, n) =>
            `Le ${n} de ${b} équilibre performances, qualité d'affichage et mobilité pour le travail, les études et le divertissement.`,
          es: (b, n) =>
            `El ${n} de ${b} equilibra rendimiento, calidad de pantalla y portabilidad para trabajo, estudio y entretenimiento.`,
          sv: (b, n) =>
            `${n} från ${b} balanserar prestanda, skärmkvalitet och portabilitet för arbete, studier och underhållning.`,
          de: (b, n) =>
            `Der ${n} von ${b} verbindet Leistung, Anzeigequalität und Mobilität für Arbeit, Studium und Unterhaltung.`,
          it: (b, n) =>
            `Il ${n} di ${b} bilancia prestazioni, qualità dello schermo e portabilità per lavoro, studio e intrattenimento.`,
        };
        t.description =
          t.description.slice(0, second) +
          "\n\n" +
          SENT[lang](brand, t.name) +
          t.description.slice(second);
      }
    }
  }
}
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
console.log("pass17 done");

// rebuild import
for (const rec of importData.records) {
  const h = hand[rec.productId] && hand[rec.productId][rec.targetLang];
  if (h) rec.translations = h;
}
fs.writeFileSync(IMPORT, JSON.stringify(importData, null, 2), "utf8");
console.log("import rebuilt");
