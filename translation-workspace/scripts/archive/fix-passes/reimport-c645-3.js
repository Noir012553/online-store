// Re-import + approve the 3 fixed c645 slots (fr/pt/sv).
// Usage: node scripts/reimport-c645-3.js [--apply] [--shutdown]
const fs = require("fs");
const path = require("path");
const BASE = process.env.BASE_URL || "http://localhost:5000";
const APPLY = process.argv.includes("--apply");
const SHUTDOWN = process.argv.includes("--shutdown");
const src = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "..", "logs", "c645-3records.json"),
    "utf8",
  ),
);
const records = src.records;

(async () => {
  console.log("records:", records.length, APPLY ? "(APPLY)" : "(DRY RUN)");
  const login = await fetch(`${BASE}/api/users/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@laptop.com", password: "admin123" }),
  }).then((r) => r.json());
  const token = (login.data || login)?.accessToken;
  if (!token) {
    console.log("LOGIN FAILED");
    process.exitCode = 1;
    return;
  }
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
  try {
    const imp = await call("/api/translations/admin/products/import", {
      records,
      idempotencyKey: `nov09-c645-${Date.now()}`,
      assistantBatch: true,
      dryRun: !APPLY,
    });
    const dd = imp.data?.data;
    console.log(
      `import: HTTP ${imp.status}`,
      dd ? JSON.stringify(dd).slice(0, 300) : imp.text.slice(0, 200),
    );
    if (!APPLY) {
      console.log("DRY RUN OK — pass --apply to write.");
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
        note: "nov09 c645 fr/pt/sv fix: adjacent AKKO 5108 bigram restored, full technical token parity (1.41kg, 8000Hz, 125Hz, dimensions, 100%), VN leak false-positive 'do AKKO' rephrased.",
      },
    );
    const a = ap.data?.data;
    console.log(
      `approve: HTTP ${ap.status}`,
      a
        ? `app=${a.approvedCount} already=${a.alreadyApprovedCount} skip=${a.skippedCount}`
        : ap.text.slice(0, 200),
    );
    for (const r of a?.results || [])
      if (r.status === "skipped")
        console.log(
          `  skipped ${r.productId?.slice(-4)}/${r.targetLang}: ${r.reason}`,
        );
  } finally {
    if (SHUTDOWN) {
      console.log("shutdown: killing backend on :5000 ...");
      try {
        const { execSync } = require("child_process");
        const out = execSync(
          'powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 5000 -State Listen | Select-Object -ExpandProperty OwningProcess -Unique"',
          { encoding: "utf8" },
        );
        for (const pid of out
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean)) {
          try {
            process.kill(Number(pid));
            console.log("killed pid", pid);
          } catch {}
        }
      } catch (e) {
        console.log("shutdown error:", e.message.split("\n")[0]);
      }
    }
  }
})().catch((e) => {
  console.error("FATAL:", e.message);
  process.exitCode = 1;
});
