// Re-run full import + approve for nov09 batch (208 records), chunked,
// with resume state. Per chunk: import (assistantBatch) then approve.
const fs = require("fs");
const path = require("path");
const BASE = process.env.BASE_URL || "http://localhost:5000";
const FILE = path.join(
  __dirname,
  "..",
  "data",
  "import",
  "assistant-batch-import-nov09.json",
);
const CHUNK = 8;
const STATE = path.join(
  __dirname,
  "..",
  "logs",
  "import-nov09-full-state.json",
);
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
  try {
    state = JSON.parse(fs.readFileSync(STATE, "utf8"));
  } catch {}

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
  console.log("login OK", DRY ? "(DRY)" : "", "chunks:", chunks.length);

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

  for (const [i, chunk] of chunks.entries()) {
    if (!DRY && state[i] === "done") {
      console.log(`chunk ${i + 1}: done, skip`);
      continue;
    }
    try {
      const imp = await call("/api/translations/admin/products/import", {
        records: chunk,
        idempotencyKey: `nov09full-${Date.now()}-${i}`,
        assistantBatch: true,
        dryRun: DRY,
      });
      const d = imp.data?.data;
      console.log(
        `import ${i + 1}: HTTP ${imp.status} ${d ? JSON.stringify(d).slice(0, 220) : imp.text.slice(0, 120)}`,
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
          note: "nov09 assistant batch: full preflight 0 blocking; accepted-diff records reviewed (false-positive bigrams resolved contextually).",
        },
      );
      const a = ap.data?.data;
      console.log(
        `approve ${i + 1}: HTTP ${ap.status} ${a ? `app=${a.approvedCount} already=${a.alreadyApprovedCount} skip=${a.skippedCount}` : ap.text.slice(0, 120)}`,
      );
      for (const r of a?.results || [])
        if (r.status === "skipped")
          console.log(
            `  skipped ${r.productId?.slice(-4)}/${r.targetLang}: ${r.reason}`,
          );
      state[i] = "done";
      fs.writeFileSync(STATE, JSON.stringify(state), "utf8");
    } catch (e) {
      console.log(`chunk ${i + 1} error: ${e.message}`);
      state[i] = "retry";
      fs.writeFileSync(STATE, JSON.stringify(state), "utf8");
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  console.log(DRY ? "DRY DONE" : "ALL DONE");
})().catch((e) => console.error("FATAL:", e.message));
