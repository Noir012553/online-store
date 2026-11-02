// Temp verify: skip technical-token checks for product_description only.
const path = require("path");
const v = require(path.join("..", "..", "online-store-backend", "src", "utils", "translationValidator.js"));

(async () => {
  // description: missing tokens should now be skipped
  const d = await v.validateTranslation(
    "Laptop RTX 3050 512GB man hinh 165Hz",
    "Translated prose mentions the RTX 3050 but forgets other specs",
    "pt",
    "product_description",
  );
  console.log("description :", JSON.stringify(d.validationErrors));

  // technicalDescription: must still fail on token mismatch
  const src = 'Thong so: {"SSD": "512GB"}';
  const tr = 'Specs: {"SSD": "256GB"}';
  const t = await v.validateTranslation(src, tr, "pt", "product_technical_description");
  console.log("technical   :", JSON.stringify(t.validationErrors));

  // spec field: unchanged
  const s = await v.validateTranslation("RAM 16GB", "RAM 8GB", "pt", "product_spec");
  console.log("spec        :", JSON.stringify(s.validationErrors));
})();
