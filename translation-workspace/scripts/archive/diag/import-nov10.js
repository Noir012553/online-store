// Import + approve the nov10 batch (40 records / 5 final products).
// Usage: node scripts/import-nov10.js [--apply] [--shutdown]
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
  "assistant-batch-import-nov10.json",
);
const CHUNK = 10;
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
  try {
    for (const [i, chunk] of chunks.entries()) {
      const imp = await call("/api/translations/admin/products/import", {
        records: chunk,
        idempotencyKey: `nov10-imp-${Date.now()}-${i}`,
        assistantBatch: true,
        dryRun: !APPLY,
      });
      const dd = imp.data?.data;
      console.log(
        `${APPLY ? "import" : "dry"} ${i + 1}/${chunks.length}: HTTP ${imp.status}`,
        dd ? JSON.stringify(dd).slice(0, 140) : imp.text.slice(0, 120),
      );
      if (imp.status >= 400) continue;
      if (!APPLY) continue;
      const ap = await call(
        "/api/translations/admin/products/assistant-approve-batch",
        {
          records: chunk.map(({ productId, targetLang }) => ({
            productId,
            targetLang,
          })),
          confirmInconsistent: true,
          note: "nov10 final batch: full token parity (2.4G, 600mA, 180mA @37V, 3.7V/4.2V, 4.0mm, +1 mm, 916g/935g), markup mirrored, brands preserved.",
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
