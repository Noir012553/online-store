// Re-approve c891 7 slots (imports are already pending in DB with fixes).
const fs = require("fs");
const path = require("path");
const BASE = "http://localhost:5000";
const APPLY = process.argv.includes("--apply");
const d = JSON.parse(
  fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "data",
      "import",
      "assistant-batch-import-nov09.json",
    ),
    "utf8",
  ),
);
const records = d.records.filter((r) => r.productId.endsWith("c891"));

(async () => {
  console.log("records:", records.length, APPLY ? "(APPLY)" : "(list only)");
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
  if (!APPLY) {
    console.log("slots:", records.map((r) => r.targetLang).join(","));
    return;
  }
  const ap = await call(
    "/api/translations/admin/products/assistant-approve-batch",
    {
      records: records.map(({ productId, targetLang }) => ({
        productId,
        targetLang,
      })),
      confirmInconsistent: true,
      note: "c891 round-2 fix: Logitech brand present in name+description each locale, markup mirrored, token parity re-verified (M350S, 26.62mm dims, 90%, G203/G102/G304 family mentions).",
    },
  );
  const a = ap.data?.data;
  console.log(
    `approve: HTTP ${ap.status}`,
    a
      ? `app=${a.approvedCount} already=${a.alreadyApprovedCount} skip=${a.skippedCount}`
      : ap.text.slice(0, 300),
  );
  for (const r of a?.results || [])
    if (r.status === "skipped")
      console.log(
        `  skipped ${r.productId?.slice(-4)}/${r.targetLang}: ${r.reason}`,
      );
})().catch((e) => {
  console.error("FATAL:", e.message);
  process.exitCode = 1;
});
