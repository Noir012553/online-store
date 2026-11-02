const d = require("../data/import/assistant-batch-import-nov06f.json");
for (const r of d.records) {
  const tail = r.productId.slice(-4);
  if (tail !== "c760" && tail !== "c781") continue;
  if (r.targetLang !== "es" && r.targetLang !== "it") continue;
  const lines = r.translations.description.split("\n");
  console.log("===", tail + "/" + r.targetLang);
  for (let i = 0; i < Math.min(8, lines.length); i++)
    console.log(i + ":", lines[i]);
}
