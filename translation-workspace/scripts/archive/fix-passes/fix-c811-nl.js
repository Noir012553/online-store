// Fix c811/nl — "đen contour" normalized == "den contour" which appears in
// Dutch translation as "den contour" substring (from "diensten...contour"?).
// Locate the "den contour" substring and rewrite it.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const IMPORT = path.join(WS, "data", "import", "assistant-batch-import-nov06e.json");
const d = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const rec = d.records.find((r) => r.productId.endsWith("c811") && r.targetLang === "nl");
const tr = rec.translations.description;
const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase();
const nt = norm(tr);
let i = nt.indexOf("den contour");
if (i < 0) i = nt.indexOf("den  contour");
console.log("ctx:", JSON.stringify(tr.slice(Math.max(0, i - 130), i + 100)));
