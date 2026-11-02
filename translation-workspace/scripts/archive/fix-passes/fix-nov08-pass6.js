// Fix nov08 pass 6 — remaining 5 leaks
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov08.json",
);
const d = JSON.parse(fs.readFileSync(IMPORT, "utf8"));

const TR = {
  "để cpu": {
    en: "CPU",
    fr: "CPU",
    it: "CPU",
    nl: "CPU",
    sv: "CPU",
    pt: "CPU",
    es: "CPU",
    de: "CPU",
  },
  "rtx đủ": {
    en: "RTX",
    fr: "RTX",
    it: "RTX",
    nl: "RTX",
    sv: "RTX",
    pt: "RTX",
    es: "RTX",
    de: "RTX",
  },
  "switch sử": {
    en: "switch with",
    fr: "switch avec",
    it: "switch con",
    nl: "switch met",
    sv: "switch med",
    pt: "switch com",
    es: "switch con",
    de: "switch mit",
  },
  "là ram": {
    en: "RAM",
    fr: "RAM",
    it: "RAM",
    nl: "RAM",
    sv: "RAM",
    pt: "RAM",
    es: "RAM",
    de: "RAM",
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
console.log("fixed:", n);
