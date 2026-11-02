// Dry-run chunk 10 of nov06e batch.
const fs = require("fs");
const path = require("path");
const BASE = process.env.BASE_URL || "http://localhost:5000";
const FILE = path.join(
  __dirname,
  "..",
  "data",
  "import",
  "assistant-batch-import-nov06e.json",
);
const CHUNK = 10;

const slice = (arr, size) =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, (i + 1) * size),
  );

(async () => {
  const parsed = JSON.parse(fs.readFileSync(FILE, "utf8"));
  const records = parsed.records.map((r) => ({
    productId: r.productId,
    targetLang: r.targetLang,
    sourceHash: r.sourceHash,
    translations: r.translations,
  }));
  const chunks = slice(records, CHUNK);
  const login = await fetch(`${BASE}/api/users/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@laptop.com", password: "admin123" }),
  }).then((r) => r.json());
  const token = (login.data || login)?.accessToken;
  if (!token) {
    console.log("LOGIN FAILED", JSON.stringify(login).slice(0, 300));
    return;
  }
  const chunk = chunks[9];
  const res = await fetch(`${BASE}/api/translations/admin/products/import`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      records: chunk,
      idempotencyKey: `nov06e-dry-${Date.now()}-9`,
      assistantBatch: true,
      dryRun: true,
    }),
  });
  const text = await res.text();
  console.log(`dry 10: HTTP ${res.status} ${text.slice(0, 300)}`);
})().catch((e) => console.error("FATAL:", e.message));
