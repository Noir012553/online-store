// Continue dry-run for chunks 5-10 of the nov06e batch (import already logged
// chunks 1-4). Appends to logs/dry-nov06e.log.
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
const LOG = path.join(__dirname, "..", "logs", "dry-nov06e.log");

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
    console.log("LOGIN FAILED");
    return;
  }
  const call = async (url, body) => {
    const res = await fetch(`${BASE}${url}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {}
    return { status: res.status, data, text, ms: Date.now() - Date.now() };
  };
  for (let i = 4; i < chunks.length; i++) {
    const chunk = chunks[i];
    const res = await call("/api/translations/admin/products/import", {
      records: chunk,
      idempotencyKey: `nov06e-dry-${Date.now()}-${i}`,
      assistantBatch: true,
      dryRun: true,
    });
    const line = `dry ${i + 1}: HTTP ${res.status} ${res.data ? JSON.stringify(res.data).slice(0, 300) : res.text.slice(0, 140)}`;
    fs.appendFileSync(LOG, line + "\n", "utf8");
    console.log(line);
    await new Promise((r) => setTimeout(r, 800));
  }
  console.log("DRY TAIL DONE");
})().catch((e) => {
  console.error("FATAL:", e.message);
  fs.appendFileSync(LOG, "FATAL: " + e.message + "\n", "utf8");
});
