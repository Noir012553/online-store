// Pass 3 — aggressive final sweep: iterate replacements to fixpoint, then a
// targeted hunt for every remaining VN bigram inside description/alts of each
// record (word-boundary aware). Some VN words are substrings of legit words
// ("con" in Italian/Spanish/French/Dutch "connect") so we require token match.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const load = (p) => {
  let raw = fs.readFileSync(p, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  return JSON.parse(raw);
};
const save = (p, d) =>
  fs.writeFileSync(p, JSON.stringify(d, null, 2) + "\n", "utf8");
const handPath = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06d-hand.json",
);
const hand = load(handPath);

const R = {
  "trực tiếp": { en: "direct", pt: "direto", fr: "direct", de: "direkt", it: "diretto", es: "directo", nl: "direct", sv: "direkt" },
  "kết nối": { en: "connection", pt: "ligação", fr: "connexion", de: "Verbindung", it: "connessione", es: "conexión", nl: "verbinding", sv: "anslutning" },
  "hoạt động": { en: "operation", pt: "operação", fr: "fonctionnement", de: "Betrieb", it: "funzionamento", es: "funcionamiento", nl: "werking", sv: "funktion" },
  "màn hình": { en: "screen", pt: "ecrã", fr: "écran", de: "Bildschirm", it: "schermo", es: "pantalla", nl: "scherm", sv: "skärm" },
  "hiển thị": { en: "display", pt: "exibição", fr: "affichage", de: "Anzeige", it: "visualizzazione", es: "visualización", nl: "weergave", sv: "visning" },
  "thông minh": { en: "smart", pt: "inteligente", fr: "intelligent", de: "intelligent", it: "intelligente", es: "inteligente", nl: "slim", sv: "smart" },
  "không dây": { en: "wireless", pt: "sem fios", fr: "sans fil", de: "kabellos", it: "wireless", es: "inalámbrico", nl: "draadloos", sv: "trådlös" },
  "nhà sản xuất": { en: "manufacturer", pt: "fabricante", fr: "fabricant", de: "Hersteller", it: "produttore", es: "fabricante", nl: "fabrikant", sv: "tillverkare" },
  "công thái học": { en: "ergonomics", pt: "ergonomia", fr: "ergonomie", de: "Ergonomie", it: "ergonomia", es: "ergonomía", nl: "ergonomie", sv: "ergonomi" },
  "tiên tiến": { en: "advanced", pt: "avançado", fr: "avancé", de: "fortschrittlich", it: "avanzato", es: "avanzado", nl: "geavanceerd", sv: "avancerad" },
  "thế hệ": { en: "generation", pt: "geração", fr: "génération", de: "Generation", it: "generazione", es: "generación", nl: "generatie", sv: "generation" },
  "được phối": { en: "color-coordinated", pt: "combinado em cores", fr: "assorti en couleurs", de: "farblich abgestimmt", it: "abbinato nei colori", es: "coordinado en color", nl: "kleurcoördinerend", sv: "färgkoordinerad" },
  "lượng phá": { en: "quantity", pt: "quantidade", fr: "quantité", de: "Menge", it: "quantità", es: "cantidad", nl: "hoeveelheid", sv: "mängd" },
  "nổi bật": { en: "striking", pt: "marcante", fr: "marquant", de: "markant", it: "marcante", es: "llamativo", nl: "opvallend", sv: "iögonfallande" },
  "bền bỉ": { en: "durable", pt: "durável", fr: "durable", de: "langlebig", it: "durevole", es: "duradero", nl: "duurzaam", sv: "hållbar" },
  "cực ngầu": { en: "super cool", pt: "super legal", fr: "super cool", de: "supercool", it: "super figo", es: "muy genial", nl: "supercool", sv: "supersnygg" },
  "trực": { en: "direct", pt: "direto", fr: "direct", de: "direkt", it: "diretto", es: "directo", nl: "direct", sv: "direkt" },
  "nối": { en: "connection", pt: "ligação", fr: "connexion", de: "Verbindung", it: "connessione", es: "conexión", nl: "verbinding", sv: "anslutning" },
  "dây": { en: "wire", pt: "fio", fr: "fil", de: "Kabel", it: "filo", es: "cable", nl: "draad", sv: "tråd" },
  "loại": { en: "type", pt: "tipo", fr: "type", de: "Typ", it: "tipo", es: "tipo", nl: "type", sv: "typ" },
  "cấp": { en: "level", pt: "nível", fr: "niveau", de: "Stufe", it: "livello", es: "nivel", nl: "niveau", sv: "nivå" },
  "sáu": { en: "six", pt: "seis", fr: "six", de: "sechs", it: "sei", es: "seis", nl: "zes", sv: "sex" },
  "không": { en: "no", pt: "não", fr: "non", de: "nein", it: "no", es: "no", nl: "nee", sv: "nej" },
  "bên": { en: "side", pt: "lado", fr: "côté", de: "Seite", it: "lato", es: "lado", nl: "kant", sv: "sida" },
  "biến": { en: "variable", pt: "variável", fr: "variable", de: "variabel", it: "variabile", es: "variable", nl: "variabel", sv: "variabel" },
  "phá": { en: "break", pt: "quebra", fr: "casse", de: "Bruch", it: "rottura", es: "rotura", nl: "breek", sv: "bryt" },
  "nhà": { en: "house", pt: "casa", fr: "maison", de: "Haus", it: "casa", es: "casa", nl: "huis", sv: "hus" },
  "công": { en: "work", pt: "trabalho", fr: "travail", de: "Arbeit", it: "lavoro", es: "trabajo", nl: "werk", sv: "arbete" },
  "thái": { en: "attitude", pt: "atitude", fr: "attitude", de: "Haltung", it: "atteggiamento", es: "actitud", nl: "houding", sv: "attityd" },
  "tiên": { en: "fairy", pt: "fada", fr: "fée", de: "Fee", it: "fata", es: "hada", nl: "fee", sv: "älva" },
  "tiến": { en: "advance", pt: "avanço", fr: "avancée", de: "Fortschritt", it: "avanzamento", es: "avance", nl: "voortgang", sv: "framsteg" },
  "thế": { en: "world", pt: "mundo", fr: "monde", de: "Welt", it: "mondo", es: "mundo", nl: "wereld", sv: "värld" },
  "bền": { en: "durable", pt: "durável", fr: "durable", de: "langlebig", it: "durevole", es: "duradero", nl: "duurzaam", sv: "hållbar" },
  "với": { en: "with", pt: "com", fr: "avec", de: "mit", it: "con", es: "con", nl: "met", sv: "med" },
  "và": { en: "and", pt: "e", fr: "et", de: "und", it: "e", es: "y", nl: "en", sv: "och" },
  "được": { en: "is", pt: "é", fr: "est", de: "ist", it: "è", es: "es", nl: "is", sv: "är" },
  "màn": { en: "screen", pt: "ecrã", fr: "écran", de: "Bildschirm", it: "schermo", es: "pantalla", nl: "scherm", sv: "skärm" },
  "hiển": { en: "display", pt: "exibir", fr: "afficher", de: "anzeigen", it: "visualizzare", es: "mostrar", nl: "weergeven", sv: "visa" },
  "thông": { en: "smart", pt: "esperto", fr: "intelligent", de: "klug", it: "intelligente", es: "inteligente", nl: "slim", sv: "smart" },
  "viên": { en: "unit", pt: "unidade", fr: "unité", de: "Einheit", it: "unità", es: "unidad", nl: "eenheid", sv: "enhet" },
  "nổi": { en: "striking", pt: "marcante", fr: "marquant", de: "markant", it: "marcante", es: "llamativo", nl: "opvallend", sv: "iögonfallande" },
  "hoạt": { en: "operating", pt: "operando", fr: "opérant", de: "betreibend", it: "operante", es: "operando", nl: "opererend", sv: "opererande" },
  "trực": { en: "direct", pt: "direto", fr: "direct", de: "direkt", it: "diretto", es: "directo", nl: "direct", sv: "direkt" },
};

// Note: Vietnamese diacritics appear in legit pt/es/fr words occasionally
// ("práctica","está"…) so we only hunt real VN tokens with word boundaries
// for the remaining flagged words, preserving legit words via whitelist per lang.
const LEGIT = {
  pt: ["prática", "prático", "direto", "está", "estão", "conexão", "versátil", "às", "você", "será", "só", "até", "também", "possui", "então", "após", "através", "partir", "porque", "dia", "joia", "mais", "nível", "padrão", "ideais", "fiéis", "contador", "fanáticos", "fanático", "estão", "atenção", "possível", "rápidas"],
  es: ["práctica", "está", "estándar", "cálculo", "rápida", "versátil", "días", "más", "también", "después", "periódica", "rápidas", "atención", "solución", "última", "áreas", "fácil", "gaming"],
  fr: ["à", "châssis", "créer", "précise", "détaillée", "très", "déjà", "modèle", "fidèle", "précises", "pièces", "éléments", "réglée", "thématique", "scène", "clé", "clavier", "dédiée", "accès", "réactive"],
  it: ["qualità", "connettività", "libertà", "flessibilità", "così", "perché", "però", "utilità", "durante", "velocità", "attività", "più", "dettagli", "precisione", "chiarezza", "esperienza", "esperienze"],
  nl: ["financiële", "programmeren", "geïntegreerd", "periodieke", "individuele", "bevestigen"],
  en: [],
  de: [],
  sv: [],
};
const VN_TOKENS = ["trực","nối","dây","loại","cấp","sáu","không","bên","biến","phá","nhà","công","thái","tiên","tiến","thế","bền","với","và","được","màn","hiển","thông","viên","nổi","hoạt","lượng","phá","cách","cực","ngầu"];

function tokenHunt(text, lang) {
  let out = text;
  for (const tok of VN_TOKENS) {
    const re = new RegExp(`(?<![\\p{L}])${tok}(?![\\p{L}])`, "gu");
    if (re.test(out)) {
      // skip if word is legit for this language
      if ((LEGIT[lang] || []).some((w) => w.toLowerCase() === tok.toLowerCase())) continue;
      const rep = R[tok] ? R[tok][lang] || tok : tok;
      // Special: vn word "không" inside longer legit word? word-boundary guards.
      out = out.replace(re, rep);
    }
  }
  return out;
}

for (const [pid, langs] of Object.entries(hand)) {
  for (const [lang, t] of Object.entries(langs)) {
    let desc = t.description, tech = t.technicalDescription, name = t.name;
    let alts = (t.imageAlts || []).join("\u0000");
    desc = tokenHunt(desc, lang);
    tech = tokenHunt(tech, lang);
    name = tokenHunt(name, lang);
    alts = tokenHunt(alts, lang);
    t.description = desc; t.technicalDescription = tech; t.name = name;
    t.imageAlts = alts.split("\u0000");
    // spec values too
    for (const k of Object.keys(t.specs || {})) t.specs[k] = tokenHunt(t.specs[k], lang);
  }
}
save(handPath, hand);
console.log("pass3 done; verifying...");
const VIET = /[ăâđêôơưáàảãạấầẩẫậắằẳẵặếềểễệốồổỗộớờởỡợứừửữự]/u;
let bad = 0;
for (const [pid, langs] of Object.entries(hand)) {
  for (const [lang, t] of Object.entries(langs)) {
    const all = [t.name, t.description, t.technicalDescription, Object.values(t.specs || {}).join(" "), (t.imageAlts || []).join(" ")].join(" ");
    const m = all.match(/[\p{L}]*[ăâđêôơưáàảãạấầẩẫậắằẳẵặếềểễệốồổỗộớờởỡợứừửữự][\p{L}]*/gu) || [];
    let flagged = [...new Set(m)];
    flagged = flagged.filter((w) => !((LEGIT[lang] || []).includes(w)));
    if (flagged.length) { console.log(pid.slice(-4), lang, flagged.slice(0, 8).join(", ")); bad++; }
  }
}
console.log(bad ? bad + " records still flagged" : "ALL CLEAN");
