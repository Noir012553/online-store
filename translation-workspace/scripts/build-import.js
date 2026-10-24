const fs = require("fs");
function load(p) {
  let raw = fs.readFileSync(p, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  return JSON.parse(raw);
}
const exportData = load("E:/dev-camp/24-9-26 copy 98/translation-workspace/data/export/assistant-batch-10-products-8lang.json");
const groups = [
  "E:/dev-camp/24-9-26 copy 98/translation-workspace/data/translations/translations-group1.json",
  "E:/dev-camp/24-9-26 copy 98/translation-workspace/data/translations/translations-group2.json",
  "E:/dev-camp/24-9-26 copy 98/translation-workspace/data/translations/translations-group3.json",
  "E:/dev-camp/24-9-26 copy 98/translation-workspace/data/translations/translations-group4.json",
  "E:/dev-camp/24-9-26 copy 98/translation-workspace/data/translations/translations-group5.json",
].map(load);

const tmap = new Map();
for (const g of groups) {
  for (const [pid, langs] of Object.entries(g)) {
    for (const [lang, t] of Object.entries(langs))
      tmap.set(`${pid}:${lang}`, t);
  }
}

let filled = 0,
  missing = [];
const records = exportData.records.map((rec) => {
  const t = tmap.get(`${rec.productId}:${rec.targetLang}`);
  if (!t) {
    missing.push(`${rec.productId}:${rec.targetLang}`);
    return rec;
  }
  const out = {
    productId: rec.productId,
    targetLang: rec.targetLang,
    sourceHash: rec.sourceHash,
    translations: {
      name: t.name,
      description: t.description,
      brand: t.brand,
      specs: t.specs,
      technicalDescription: t.technicalDescription,
      descriptionImages: rec.source.descriptionImages.map((img, i) => ({
        url: img.url,
        alt: t.imageAlts && t.imageAlts[i] !== undefined ? t.imageAlts[i] : "",
      })),
      promotions: rec.source.promotions.map((p) => ({
        ...p,
        title: p.title || "",
        giftProductName: p.giftProductName || "",
        scope: p.scope || "",
        discountText: p.discountText || "",
      })),
    },
  };
  filled++;
  return out;
});

// Xác minh kỹ thuật: technical token từ source phải xuất hiện trong bản dịch
function tokensOf(specs) {
  return Object.values(specs || {}).map(String);
}
function countOcc(hay, needle) {
  if (!needle) return -1;
  let n = 0,
    i = 0;
  while ((i = hay.indexOf(needle, i)) !== -1) {
    n++;
    i += needle.length;
  }
  return n;
}
const issues = [];
for (const rec of records) {
  const src = exportData.records.find(
    (r) => r.productId === rec.productId && r.targetLang === rec.targetLang,
  ).source;
  const tr = rec.translations;
  const combined = `${tr.name}\n${tr.description}\n${tr.technicalDescription}\n${Object.values(tr.specs || {}).join("\n")}`;
  // Kiểm tra số & token kỹ thuật trong specs source có mặt trong bản dịch specs
  for (const [k, v] of Object.entries(src.specs || {})) {
    const tv = String(tr.specs?.[k] ?? "");
    if (!tv) {
      issues.push(
        `${rec.productId}/${rec.targetLang} spec ${k}: thiếu trong bản dịch`,
      );
      continue;
    }
    // các dãy số/đơn vị phải giữ nguyên
    const numbers =
      v.match(/[\d][\d.,]*(?:\s?(?:g|GHz|Hz|DPI|mm|K|IPS))?/g) || [];
    for (const num of numbers) {
      if (
        !tv.includes(num.replace(/\s/g, "")) &&
        !tv.replace(/\s/g, "").includes(num.replace(/\s/g, ""))
      ) {
        issues.push(
          `${rec.productId}/${rec.targetLang} spec ${k}: mất token "${num}" (src="${v}" tr="${tv}")`,
        );
      }
    }
  }
  // model name: các token chữ-số dạng V3/Gen-2/35K/CS2 v.v. trong name source phải giữ trong name dịch
  const srcName = src.name;
  const modelTokens =
    srcName.match(
      /(?:[A-Z][A-Za-z0-9]*\s?)(?:V\d|Gen-?\d|\d+K|SE|CS2|Edition|Pro|Black|White|Vertical|HyperSpeed|Wireless|35K|45K|30K|26K)/g,
    ) || [];
  for (const tok of modelTokens) {
    const core = tok.trim();
    if (!combined.includes(core))
      issues.push(
        `${rec.productId}/${rec.targetLang}: mất model token "${core}"`,
      );
  }
  // description: số + đơn vị phổ biến
  const descNumbers =
    src.description.match(
      /\d[\d.,]*\s?(?:g|GHz|Hz|DPI|mm|IPS|G|ml|%|K|G2|Gen)/g,
    ) || [];
  for (const num of descNumbers) {
    if (!tr.description.replace(/\s/g, "").includes(num.replace(/\s/g, ""))) {
      issues.push(`${rec.productId}/${rec.targetLang} desc: mất "${num}"`);
    }
  }
}

const out = { workflow: 'assistant_batch', records };
let oRaw = JSON.stringify(out, null, 2);
fs.writeFileSync(
  "E:/dev-camp/24-9-26 copy 98/translation-workspace/data/import/assistant-batch-import-10-products.json",
  oRaw,
  "utf8",
);
console.log("records filled:", filled, "/", exportData.records.length);
if (missing.length) console.log("MISSING translations:", missing.join(", "));
console.log("token issues:", issues.length);
issues.slice(0, 40).forEach((x) => console.log(" -", x));
console.log(
  "file size:",
  fs.statSync("E:/dev-camp/24-9-26 copy 98/translation-workspace/data/import/assistant-batch-import-10-products.json").size,
);
