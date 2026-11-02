// Diagnose bigram leak for c6ca/nl precisely
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const d = JSON.parse(
  fs.readFileSync(
    path.join(WS, "data", "import", "assistant-batch-import-nov09.json"),
    "utf8",
  ),
);
const VIETNAMESE_DIACRITICS = /[ăâđêôơưáàảãạấầẩẫậắằẳẵặếềểễệốồổỗộớờởỡợứừửữự]/u;
const removeVietnameseDiacritics = (value) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d");
const getWords = (value) =>
  value
    .toLocaleLowerCase("vi")
    .split(/[^\p{L}]+/u)
    .filter(Boolean);

const r = d.records.find(
  (x) => x.productId.endsWith("c6ca") && x.targetLang === "nl",
);
const src = r.source.description;
const tr = r.translations.description;
const srcWords = getWords(src);
const trText = tr.toLocaleLowerCase("vi");
const trNorm = removeVietnameseDiacritics(trText);
const out = [];
for (let index = 0; index < srcWords.length - 1; index += 1) {
  for (
    let length = Math.min(4, srcWords.length - index);
    length >= 2;
    length -= 1
  ) {
    const phrase = srcWords.slice(index, index + length).join(" ");
    const normalizedPhrase = removeVietnameseDiacritics(phrase);
    const hasDiacritics = srcWords
      .slice(index, index + length)
      .some((w) => VIETNAMESE_DIACRITICS.test(w));
    if (phrase.length >= 6 && hasDiacritics) {
      const hitPlain = trText.includes(phrase);
      const hitNorm = trNorm.includes(normalizedPhrase);
      if (hitPlain || hitNorm) {
        out.push(`phrase: "${phrase}" (norm: "${normalizedPhrase}")`);
        // context in TR
        const i = trNorm.indexOf(normalizedPhrase);
        if (i < 0) {
          const j = trText.indexOf(phrase);
          if (j >= 0)
            out.push(
              `  tr ctx: ...${JSON.stringify(tr.slice(Math.max(0, j - 70), j + 100))}...`,
            );
        } else {
          out.push(
            `  tr norm ctx: ...${JSON.stringify(tr.slice(Math.max(0, i - 70), i + 100))}...`,
          );
        }
        const srcIdx = src.toLowerCase().indexOf(phrase.toLowerCase());
        if (srcIdx < 0) {
          const srcIdx2 = src.toLowerCase().indexOf(normalizedPhrase);
          if (srcIdx2 >= 0)
            out.push(
              `  src ctx: ...${JSON.stringify(src.slice(Math.max(0, srcIdx2 - 70), srcIdx2 + 100))}...`,
            );
        } else {
          out.push(
            `  src ctx: ...${JSON.stringify(src.slice(Math.max(0, srcIdx - 70), srcIdx + 100))}...`,
          );
        }
      }
    }
  }
}
fs.writeFileSync(
  path.join(WS, "logs", "bigram-c6ca.txt"),
  out.join("\n"),
  "utf8",
);
console.log("done — logs/bigram-c6ca.txt");
