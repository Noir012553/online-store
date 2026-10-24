const fs = require("fs");
function loadClean(p) {
  let s = fs.readFileSync(p, "utf8");
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return JSON.parse(s);
}
const exp = loadClean("E:/dev-camp/24-9-26 copy 98/translation-workspace/data/export/assistant-batch-10-products-8lang.json");
const imp = loadClean("E:/dev-camp/24-9-26 copy 98/translation-workspace/data/import/assistant-batch-import-10-products.json");
const srcMap = new Map(
  exp.records.map((r) => [r.productId + ":" + r.targetLang, r.source]),
);

function countOcc(hay, needle) {
  if (!needle) return 0;
  let n = 0,
    i = 0;
  while ((i = hay.indexOf(needle, i)) !== -1) {
    n++;
    i += needle.length;
  }
  return n;
}

for (const rec of imp.records) {
  const src = srcMap.get(rec.productId + ":" + rec.targetLang);
  if (!src) continue;
  const t = rec.translations;

  // 918 (Counter-Strike 2): source desc chứa "CS2" 1 lần, "Counter‑Strike 2" nhiều lần.
  // Bản dịch của tôi thêm "Counter‑Strike 2 Edition" trong tiêu đề section => tăng số lượng
  // nhưng thiếu CS2? -> kiểm tra đếm
  if (rec.productId === "6ad0d7c80069aece85a8c918") {
    const o = String(src.description),
      tr = String(t.description);
    console.log(
      "918",
      rec.targetLang,
      "src CS2:",
      countOcc(o, "CS2"),
      "trn CS2:",
      countOcc(tr, "CS2"),
      "| src Counter-Strike2:",
      countOcc(o.replace(/\u2011/g, "-"), "Counter-Strike 2"),
      "trn:",
      countOcc(tr.replace(/\u2011/g, "-"), "Counter-Strike 2"),
    );
  }
  if (rec.productId === "6ad0d7c80069aece85a8c917" && rec.targetLang === "nl") {
    const o = String(src.description),
      tr = String(t.description);
    console.log(
      "917 nl src 54g:",
      countOcc(o, "54g"),
      "trn 54g:",
      countOcc(tr, "54g"),
      "trn 54 g:",
      countOcc(tr, "54 g"),
    );
  }
  if (
    ["6ad0d7c80069aece85a8c91f", "6ad0d7c80069aece85a8c920"].includes(
      rec.productId,
    ) &&
    ["nl", "sv"].includes(rec.targetLang)
  ) {
    const o = String(src.description),
      tr = String(t.description);
    console.log(
      rec.productId.slice(-3),
      rec.targetLang,
      "src 8KHz:",
      countOcc(o, "8KHz"),
      "trn 8KHz:",
      countOcc(tr, "8KHz"),
      "trn 8 kHz:",
      countOcc(tr, "8 kHz"),
      "trn 8KHz-techn",
      countOcc(tr, "8KHz"),
    );
  }
  if (rec.productId === "6ad0d7c80069aece85a8c919" && rec.targetLang === "de") {
    const tr = String(t.description);
    console.log(
      "919 de src Gen-2:",
      countOcc(String(src.description), "Gen-2"),
      "trn Gen-2:",
      countOcc(tr, "Gen-2"),
      "trn Gen‑2:",
      countOcc(tr, "Gen\u20112"),
    );
    // locate "HyperSpeed-Gen-2-Verbindung"
    const i = tr.indexOf("Gen-2-Verbindung");
    if (i > -1) console.log("  ctx:", JSON.stringify(tr.slice(i - 40, i + 30)));
  }
  if (rec.productId === "6ad0d7c80069aece85a8c91a" && rec.targetLang === "de") {
    const tr = String(t.description);
    const i = tr.indexOf("Gen-4-Optical-Switches");
    if (i > -1)
      console.log("91a de ctx:", JSON.stringify(tr.slice(i - 40, i + 40)));
  }
  if (rec.productId === "6ad0d7c80069aece85a8c918" && rec.targetLang === "it") {
    const tr = String(t.description);
    const i = tr.indexOf("Counter‑Strike 2 in stile");
    if (i > -1)
      console.log("918 it ctx:", JSON.stringify(tr.slice(i - 30, i + 40)));
  }
}
