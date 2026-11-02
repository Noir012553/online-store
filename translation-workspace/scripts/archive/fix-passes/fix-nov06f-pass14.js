// Debug pass 14 — locate exact "rose đi" context in c8a2/it across ALL text fields
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov06f.json",
);
const d = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .toLowerCase();
const r = d.records.find(
  (x) => x.productId.endsWith("c8a2") && x.targetLang === "it",
);
const fields = {
  name: r.translations.name,
  description: r.translations.description,
  technicalDescription: r.translations.technicalDescription,
};
for (const [k, v] of Object.entries(r.translations.specs || {}))
  fields["specs." + k] = v;
(r.translations.descriptionImages || []).forEach(
  (im, i) => (fields["img" + i + ".alt"] = im.alt),
);
(r.translations.promotions || []).forEach(
  (p, i) =>
    (fields["promo" + i] = typeof p === "string" ? p : JSON.stringify(p)),
);
const needle = norm("rose đi");
for (const [k, v] of Object.entries(fields)) {
  const nv = norm(v);
  let i = nv.indexOf(needle);
  while (i >= 0) {
    console.log(
      k,
      ">>",
      JSON.stringify(v.slice(Math.max(0, i - 100), i + 120)),
    );
    i = nv.indexOf(needle, i + 1);
  }
}
