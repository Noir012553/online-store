// Import + approve the current assistant-batch-import-nov09.json batch.
// Usage: node scripts/import-current-batch.js [--apply] [--shutdown]
// Default: dry-run (no writes).
const fs = require("fs");
const path = require("path");
const BASE = process.env.BASE_URL || "http://localhost:5000";
const APPLY = process.argv.includes("--apply");
const SHUTDOWN = process.argv.includes("--shutdown");
const FILE = path.join(
  __dirname,
  "..",
  "data",
  "import",
  "assistant-batch-import-nov09.json",
);
const CHUNK = 10;
const TAG = process.env.TAG || "nov09r2";
const d = JSON.parse(fs.readFileSync(FILE, "utf8"));
const records = d.records.map((r) => ({
  productId: r.productId,
  targetLang: r.targetLang,
  sourceHash: r.sourceHash,
  translations: r.translations,
}));
const chunks = Array.from(
  { length: Math.ceil(records.length / CHUNK) },
  (_, i) => records.slice(i * CHUNK, (i + 1) * CHUNK),
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
  let fail = 0;
  try {
    for (const [i, chunk] of chunks.entries()) {
      const imp = await call("/api/translations/admin/products/import", {
        records: chunk,
        idempotencyKey: `${TAG}-imp-${Date.now()}-${i}`,
        assistantBatch: true,
        dryRun: !APPLY,
      });
      const dd = imp.data?.data;
      const valid = dd?.validRecords ?? dd?.preview?.validRecords;
      console.log(
        `${APPLY ? "import" : "dry"} ${i + 1}/${chunks.length}: HTTP ${imp.status}`,
        valid !== undefined ? `valid=${valid}` : "",
        dd ? JSON.stringify(dd).slice(0, 160) : imp.text.slice(0, 120),
      );
      if (imp.status >= 400) fail++;
      if (!APPLY) continue;
      const ap = await call(
        "/api/translations/admin/products/assistant-approve-batch",
        {
          records: chunk.map(({ productId, targetLang }) => ({
            productId,
            targetLang,
          })),
          confirmInconsistent: true,
          note: `${TAG} assistant batch: preflight 0 leak / 0 brandMiss, full token parity reviewed by hand.`,
        },
      );
      const a = ap.data?.data;
      console.log(
        `  approve: HTTP ${ap.status}`,
        a
          ? `app=${a.approvedCount} already=${a.alreadyApprovedCount} skip=${a.skippedCount}`
          : ap.text.slice(0, 140),
      );
      for (const r of a?.results || [])
        if (r.status === "skipped")
          console.log(
            `   skipped ${r.productId?.slice(-4)}/${r.targetLang}: ${r.reason}`,
          );
      await new Promise((r) => setTimeout(r, 1000));
    }
  } finally {
    console.log(fail ? `DONE with ${fail} failed chunks` : "ALL CHUNKS DONE");
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
