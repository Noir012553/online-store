// Show the tails of records that are missing in hand (the laptops I wrote in
// separate files) and check their pid tails — plus the 10 pending from DB.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const importData = JSON.parse(
  fs.readFileSync(
    path.join(WS, "data", "import", "assistant-batch-import-nov06d.json"),
    "utf8",
  ),
);
const tails = importData.records.map((r) => r.productId.slice(-4));
console.log("unique tails in batch:", [...new Set(tails)].join(","));
const pending = JSON.parse(
  fs.readFileSync(path.join(WS, "logs", "nov06d-pending.json"), "utf8"),
);
console.log("pending:", pending.map((p) => p.pid + "/" + p.lang).join(" "));
