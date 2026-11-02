// c762/nl mixed_language: no actual VN diacritics. Leak is a SOURCE-phrase
// bigram appearing in the Dutch translation (e.g. "bàn phím cơ" normalized
// "ban phim co" — unlikely). The validator uses checkSourceLanguageLeak on
// Vietnamese bigrams — my Dutch text "Mechanisch toetsenbord" etc. shouldn't
// match. Use the validator directly to find the exact phrase.
const path = require("path");
const BACKEND = path.resolve(__dirname, "..", "..", "online-store-backend");
const validator = require(
  path.join(BACKEND, "src", "utils", "translationValidator.js"),
);
const fs = require("fs");
const WS = path.join(__dirname, "..");
const importData = JSON.parse(
  fs.readFileSync(
    path.join(WS, "data", "import", "assistant-batch-import-nov06d.json"),
    "utf8",
  ),
);
const rec = importData.records.find(
  (r) => r.productId.endsWith("c762") && r.targetLang === "nl",
);
const src = rec.source.description;
const tr = rec.translations.description;
const words = src
  .toLocaleLowerCase("vi")
  .split(/[^\p{L}]+/u)
  .filter(Boolean);
const norm = (s) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d");
const nd = norm(tr.toLowerCase());
const seen = new Set();
for (let i = 0; i < words.length - 1; i++) {
  for (let L = Math.min(4, words.length - i); L >= 2; L--) {
    const phrase = words.slice(i, i + L).join(" ");
    if (phrase.length < 6) continue;
    const np = norm(phrase);
    if (nd.includes(np) && !seen.has(np)) {
      seen.add(np);
      console.log("LEAK:", JSON.stringify(phrase));
      break;
    }
  }
}
if (!seen.size) console.log("no direct bigram leak — maybe standalone word");
// Also standalone VN-only words from source that are in translation
for (const w of new Set(words)) {
  if (
    w.length >= 6 &&
    /[ăâđêôơưáàảãạấầẩẫậắằẳẵặếềểễệốồổỗộớờởỡợứừửữự]/u.test(w)
  ) {
    if (nd.includes(norm(w))) console.log("WORD LEAK:", JSON.stringify(w));
  }
}
