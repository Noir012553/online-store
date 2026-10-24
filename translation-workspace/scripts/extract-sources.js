const fs = require("fs");
let raw = fs.readFileSync("E:/dev-camp/24-9-26 copy 98/translation-workspace/data/export/assistant-batch-10-products-8lang.json", "utf8");
if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
const data = JSON.parse(raw);
const groups = {};
for (const rec of data.records) {
  if (!groups[rec.productId]) groups[rec.productId] = { rec, langs: [] };
  groups[rec.productId].langs.push(rec.targetLang);
}
let out = [];
for (const [pid, g] of Object.entries(groups)) {
  const s = g.rec.source;
  out.push(`===== PRODUCT ${pid} =====`);
  out.push(`LANGS: ${g.langs.join(",")}`);
  out.push(`NAME: ${s.name}`);
  out.push(`BRAND: ${s.brand}`);
  out.push(`SPECS (key=value):`);
  for (const [k, v] of Object.entries(s.specs || {})) out.push(`  ${k} = ${v}`);
  out.push(`TECH_DESCRIPTION (verbatim):`);
  out.push(s.technicalDescription || "(empty)");
  out.push(`DESCRIPTION (verbatim):`);
  out.push(s.description || "(empty)");
  out.push(`IMAGE_ALTS:`);
  (s.descriptionImages || []).forEach((img, i) =>
    out.push(`  [${i}] ${img.alt || "(none)"}`),
  );
  if (s.promotions && s.promotions.length) {
    out.push(`PROMOTIONS:`);
    s.promotions.forEach((p, i) =>
      out.push(
        `  [${i}] type=${p.type} title="${p.title}" giftProductName="${p.giftProductName}" scope="${p.scope}" discountText="${p.discountText}"`,
      ),
    );
  }
  out.push("");
}
fs.writeFileSync(
  "E:/dev-camp/24-9-26 copy 98/translation-workspace/data/sources-for-translation.txt",
  out.join("\n"),
  "utf8",
);
console.log("written, products:", Object.keys(groups).length);
