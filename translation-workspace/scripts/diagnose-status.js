// For every record in an assistant batch file, prints what the admin status
// endpoint reports, so records that cannot be approved can be explained.
//
//   node scripts/diagnose-status.js
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

(async () => {
  const records = JSON.parse(fs.readFileSync(FILE, "utf8")).records;
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

  const groups = new Map();
  for (const { productId, targetLang } of records) {
    const key = `${productId}:${targetLang}`;
    (groups.get(targetLang) || groups.set(targetLang, []).get(targetLang)).push(
      { productId, key },
    );
  }

  const summary = {};
  for (const [lang, items] of groups) {
    const productIds = [...new Set(items.map((i) => i.productId))].join(",");
    const res = await fetch(
      `${BASE}/api/translations/admin/products/status?lang=${lang}&productIds=${encodeURIComponent(productIds)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    const data = await res.json().catch(() => null);
    for (const status of data?.data || []) {
      const key = `${status.productId}:${lang}`;
      const bucket = [
        status.status,
        status.canApprove ? "canApprove" : "cannotApprove",
      ].join(" / ");
      (summary[bucket] ||= []).push(key);
      if (!status.canApprove) {
        console.log(`  ${key}`);
        console.log(
          `     status=${status.status} canApprove=${status.canApprove} requiresConfirm=${status.requiresInconsistencyConfirmation}`,
        );
        if (status.validationErrors?.length)
          console.log(
            `     validationErrors: ${status.validationErrors.join(", ")}`,
          );
      }
    }
  }

  console.log("\n--- groups ---");
  for (const [bucket, list] of Object.entries(summary))
    console.log(`${bucket}: ${list.length}`);
})();
