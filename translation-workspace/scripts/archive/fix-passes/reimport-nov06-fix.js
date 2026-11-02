// Re-import + re-approve the 7 pending records (fixed specs key "size"→
// "kich_thuoc_man_hinh", MacBook restored). Reads current import JSON.
const fs = require("fs");
const path = require("path");
const BASE = process.env.BASE_URL || "http://localhost:5000";
const FILE = path.join(
  __dirname,
  "..",
  "data",
  "import",
  "assistant-batch-import-nov06.json",
);
const TARGETS = [
  ["6ad0ca970069aece85a8c5fa", "fr"],
  ["6ad0ca970069aece85a8c5fa", "it"],
  ["6ad0ca970069aece85a8c5fa", "es"],
  ["6ad0ca970069aece85a8c5fb", "pt"],
  ["6ad0ca970069aece85a8c5fb", "fr"],
  ["6ad0ca970069aece85a8c5fb", "it"],
  ["6ad0ca970069aece85a8c5fb", "es"],
];

(async () => {
  const parsed = JSON.parse(fs.readFileSync(FILE, "utf8"));
  const wanted = new Map(TARGETS.map(([p, l]) => [`${p}:${l}`, true]));
  const records = parsed.records
    .filter((r) => wanted.has(`${r.productId}:${r.targetLang}`))
    .map((r) => ({
      productId: r.productId,
      targetLang: r.targetLang,
      sourceHash: r.sourceHash,
      translations: r.translations,
    }));
  console.log("records to re-import:", records.length);
  if (records.length !== TARGETS.length) {
    console.log("WARN: count mismatch, abort");
    return;
  }

  const login = await fetch(`${BASE}/api/users/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@laptop.com", password: "admin123" }),
  }).then((r) => r.json());
  const token = (login.data || login)?.accessToken;
  if (!token) {
    console.log("LOGIN FAILED", JSON.stringify(login).slice(0, 200));
    return;
  }
  console.log("login OK");

  const call = async (url, body) => {
    const startedAt = Date.now();
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
    return { status: res.status, data, text, ms: Date.now() - startedAt };
  };

  // Re-import overwrites the pending drafts (spec key fixed, MacBook back).
  const imp = await call("/api/translations/admin/products/import", {
    records,
    idempotencyKey: `nov06-fix-${Date.now()}`,
    assistantBatch: true,
    dryRun: false,
  });
  const d = imp.data?.data;
  console.log(
    `re-import: HTTP ${imp.status} ${imp.ms}ms ${d ? JSON.stringify(d).slice(0, 250) : imp.text.slice(0, 160)}`,
  );

  const ap = await call(
    "/api/translations/admin/products/assistant-approve-batch",
    {
      records: records.map(({ productId, targetLang }) => ({
        productId,
        targetLang,
      })),
      confirmInconsistent: true,
      note: "Nov06 fix pass: specs key size->kich_thuoc_man_hinh restored, MacBook brand token kept in touchpad sentence. Inconsistent diffs reviewed.",
    },
  );
  const a = ap.data?.data;
  console.log(
    `approve: HTTP ${ap.status} ${ap.ms}ms ${a ? JSON.stringify(a).slice(0, 500) : ap.text.slice(0, 160)}`,
  );
  if (a)
    for (const r of a.results || [])
      console.log(
        `  ${r.status} ${r.productId}/${r.targetLang} ${r.reason || ""}`,
      );
})().catch((e) => console.error("FATAL:", e.message));
