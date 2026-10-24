/**
 * Tạo payload cho chức năng "Nhập bản dịch hàng loạt" trên trang admin
 * (/admin/translationsDynamic) từ file batch do manual-product-translation.js --export sinh ra.
 *
 * Không kết nối DB, không gọi provider, không ghi dữ liệu.
 *
 * node scripts/prepare-assistant-import.js --draft=reports/manual-translation/en-draft-v3.json
 */
const fs = require("node:fs");
const path = require("node:path");

const args = process.argv.slice(2);
const getArg = (name) => {
  const prefix = `--${name}=`;
  return args
    .find((argument) => argument.startsWith(prefix))
    ?.slice(prefix.length);
};
const fieldArgs = getArg("fields");

const draftArgument = getArg("draft");
if (!draftArgument) {
  console.error(
    "Usage: node scripts/prepare-assistant-import.js --draft=<draft json> [--fields=name,description,specs,technicalDescription]",
  );
  process.exit(1);
}

const draftPath = path.resolve(process.cwd(), draftArgument);
const draft = JSON.parse(fs.readFileSync(draftPath, "utf8"));
const selectedFields = fieldArgs
  ? fieldArgs
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  : null;

const records = (draft.records || []).map((record) => {
  const sourceTranslations = record.translations || {};
  const source = record.source || {};
  const translations = {};
  const fields = selectedFields || Object.keys(sourceTranslations);

  for (const field of fields) {
    if (field === "specs") {
      const translatedSpecs = sourceTranslations.specs || {};
      const translatedKeys = Object.keys(translatedSpecs);
      const sourceKeys = Object.keys(source.specs || {});
      const sameShape =
        translatedKeys.length === sourceKeys.length &&
        translatedKeys.every((key, index) => key === sourceKeys[index]);
      const complete = translatedKeys.every(
        (key) =>
          typeof translatedSpecs[key] === "string" &&
          translatedSpecs[key].trim(),
      );
      if (sameShape && complete) translations.specs = translatedSpecs;
      continue;
    }
    const value = sourceTranslations[field];
    if (typeof value === "string" && value.trim()) translations[field] = value;
  }

  return {
    productId: record.productId,
    targetLang: record.targetLang,
    sourceHash: record.sourceHash,
    fields: Object.keys(translations),
    translations,
  };
});

const usable = records.filter((record) => record.fields.length > 0);
const payload = { records: usable };
const outputPath = path.join(
  path.dirname(draftPath),
  `ui-import-${path.basename(draftPath)}`,
);

fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), "utf8");
console.log(
  JSON.stringify(
    {
      mode: "prepare-ui-payload",
      draft: draftPath,
      output: outputPath,
      records: usable.length,
      droppedRecords: records.length - usable.length,
      perRecord: usable.map((record) => ({
        productId: record.productId,
        targetLang: record.targetLang,
        fields: record.fields,
      })),
    },
    null,
    2,
  ),
);
