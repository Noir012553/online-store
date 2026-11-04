// Import + approve Arc techfix now that validator is fixed (server runs NEW code)
const fs = require("fs");
const BATCH_FILE =
  "e:/dev-camp/24-9-26 copy 98/translation-workspace/data/import/assistant-batch-aspirego14-fr-techfix.json";

(async () => {
  const loginRes = await fetch("http://localhost:5000/api/users/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@laptop.com", password: "admin123" }),
  });
  const login = await loginRes.json();
  const token = login.token;
  console.log("login OK");

  const payload = JSON.parse(fs.readFileSync(BATCH_FILE, "utf8"));
  const importRes = await fetch(
    "http://localhost:5000/api/translations/admin/products/import",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        assistantBatch: true,
        dryRun: false,
        records: payload.records,
        idempotencyKey: `arcfix2-fr-${Date.now()}`,
      }),
    },
  );
  const importText = await importRes.json();
  console.log(
    "IMPORT:",
    JSON.stringify(importText.data || importText).slice(0, 1000),
  );
  if (!importRes.ok) {
    process.exitCode = 1;
    return;
  }

  const approveRes = await fetch(
    "http://localhost:5000/api/translations/admin/products/assistant-approve-batch",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        records: [{ productId: "6ad0cb680069aece85a8c613", targetLang: "fr" }],
      }),
    },
  );
  console.log(
    "APPROVE status:",
    approveRes.status,
    JSON.stringify(await approveRes.json()).slice(0, 1000),
  );
  if (!approveRes.ok) process.exitCode = 1;
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exitCode = 1;
});
