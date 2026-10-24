// Explains WHY "assistant approve batch" skips records, by repeating what the
// admin UI does (import dry-run -> real import -> approve) and printing the
// backend's per-record `reason` for every skipped record.
//
//   node scripts/diagnose-approve.js                 # against frontend :3000
//   DRY=1 node scripts/diagnose-approve.js           # preview only, no writes
const fs = require("fs");
const path = require("path");

const FILE =
  process.env.FILE ||
  path.join(
    __dirname,
    "..",
    "data",
    "import",
    "assistant-batch-import-10-products.json",
  );
const BASE = process.env.BASE_URL || "http://localhost:3000";
const CHUNK = Number(process.env.CHUNK) || 10;
const DRY_ONLY = process.env.DRY === "1";

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

  const login = await fetch(`${BASE}/api/users/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "superadmin@laptop.com",
      password: "superadmin123",
    }),
  }).then((r) => r.json());
  const token = (login.data || login).accessToken;
  if (!token) {
    console.log("LOGIN FAILED", JSON.stringify(login).slice(0, 300));
    return;
  }
  console.log(
    `target ${BASE} | records ${records.length} | chunks of ${CHUNK} | dryOnly ${DRY_ONLY}`,
  );

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
    } catch {
      /* proxy returned non-JSON */
    }
    return { status: res.status, data, text, ms: Date.now() - startedAt };
  };

  // 1) preview, exactly like the file input in the admin page
  for (const [index, chunk] of slice(records, CHUNK).entries()) {
    const res = await call("/api/translations/admin/products/import", {
      records: chunk,
      idempotencyKey: `assistant-batch-prev-${Date.now()}-${index}`,
      assistantBatch: true,
      dryRun: true,
    });
    const d = res.data?.data;
    console.log(
      `preview ${index + 1}: HTTP ${res.status} ${res.ms}ms ${d ? `valid=${d.validRecords} insert=${d.wouldInsert} update=${d.wouldUpdate} skip=${d.wouldSkip}` : res.text.slice(0, 120)}`,
    );
  }
  if (DRY_ONLY) return;

  // 2) real import
  for (const [index, chunk] of slice(records, CHUNK).entries()) {
    const res = await call("/api/translations/admin/products/import", {
      records: chunk,
      idempotencyKey: `assistant-batch-imp-${Date.now()}-${index}`,
      assistantBatch: true,
      dryRun: false,
    });
    console.log(
      `import  ${index + 1}: HTTP ${res.status} ${res.ms}ms ${res.data?.data ? `imported=${res.data.data.importedCount}` : res.text.slice(0, 120)}`,
    );
  }

  // 3) approve
  const reasons = {};
  for (const [index, chunk] of slice(records, CHUNK).entries()) {
    const res = await call(
      "/api/translations/admin/products/assistant-approve-batch",
      {
        records: chunk.map(({ productId, targetLang }) => ({
          productId,
          targetLang,
        })),
        confirmInconsistent: true,
        note: "Admin explicitly accepted inconsistency during batch approval",
      },
    );
    const d = res.data?.data;
    if (!d) {
      console.log(
        `approve ${index + 1}: HTTP ${res.status} ${res.text.slice(0, 160)}`,
      );
      continue;
    }
    console.log(
      `approve ${index + 1}: HTTP ${res.status} ${res.ms}ms approved=${d.approvedCount} already=${d.alreadyApprovedCount} skipped=${d.skippedCount}`,
    );
    for (const r of d.results || []) {
      if (r.status === "skipped") {
        const key = r.reason || "unknown";
        (reasons[key] ||= []).push(`${r.productId}/${r.targetLang}`);
      }
    }
  }

  console.log("\n--- skipped reasons ---");
  if (Object.keys(reasons).length === 0)
    console.log("none: every record was approved or already approved");
  for (const [reason, list] of Object.entries(reasons)) {
    console.log(`${reason}: ${list.length}`);
    list.slice(0, 60).forEach((item) => console.log("   -", item));
  }
})();
