// Fallback for pids not found in importData by tail — match against full list.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const HAND = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06d-hand.json",
);
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov06d.json",
);
const importData = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
console.log("total records:", importData.records.length);
console.log("hand keys:", Object.keys(hand).length);
console.log(
  "hand tails:",
  Object.keys(hand)
    .map((k) => k.slice(-4))
    .slice(0, 20)
    .join(","),
);
console.log(
  "import tails:",
  importData.records
    .map((r) => r.productId.slice(-4))
    .slice(0, 20)
    .join(","),
);
