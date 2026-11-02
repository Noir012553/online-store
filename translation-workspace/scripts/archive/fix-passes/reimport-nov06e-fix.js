// Re-import + approve the 20 pending nov06e records.
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
const importData = JSON.parse(fs.readFileSync(FILE, "utf8"));

const TARGET_TAILS = [
  "c7fb",
  "c7fd",
  "c803",
  "c8c4",
  "c8c5",
  "c8c8",
  "c8f0",
  "c8f8",
  "c8a2",
  "c8b3",
  "c8db",
  "c770",
];
const records = importData.records.filter((r) =>
  TARGET_TAILS.includes(r.productId.slice(-4)),
);

(async () => {
  console.log("records to re-import:", records.length);
  if (!records.length) {
    console.log("nothing");
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
  const payload = records.map((r) => ({
    productId: r.productId,
    targetLang: r.targetLang,
    sourceHash: r.sourceHash,
    translations: r.translations,
  }));
  // split in 2 chunks
  for (let i = 0; i < payload.length; i += 10) {
    const chunk = payload.slice(i, i + 10);
    const imp = await call("/api/translations/admin/products/import", {
      records: chunk,
      idempotencyKey: `nov06e-fix-${Date.now()}-${i}`,
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
        records: chunk.map(({ productId, targetLang }) => ({
          productId,
          targetLang,
        })),
        confirmInconsistent: true,
        note: "Nov06e fix pass: double-space name normalized, correct-language descriptions restored (sv/de/it), brand sentences (Lenovo/MSI) injected.",
      },
    );
    const a = ap.data?.data;
    console.log(
      "approve:",
      ap.status,
      a
        ? `approved=${a.approvedCount} skipped=${a.skippedCount}`
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

    await new Promise((r) => setTimeout(r, 1200));
  }
})().catch((e) => console.error("FATAL:", e.message));
