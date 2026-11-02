// Check the LANGS matching in gen-nov10: hand[pid] should have entries for
// each lang requested by export. Compare keys.
const e = require("../data/export/assistant-batch-next.json");
const h = require("../data/translations/translations-nov10-hand.json");
for (const pid of Object.keys(h)) {
  const want = new Set(
    e.records.filter((r) => r.productId === pid).map((r) => r.targetLang),
  );
  const have = new Set(Object.keys(h[pid]));
  const miss = [...want].filter((l) => !have.has(l));
  console.log(
    pid.slice(-4),
    "want:",
    [...want].join(","),
    "| miss:",
    miss.join(",") || "none",
  );
}
