// Re-import + approve the 5 fixed slots (c69b, c6a5, c7e3, c7ed).
const fs = require("fs");
const path = require("path");
const BASE = process.env.BASE_URL || "http://localhost:5000";
const IMPORT = path.join(
  __dirname,
  "..",
  "data",
  "import",
  "assistant-batch-import-nov08.json",
);
const DRY = process.env.DRY_RUN === "1";
const d = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const tails = ["c69b", "c6a5", "c7e3", "c7ed"];
const records = d.records.filter((r) =>
  tails.some((t) => r.productId.endsWith(t)),
);

(async () => {
  console.log("records:", records.length, DRY ? "(DRY RUN)" : "");
  const login = await fetch(`${BASE}/api/users/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@laptop.com", password: "admin123" }),
  }).then((r) => r.json());
  const token = (login.data || login)?.accessToken;
  if (!token) return console.log("LOGIN FAILED");
  console.log("login OK");
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
  const imp = await call("/api/translations/admin/products/import", {
    records,
    idempotencyKey: `nov08-fix5-${Date.now()}`,
    assistantBatch: true,
    dryRun: DRY,
  });
  const dd = imp.data?.data;
  console.log(
    `import: HTTP ${imp.status}`,
    dd ? JSON.stringify(dd).slice(0, 300) : imp.text.slice(0, 200),
  );
  if (DRY) return;
  const ap = await call(
    "/api/translations/admin/products/assistant-approve-batch",
    {
      records: records.map(({ productId, targetLang }) => ({
        productId,
        targetLang,
      })),
      confirmInconsistent: true,
      note: "nov08 5-slot fix: false-positive bigram leaks resolved by rephrasing (de CPU, RTX du, Switch su, la RAM).",
    },
  );
  const a = ap.data?.data;
  console.log(
    `approve: HTTP ${ap.status}`,
    a
      ? `approved=${a.approvedCount} already=${a.alreadyApprovedCount} skipped=${a.skippedCount}`
      : ap.text.slice(0, 200),
  );
  for (const r of a?.results || [])
    if (r.status === "skipped")
      console.log(`  skipped ${r.productId}/${r.targetLang}: ${r.reason}`);
})().catch((e) => console.error("FATAL:", e.message));
