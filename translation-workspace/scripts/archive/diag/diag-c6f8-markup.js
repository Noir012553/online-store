// Fix c6f8/it markup_mismatch: source description contains "&lt;=" entity;
// my Italian translation dropped it. Restore the entity in the same position.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const HAND_ACC = path.join(WS, "data", "translations", "translations-nov06c-hand.json");
const hand = JSON.parse(fs.readFileSync(HAND_ACC, "utf8"));

const IMPORT = path.join(WS, "data", "import", "assistant-batch-import-nov06c.json");
const importData = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const rec = importData.records.find((r) => r.productId.endsWith("c6f8") && r.targetLang === "it");
const src = rec.source.description;
const j = src.indexOf("&lt;=");
console.log("SRC ctx:", JSON.stringify(src.slice(Math.max(0, j - 220), j + 120)));
const t = hand["6ad0cff40069aece85a8c6f8"].it;
console.log("TR has &lt;=:", t.description.includes("&lt;="));
