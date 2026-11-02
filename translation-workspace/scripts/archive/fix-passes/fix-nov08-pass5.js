// Fix nov08 pass 5 — remaining 12 alt leaks
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov08.json",
);
const HAND = path.join(
  WS,
  "data",
  "translations",
  "translations-nov08-hand.json",
);
const d = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));

const TR = {
  "bộ vi xử lý": {
    en: "processor",
    fr: "processeur",
    it: "processore",
    nl: "processor",
    sv: "processor",
    pt: "processador",
    es: "procesador",
    de: "Prozessor",
  },
  "đèn nền đơn sắc": {
    en: "monochrome backlight",
    fr: "rétroéclairage monochrome",
    it: "retroilluminazione monocromatica",
    nl: "monochroom achtergrondverlichting",
    sv: "monokrom bakgrundsbelysning",
    pt: "retroiluminação monocromática",
    es: "retroiluminación monocromática",
    de: "monochrome Hintergrundbeleuchtung",
  },
  "cao cấp": {
    en: "premium",
    fr: "premium",
    it: "di fascia alta",
    nl: "premium",
    sv: "premium",
    pt: "premium",
    es: "gama alta",
    de: "Premium",
  },
};

const entries = Object.entries(TR).sort((a, b) => b[0].length - a[0].length);
function apply(lang, text) {
  let out = text;
  for (const [vn, w] of entries)
    if (w[lang]) out = out.replace(new RegExp(vn, "gi"), w[lang]);
  return out;
}

let n = 0;
for (const rec of d.records) {
  const lang = rec.targetLang;
  const t = rec.translations;
  let changed = false;
  for (const f of ["name", "description", "technicalDescription"]) {
    if (t[f] && /[ăâđêôơưáàảãạấầẩẫậắằẳẵặếềểễệốồổỗộớờởỡợứừửữự]/u.test(t[f])) {
      const a = apply(lang, t[f]);
      if (a !== t[f]) {
        t[f] = a;
        changed = true;
      }
    }
  }
  (t.descriptionImages || []).forEach((im) => {
    if (
      im.alt &&
      /[ăâđêôơưáàảãạấầẩẫậắằẳẵặếềểễệốồổỗộớờởỡợứừửữự]/u.test(im.alt)
    ) {
      im.alt = apply(lang, im.alt);
      changed = true;
    }
  });
  if (changed) n++;
}
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
fs.writeFileSync(HAND, JSON.stringify(hand, null, 2) + "\n", "utf8");
console.log("fixed:", n);
