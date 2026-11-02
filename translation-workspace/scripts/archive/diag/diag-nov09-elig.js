// Dry-run import for the not_eligible tails; print per-record validationErrors
// from the import preview response.
const fs = require("fs");
const path = require("path");
const BASE = "http://localhost:5000";
const FILE = path.join(
  __dirname,
  "..",
  "data",
  "import",
  "assistant-batch-import-nov09.json",
);
const d = JSON.parse(fs.readFileSync(FILE, "utf8"));
const TAILS = ["c6c8", "c6ca", "c645"];
const records = d.records.filter((r) =>
  TAILS.some((t) => r.productId.endsWith(t)),
);
console.log("records:", records.length);

(async () => {
  const login = await fetch(`${BASE}/api/users/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@laptop.com", password: "admin123" }),
  }).then((r) => r.json());
  const token = (login.data || login)?.accessToken;
  if (!token) return console.log("LOGIN FAILED");
  const res = await fetch(`${BASE}/api/translations/admin/products/import`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      records,
      idempotencyKey: `diag-${Date.now()}`,
      assistantBatch: true,
      dryRun: true,
    }),
  });
  const text = await res.text();
  fs.writeFileSync(
    path.join(__dirname, "..", "logs", "diag-nov09-elig.json"),
    text,
    "utf8",
  );
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {}
  console.log("HTTP", res.status);
  console.log(JSON.stringify(data?.data || data, null, 2).slice(0, 3000));
})().catch((e) => console.error("FATAL:", e.message));
