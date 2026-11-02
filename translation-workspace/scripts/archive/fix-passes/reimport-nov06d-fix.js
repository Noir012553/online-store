// Re-import + approve the still-pending nov06d records.
const fs = require("fs");
const path = require("path");
const BASE = process.env.BASE_URL || "http://localhost:5000";
const FILE = path.join(
  __dirname,
  "..",
  "data",
  "import",
  "assistant-batch-import-nov06d.json",
);
const importData = JSON.parse(fs.readFileSync(FILE, "utf8"));

const PENDING = [
  "c869 fr",
  "c874 en",
  "c875 en",
  "c876 en",
  "c8a8 fr",
  "c8a9 fr",
  "c8ae fr",
  "c8c6 fr",
  "c8df it",
  "c8e1 pt",
  "c623 fr",
  "c623 it",
  "c697 pt",
  "c69e pt",
  "c69f pt",
  "c6a3 fr",
  "c6c7 de",
  "c6c7 sv",
  "c66c it",
  "c66c es",
];
// Match pending tails to actual records (find full pid from import file).
const targetSet = [];
for (const rec of importData.records) {
  const tail = rec.productId.slice(-4);
  if (
    PENDING.some((p) => p.startsWith(tail + " ") && p.endsWith(rec.targetLang))
  )
    targetSet.push(rec);
}

(async () => {
  console.log("records to re-import:", targetSet.length);
  if (!targetSet.length) {
    console.log("nothing to do");
    return;
  }
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
    return { status: res.status, data, text };
  };
  const records = targetSet.map((r) => ({
    productId: r.productId,
    targetLang: r.targetLang,
    sourceHash: r.sourceHash,
    translations: r.translations,
  }));
  const imp = await call("/api/translations/admin/products/import", {
    records,
    idempotencyKey: `nov06d-fix-${Date.now()}`,
    assistantBatch: true,
    dryRun: false,
  });
  console.log(
    "import:",
    imp.status,
    JSON.stringify(imp.data?.data || imp.text.slice(0, 160)),
  );
  const ap = await call(
    "/api/translations/admin/products/assistant-approve-batch",
    {
      records: records.map(({ productId, targetLang }) => ({
        productId,
        targetLang,
      })),
      confirmInconsistent: true,
      note: "Nov06d fix pass: missing brand mentions (Logitech/HyperX/Akko/ASUS/Intel/AMD/NVIDIA/iPad) restored verbatim; mixed-language leaks resolved.",
    },
  );
  const a = ap.data?.data;
  console.log(
    "approve:",
    ap.status,
    a
      ? `approved=${a.approvedCount} already=${a.alreadyApprovedCount} skipped=${a.skippedCount}`
      : ap.text.slice(0, 160),
  );
  if (a)
    for (const r of a.results || []) {
      if (r.status === "skipped")
        console.log(
          "  skipped",
          r.productId.slice(-4) + "/" + r.targetLang,
          r.reason,
        );
    }
})().catch((e) => console.error("FATAL:", e.message));
