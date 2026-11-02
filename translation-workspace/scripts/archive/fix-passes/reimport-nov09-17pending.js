// Re-import + approve the 17 pending nov09 records (c645 fr/pt/sv, c6c8 de/en/fr/pt/es/sv, c6ca de/en/fr/it/es/nl/pt/sv).
// Usage:
//   node scripts/reimport-nov09-17pending.js              (dry-run: import preview only)
//   node scripts/reimport-nov09-17pending.js --apply      (real import + approve)
//   node scripts/reimport-nov09-17pending.js --apply --shutdown  (also stops the node backend when done)
const fs = require("fs");
const path = require("path");
const BASE = process.env.BASE_URL || "http://localhost:5000";
const IMPORT = path.join(
  __dirname,
  "..",
  "data",
  "import",
  "assistant-batch-import-nov09.json",
);
const APPLY = process.argv.includes("--apply");
const SHUTDOWN = process.argv.includes("--shutdown");
const d = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const TAILS = {
  c645: ["fr", "pt", "sv"],
  c6c8: ["de", "en", "fr", "pt", "es", "sv"],
  c6ca: ["de", "en", "fr", "it", "es", "nl", "pt", "sv"],
};
const records = d.records.filter((r) =>
  (TAILS[r.productId.slice(-4)] || []).includes(r.targetLang),
);

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
      idempotencyKey: `nov09-17p-${Date.now()}`,
      assistantBatch: true,
      dryRun: !APPLY,
    });
    const dd = imp.data?.data;
    console.log(
      `import: HTTP ${imp.status}`,
      dd ? JSON.stringify(dd).slice(0, 400) : imp.text.slice(0, 200),
    );
    if (dd && dd.validRecords === 0) {
      console.log("ABORT: 0 valid records");
      process.exitCode = 1;
      return;
    }
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
        note: "nov09 17-pending fix: CPI &lt;1% markup restored, AKKO 5108 / TUF M4 entity mentions added per source structure; accepted-diff reviewed.",
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
      console.log("shutdown requested — killing node backend on :5000 ...");
      try {
        const { execSync } = require("child_process");
        const out = execSync(
          'powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 5000 -State Listen | Select-Object -ExpandProperty OwningProcess -Unique"',
          { encoding: "utf8" },
        );
        const pids = out
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean);
        for (const pid of pids) {
          try {
            process.kill(Number(pid));
            console.log("killed pid", pid);
          } catch (e) {
            console.log("kill fail", pid, e.message);
          }
        }
        if (!pids.length) console.log("no listener on :5000");
      } catch (e) {
        console.log("shutdown error:", e.message.split("\n")[0]);
      }
    }
  }
})().catch((e) => {
  console.error("FATAL:", e.message);
  process.exitCode = 1;
});
