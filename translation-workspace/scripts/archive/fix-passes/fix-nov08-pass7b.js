// Fix pass 7b — c69b/nl, c6a5/fr, c7e3/it, c7ed/fr+es specific leaks
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
  nl: {
    "để cpu": "CPU",
    "rtx đủ": "RTX",
    "switch sử": "switch met",
    "là ram": "RAM",
  },
  fr: {
    "để cpu": "CPU",
    "rtx đủ": "RTX",
    "switch sử": "switch avec",
    "là ram": "RAM",
  },
  it: {
    "để cpu": "CPU",
    "rtx đủ": "RTX",
    "switch sử": "switch con",
    "là ram": "RAM",
  },
  es: {
    "để cpu": "CPU",
    "rtx đủ": "RTX",
    "switch sử": "switch con",
    "là ram": "RAM",
  },
};

let n = 0;
for (const rec of d.records) {
  const lang = rec.targetLang;
  if (!TR[lang]) continue;
  const t = rec.translations;
  let changed = false;
  const apply = (text) => {
    let out = text;
    for (const [vn, w] of Object.entries(TR[lang])) {
      out = out.replace(new RegExp(vn, "gi"), w);
    }
    return out;
  };
  for (const f of ["name", "description", "technicalDescription"]) {
    if (t[f] && /[ăâđêôơưáàảãạấầẩẫậắằẳẵặếềểễệốồổỗộớờởỡợứừửữự]/u.test(t[f])) {
      const a = apply(t[f]);
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
      im.alt = apply(im.alt);
      changed = true;
    }
  });
  if (changed) n++;
}
fs.writeFileSync(IMPORT, JSON.stringify(d, null, 2), "utf8");
console.log("fixed:", n);
