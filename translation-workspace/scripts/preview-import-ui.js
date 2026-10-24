// Replays the admin "AI assistant batch preview" step
// (handleAssistantBatchFile in src/pages/admin/translationsDynamic.tsx)
// against the running frontend, so the exact request the browser sends can be
// timed and inspected from the terminal.
//
// Usage:
//   node scripts/preview-import-ui.js                 # through http://localhost:3000
//   BASE_URL=http://localhost:5000 node scripts/preview-import-ui.js  # backend direct
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
const CHUNK = Number(process.env.CHUNK) || 10; // ASSISTANT_BATCH_RECORDS_PER_CHUNK in the admin page
const MIN_CHUNK = 2; // ASSISTANT_BATCH_MIN_RECORDS_PER_CHUNK in the admin page
const SUPPORTED = ["vi", "en", "pt", "fr", "de", "it", "es", "nl", "sv"];
const DEFAULT_LOCALE = "vi";

(async () => {
  let raw = fs.readFileSync(FILE, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  const parsed = JSON.parse(raw);
  if (
    parsed.workflow !== "assistant_batch" ||
    !Array.isArray(parsed.records) ||
    parsed.records.length === 0
  ) {
    console.log(
      'invalid file: expected { workflow: "assistant_batch", records: [...] }',
    );
    return;
  }
  console.log(
    `file: ${path.basename(FILE)} | records: ${parsed.records.length} | target: ${BASE}`,
  );

  const problems = [];
  parsed.records.forEach((record, index) => {
    if (!/^[a-f\d]{24}$/i.test(record?.productId || ""))
      problems.push(`#${index} productId`);
    if (!SUPPORTED.includes(record?.targetLang))
      problems.push(`#${index} targetLang=${record?.targetLang}`);
    if (record.targetLang === DEFAULT_LOCALE)
      problems.push(`#${index} targetLang is default locale`);
    if (!/^[a-f\d]{64}$/i.test(record?.sourceHash || ""))
      problems.push(`#${index} sourceHash`);
    if (
      !record?.translations ||
      typeof record.translations !== "object" ||
      Array.isArray(record.translations)
    ) {
      problems.push(`#${index} translations`);
    }
  });
  if (problems.length > 0) {
    console.log("client-side validation would reject this file:");
    problems.forEach((problem) => console.log("  -", problem));
    return;
  }

  const loginRes = await fetch(`${BASE}/api/users/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "superadmin@laptop.com",
      password: "superadmin123",
    }),
  });
  const login = await loginRes.json().catch(() => null);
  const token =
    (login?.data || login)?.accessToken || (login?.data || login)?.token;
  if (!token) {
    console.log(
      `LOGIN FAILED (${loginRes.status}): ${login?.message || "no access token"}`,
    );
    return;
  }

  const records = parsed.records.map((r) => ({
    productId: r.productId,
    targetLang: r.targetLang,
    sourceHash: r.sourceHash,
    translations: r.translations,
  }));
  let aggregate = {
    totalRecords: 0,
    validRecords: 0,
    wouldInsert: 0,
    wouldUpdate: 0,
    wouldSkip: 0,
  };
  let failed = false;

  let chunkSize = CHUNK;
  for (let start = 0; start < records.length; ) {
    const chunk = records.slice(start, start + chunkSize);
    const body = JSON.stringify({
      records: chunk,
      idempotencyKey: `assistant-batch-${Date.now()}-${start}-${Math.random().toString(36).slice(2)}`,
      assistantBatch: true,
      dryRun: true,
    });
    const startedAt = Date.now();
    let res;
    try {
      res = await fetch(`${BASE}/api/translations/admin/products/import`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body,
      });
    } catch (error) {
      failed = true;
      console.log(
        `chunk ${start + 1}-${start + chunk.length}: network error after ${Date.now() - startedAt}ms - ${error.message}`,
      );
      continue;
    }
    const elapsed = Date.now() - startedAt;
    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      /* non-JSON body */
    }
    console.log(
      `chunk ${start + 1}-${start + chunk.length} | ${Buffer.byteLength(body)} bytes | ${elapsed}ms | HTTP ${res.status}`,
    );
    if (!res.ok) {
      // Same recovery as the admin page: a 5xx with no JSON body is the
      // Next.js proxy timing out, so retry these records in smaller batches.
      if (!data && res.status >= 500 && chunk.length > MIN_CHUNK) {
        chunkSize = Math.max(MIN_CHUNK, Math.floor(chunk.length / 2));
        console.log(`  proxy returned ${res.status} without JSON, retrying as batches of ${chunkSize}`);
        continue;
      }
      failed = true;
      const detail = data?.message || text.slice(0, 200);
      console.log("  server said:", detail);
      console.log(
        "  UI would show:",
        data?.message
          ? detail
          : 'assistant_batch_preview_failed ("Không thể kiểm tra gói dịch.")',
      );
      if (data?.params?.records)
        console.log("  invalid records:", JSON.stringify(data.params.records));
      start += chunk.length;
      continue;
    }
    start += chunk.length;
    const d = data?.data || {};
    aggregate = {
      totalRecords: aggregate.totalRecords + (d.totalRecords || 0),
      validRecords: aggregate.validRecords + (d.validRecords || 0),
      wouldInsert: aggregate.wouldInsert + (d.wouldInsert || 0),
      wouldUpdate: aggregate.wouldUpdate + (d.wouldUpdate || 0),
      wouldSkip: aggregate.wouldSkip + (d.wouldSkip || 0),
    };
  }

  console.log("aggregate preview:", aggregate);
  if (failed) {
    console.log(
      'RESULT: preview FAILED (that is the "Không thể kiểm tra gói dịch." screen)',
    );
    process.exitCode = 1;
  } else {
    console.log("RESULT: preview OK, the batch can be imported");
  }
})();
