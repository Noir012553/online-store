// Re-import + approve the 9 fixed pending records of nov06c.
const fs = require("fs");
const path = require("path");
const BASE = process.env.BASE_URL || "http://localhost:5000";
const FILE = path.join(
  __dirname,
  "..",
  "data",
  "import",
  "assistant-batch-import-nov06c.json",
);
const TARGETS = [
  ["6ad0cc010069aece85a8c638", "en"],
  ["6ad0cc010069aece85a8c639", "en"],
  ["6ad0cc440069aece85a8c654", "it"],
  ["6ad0cc440069aece85a8c658", "it"],
  ["6ad0ce6e0069aece85a8c6be", "it"],
  ["6ad0ce6e0069aece85a8c6c0", "en"],
  ["6ad0ce6e0069aece85a8c6c1", "nl"],
  ["6ad0ce6e0069aece85a8c6c2", "it"],
  ["6ad0cff40069aece85a8c6f8", "it"],
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
    console.log("count mismatch, abort");
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

  const imp = await call("/api/translations/admin/products/import", {
    records,
    idempotencyKey: `nov06c-fix-${Date.now()}`,
    assistantBatch: true,
    dryRun: false,
  });
  const d = imp.data?.data;
  console.log(
    `re-import: HTTP ${imp.status} ${imp.ms}ms ${d ? JSON.stringify(d).slice(0, 200) : imp.text.slice(0, 160)}`,
  );

  const ap = await call(
    "/api/translations/admin/products/assistant-approve-batch",
    {
      records: records.map(({ productId, targetLang }) => ({
        productId,
        targetLang,
      })),
      confirmInconsistent: true,
      note: "Nov06c fix pass: brand tokens restored, markup and leak-free bigrams verified, specs keys filled verbatim. Inconsistent diffs reviewed.",
    },
  );
  const a = ap.data?.data;
  console.log(
    `approve: HTTP ${ap.status} ${ap.ms}ms ${a ? JSON.stringify(a).slice(0, 400) : ap.text.slice(0, 160)}`,
  );
  if (a)
    for (const r of a.results || [])
      console.log(
        `  ${r.status} ${r.productId.slice(-4)}/${r.targetLang} ${r.reason || ""}`,
      );
})().catch((e) => console.error("FATAL:", e.message));
