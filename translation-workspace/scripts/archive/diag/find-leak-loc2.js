// Locate leak positions using the validator's actual bigram logic.
const path = require("path");
const fs = require("fs");
const WS = path.join(__dirname, "..");
const BACKEND = path.resolve(WS, "..", "online-store-backend");
const validator = require(
  path.join(BACKEND, "src", "utils", "translationValidator.js"),
);
const d = JSON.parse(
  fs.readFileSync(
    path.join(WS, "data", "import", "assistant-batch-import-nov08.json"),
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
const containsWholePhrase = (hay, needle) => hay.includes(needle);

const targets = [
  ["c69b", "nl", "description"],
  ["c6a5", "fr", "description"],
  ["c7e3", "it", "description"],
  ["c7ed", "fr", "description"],
  ["c7ed", "es", "description"],
];
for (const [tail, lang, f] of targets) {
  const rec = d.records.find(
    (r) => r.productId.endsWith(tail) && r.targetLang === lang,
  );
  const src = rec.source[f];
  const translated = rec.translations[f];
  const sourceWords = getWords(src);
  const translatedText = translated.toLocaleLowerCase("vi");
  const normalizedTranslatedText = removeVietnameseDiacritics(translatedText);
  for (let index = 0; index < sourceWords.length - 1; index += 1) {
    for (
      let length = Math.min(4, sourceWords.length - index);
      length >= 2;
      length -= 1
    ) {
      const phrase = sourceWords.slice(index, index + length).join(" ");
      const normalizedPhrase = removeVietnameseDiacritics(phrase);
      const hasDiacritics = sourceWords
        .slice(index, index + length)
        .some((word) => VIETNAMESE_DIACRITICS.test(word));
      if (
        phrase.length >= 6 &&
        hasDiacritics &&
        (containsWholePhrase(translatedText, phrase) ||
          containsWholePhrase(normalizedTranslatedText, normalizedPhrase))
      ) {
        console.log(`${tail}/${lang} ${f}: phrase="${phrase}"`);
        // find position
        const i = translatedText.indexOf(phrase);
        console.log(
          `  ctx: ${JSON.stringify(translated.slice(Math.max(0, i - 80), i + phrase.length + 80))}`,
        );
        break;
      }
    }
  }
}
