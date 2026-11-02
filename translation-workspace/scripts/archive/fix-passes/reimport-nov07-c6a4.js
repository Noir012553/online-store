// Re-import + approve only the c6a4 slots that failed with missing_brand.
const fs = require("fs");
const path = require("path");
const BASE = process.env.BASE_URL || "http://localhost:5000";
const IMPORT = path.join(
  __dirname,
  "..",
  "data",
  "import",
  "assistant-batch-import-nov07.json",
);
const DRY = process.env.DRY_RUN === "1";

const d = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
// find records whose productId contains c6a4 or log all with Asus issues — use product ids logged earlier
const targets = d.records.filter((r) => {
  const t = r.translations;
  return t.brand === "ASUS" && !/\bAsus\b/.test(t.description || "");
});
console.log("candidate ASUS-clean records:", targets.length);
// Filter to only the 5 product ids of interest (logged from preflight c6a4)
const IDS = [...new Set(
  JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "..", "logs", "nov07-c6a4-targets.json"),
      "utf8",
    ),
  ),
)];
const records = targets.filter((r) => IDS.includes(r.productId));
const matchedProducts = [...new Set(records.map((r) => r.productId))];
console.log(
  "matched:", records.length, "records,",
  matchedProducts.length, "of", IDS.length, "product ids",
);
if (
  matchedProducts.length !== IDS.length ||
  records.length < IDS.length
) {
  console.log("MISMATCH — aborting");
  process.exit(1);
}

(async () => {
  const login = await fetch(`${BASE}/api/users/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@laptop.com", password: "admin123" }),
  }).then((r) => r.json());
  const token = (login.data || login)?.accessToken;
  if (!token) return console.log("LOGIN FAILED");
  console.log("login OK", DRY ? "(DRY RUN)" : "");

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
    idempotencyKey: `nov07-c6a4-fix-${Date.now()}`,
    assistantBatch: true,
    dryRun: DRY,
  });
  const dd = imp.data?.data;
  console.log(
    `import: HTTP ${imp.status}`,
    dd ? JSON.stringify(dd).slice(0, 400) : imp.text.slice(0, 200),
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
      note: "nov07 c6a4 fix: description Asus→ASUS corrected, re-imported, preflight blocking errors resolved.",
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
