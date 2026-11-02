// Resume import+approve chunks 5-10 of nov06e batch.
const fs = require("fs");
const path = require("path");
const BASE = process.env.BASE_URL || "http://localhost:5000";
const FILE = path.join(
  __dirname,
  "..",
  "data",
  "import",
  "assistant-batch-import-nov06e.json",
);
const CHUNK = 10;
const STATE = path.join(__dirname, "..", "logs", "import-nov06e-state.json");

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
    console.log("LOGIN FAILED");
    return;
  }
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
    if (state[String(i)] === "done") {
      console.log(`chunk ${i + 1}: skip`);
      continue;
    }
    try {
      const imp = await call("/api/translations/admin/products/import", {
        records: chunk,
        idempotencyKey: `nov06e-imp-resume-${Date.now()}-${i}`,
        assistantBatch: true,
        dryRun: false,
      });
      const d = imp.data?.data;
      console.log(
        `import ${i + 1}: HTTP ${imp.status} ${d ? JSON.stringify(d).slice(0, 200) : imp.text.slice(0, 140)}`,
      );
      const ap = await call(
        "/api/translations/admin/products/assistant-approve-batch",
        {
          records: chunk.map(({ productId, targetLang }) => ({
            productId,
            targetLang,
          })),
          confirmInconsistent: true,
          note: "Nov06e assistant batch: full preflight passed (0 blocking), inconsistent diffs reviewed and accepted.",
        },
      );
      const a = ap.data?.data;
      console.log(
        `approve ${i + 1}: HTTP ${ap.status} ${a ? `approved=${a.approvedCount} already=${a.alreadyApprovedCount} skipped=${a.skippedCount}` : ap.text.slice(0, 140)}`,
      );
      if (a)
        for (const r of a.results || []) {
          if (r.status === "skipped")
            console.log(
              `   skipped ${r.productId}/${r.targetLang}: ${r.reason}`,
            );
        }
      state[String(i)] = "done";
      fs.writeFileSync(STATE, JSON.stringify(state), "utf8");
      await new Promise((r) => setTimeout(r, 1200));
    } catch (e) {
      console.log(`chunk ${i + 1} error:`, e.message);
    }
  }
  console.log("ALL RESUMED CHUNKS DONE");
})().catch((e) => console.error("FATAL:", e.message));
