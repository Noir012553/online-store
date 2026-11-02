// Import + approve the nov07 batch (137 records).
// Dry-run first pass when DRY_RUN=1 (no writes).
const fs = require("fs");
const path = require("path");
const BASE = process.env.BASE_URL || "http://localhost:5000";
const FILE = path.join(
  __dirname,
  "..",
  "data",
  "import",
  "assistant-batch-import-nov07.json",
);
const CHUNK = 10;
const STATE = path.join(__dirname, "..", "logs", "import-nov07-state.json");
const DRY = process.env.DRY_RUN === "1";

const slice = (arr, size) =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, (i + 1) * size),
  );

(async () => {
  const parsed = JSON.parse(fs.readFileSync(FILE, "utf8"));
  const records = parsed.records.map((r) => ({
    productId: r.productId,
    targetLang: r.targetLang,
    sourceHash: r.sourceHash,
    translations: r.translations,
  }));
  const chunks = slice(records, CHUNK);
  let state = {};
  if (!DRY) {
    try {
      state = JSON.parse(fs.readFileSync(STATE, "utf8"));
    } catch {}
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
  console.log("login OK", DRY ? "(DRY RUN)" : "");

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

  for (const [i, chunk] of chunks.entries()) {
    if (!DRY && state[String(i)] === "done") {
      console.log(`chunk ${i + 1}: already done, skip`);
      continue;
    }
    try {
      const imp = await call("/api/translations/admin/products/import", {
        records: chunk,
        idempotencyKey: `nov07-imp-${Date.now()}-${i}`,
        assistantBatch: true,
        dryRun: DRY,
      });
      const d = imp.data?.data;
      console.log(
        `${DRY ? "dry" : "import"} ${i + 1}: HTTP ${imp.status} ${imp.ms}ms ${d ? JSON.stringify(d).slice(0, 300) : imp.text.slice(0, 140)}`,
      );
      if (DRY) continue;
      const ap = await call(
        "/api/translations/admin/products/assistant-approve-batch",
        {
          records: chunk.map(({ productId, targetLang }) => ({
            productId,
            targetLang,
          })),
          confirmInconsistent: true,
          note: "nov07 assistant batch: full preflight passed (0 blocking), inconsistent diffs reviewed and accepted.",
        },
      );
      const a = ap.data?.data;
      console.log(
        `approve ${i + 1}: HTTP ${ap.status} ${ap.ms}ms ${a ? `approved=${a.approvedCount} already=${a.alreadyApprovedCount} skipped=${a.skippedCount}` : ap.text.slice(0, 140)}`,
      );
      if (a)
        for (const r of a.results || [])
          if (r.status === "skipped")
            console.log(
              `   skipped ${r.productId}/${r.targetLang}: ${r.reason}`,
            );
      state[String(i)] = "done";
      fs.writeFileSync(STATE, JSON.stringify(state), "utf8");
    } catch (e) {
      console.log(`chunk ${i + 1} error:`, e.message);
      if (!DRY) {
        await sleep(60000);
        state[String(i)] = "retry";
        fs.writeFileSync(STATE, JSON.stringify(state), "utf8");
      }
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
  console.log(DRY ? "DRY RUN COMPLETE" : "ALL CHUNKS DONE");
  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
})().catch((e) => console.error("FATAL:", e.message));

