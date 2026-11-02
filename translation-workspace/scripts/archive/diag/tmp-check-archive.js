// One-off: verify archive assistant-batch-next3.json coverage.
// Discover actual field names at runtime, then print per-product
// target-language coverage and the missing languages.
const fs = require("fs");
const path = require("path");
const j = JSON.parse(
  fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "data",
      "archive",
      "export",
      "assistant-batch-next3.json",
    ),
    "utf8",
  ),
);

// Discover field names from one record
const rec0 = j.records[0];
console.log("record keys:", Object.keys(rec0).join(", "));

// Try common names
const pid = (r) => r.productId || r.productId || rec0.productId;
const lang = (r) => r.targetLang || r.targetLang || rec0.targetLang;
console.log("record0 productId:", pid(rec0), "targetLang:", lang(rec0));

const m = {};
for (const r of j.records) {
  const s = String(pid(r)).slice(-4);
  const k = s + "|" + lang(r);
  m[k] = r;
}
console.log("records:", Object.keys(m).length);
for (const s of [
  "c5e9",
  "c5ea",
  "c5eb",
  "c5ec",
  "c5ed",
  "c5ee",
  "c5ef",
  "c5f0",
  "c5f1",
  "c5f2",
].sort()) {
  const langs = new Set(
    Object.keys(m)
      .filter((k) => k.startsWith(s))
      .map((k) => k.split("|")[1]),
  );
  console.log(s, [...langs].join(","));
}
