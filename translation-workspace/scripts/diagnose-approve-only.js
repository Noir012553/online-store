// Approves the records of a batch file that are already imported, and prints
// the backend's per-record reason for anything it skips. Run after the import
// step (diagnose-approve.js) — this never writes translations, only approvals.
//
//   node scripts/diagnose-approve-only.js
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

const slice = (arr, size) =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, (i + 1) * size),
  );

(async () => {
  const records = JSON.parse(fs.readFileSync(FILE, "utf8")).records.map(
    ({ productId, targetLang }) => ({ productId, targetLang }),
  );

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

  const totals = { approved: 0, already: 0, skipped: 0, failed: 0 };
  const reasons = {};

  for (const [index, chunk] of slice(records, CHUNK).entries()) {
    const startedAt = Date.now();
    let res;
    let data = null;
    try {
      res = await fetch(
        `${BASE}/api/translations/admin/products/assistant-approve-batch`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            records: chunk,
            confirmInconsistent: true,
            note: "Admin explicitly accepted inconsistency during batch approval",
          }),
        },
      );
      const text = await res.text();
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
      if (!data) {
        console.log(
          `approve ${index + 1}: HTTP ${res.status} non-JSON ${text.slice(0, 100)}`,
        );
        totals.failed += chunk.length;
        continue;
      }
    } catch (error) {
      console.log(`approve ${index + 1}: network error ${error.message}`);
      totals.failed += chunk.length;
      continue;
    }

    const d = data.data;
    if (!res.ok || !d) {
      console.log(
        `approve ${index + 1}: HTTP ${res.status} ${data?.message || ""}`,
      );
      totals.failed += chunk.length;
      continue;
    }
    totals.approved += d.approvedCount || 0;
    totals.already += d.alreadyApprovedCount || 0;
    totals.skipped += d.skippedCount || 0;
    console.log(
      `approve ${index + 1}: HTTP ${res.status} ${Date.now() - startedAt}ms approved=${d.approvedCount} already=${d.alreadyApprovedCount} skipped=${d.skippedCount}`,
    );

    for (const r of d.results || []) {
      if (r.status === "skipped") {
        const key =
          r.reason || (r.overriddenErrors || []).join(",") || "unknown";
        (reasons[key] ||= []).push(`${r.productId}/${r.targetLang}`);
      }
    }
  }

  console.log(
    `\nTOTAL approved=${totals.approved} alreadyApproved=${totals.already} pending=${totals.skipped} failed=${totals.failed}`,
  );
  console.log("--- skipped reasons ---");
  if (Object.keys(reasons).length === 0) console.log("none");
  for (const [reason, list] of Object.entries(reasons)) {
    console.log(`${reason}: ${list.length}`);
    list.forEach((item) => console.log("   -", item));
  }
})();
