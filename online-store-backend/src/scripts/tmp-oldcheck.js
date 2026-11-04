// Answer the borrowing question: which source words triggered mixed_language at import time?
// Reproduce with the OLD validator logic (length>=2, no allowlist) + PRE-refactor normalized forms.
const path = require("path");
try {
  require("dotenv").config({
    path: path.resolve(__dirname, "../../.env"),
    quiet: true,
  });
} catch (e) {
  if (e.code !== "MODULE_NOT_FOUND") throw e;
}
const fs = require("fs");
const P_desc = "SOURCE_PLACEHOLDER";

const removeDiacritics = (value) =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d");
const getWordsOld = (value) =>
  value
    .toLocaleLowerCase("vi")
    .split(/[^\p{L}]+/u)
    .filter(Boolean);
const containsWholePhrase = (value, phrase) => {
  const escaped = phrase
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,
    "u",
  ).test(value);
};
const VIET_DIACRITICS = /[ăâđêôơưáàảãạấầẩẫậắằẳẵặếềểễệốồổỗộớờởỡợứừửữự]/u;

(async () => {
  const mongoose = require("mongoose");
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
  });
  const P = require("../models/Product");
  const p = await P.findById("6ad0cb680069aece85a8c613")
    .select("description")
    .lean();
  const batch = JSON.parse(
    fs.readFileSync(
      "e:/dev-camp/24-9-26 copy 98/translation-workspace/data/import/assistant-batch-aspirego14-fr.json",
      "utf8",
    ),
  );
  const source = p.description;
  const translated = batch.records[0].translations.description;
  const sourceWords = getWordsOld(source);
  const translatedText = translated.toLocaleLowerCase("vi");
  const normalizedTranslatedText = removeDiacritics(translatedText);

  // OLD single-word pass: length >= 2, NO allowlist
  const oldHits = [];
  for (const w of sourceWords) {
    const nw = removeDiacritics(w);
    if (
      w.length >= 2 &&
      VIET_DIACRITICS.test(w) &&
      (containsWholePhrase(translatedText, w) ||
        containsWholePhrase(normalizedTranslatedText, nw))
    ) {
      oldHits.push(w);
    }
  }
  console.log("OLD-LOGIC-SINGLE-HITS:", JSON.stringify(oldHits.slice(0, 10)));
  console.log("count:", oldHits.length);
  await mongoose.disconnect();
})().catch((e) => {
  console.error("FAILED:", e.name, e.message);
  process.exitCode = 1;
});
