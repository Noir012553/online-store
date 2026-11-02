// Temporary diagnosis: replicate the FULL failing import (dryRun=false => REAL WRITE).
// Disabled by default: set DIAG_REAL=1 to actually run it.
const path = require("path");
require(
  path.join(
    __dirname,
    "..",
    "..",
    "online-store-backend",
    "node_modules",
    "dotenv",
  ),
).config({
  path: path.join(__dirname, "..", "..", "online-store-backend", ".env"),
  quiet: true,
});
const mongoose = require(
  path.join(
    __dirname,
    "..",
    "..",
    "online-store-backend",
    "node_modules",
    "mongoose",
  ),
);
const b = require(
  path.join(
    __dirname,
    "..",
    "data",
    "import",
    "assistant-batch-import-next.json",
  ),
);

(async () => {
  if (process.env.DIAG_REAL !== "1") {
    console.log("DIAG_REAL!=1 : no call performed (safe mode)");
    return;
  }
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
  });
  const login = await fetch("http://localhost:5000/api/users/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@laptop.com", password: "admin123" }),
  }).then((r) => r.json());
  const token = (login.data || login)?.accessToken;
  if (!token) {
    console.log("LOGIN FAILED", JSON.stringify(login).slice(0, 300));
    process.exit(1);
  }
  console.log("login OK");

  // Use the same persisted chunk keys as the UI flow, in chunks of 10
  const CHUNK = 10;
  const chunks = [];
  for (let start = 0; start < b.records.length; start += CHUNK) {
    chunks.push({
      records: b.records.slice(start, start + CHUNK),
      idempotencyKey: `diag-real-${Date.now()}-${start}`,
    });
  }

  for (const [index, chunk] of chunks.entries()) {
    const startedAt = Date.now();
    const res = await fetch(
      "http://localhost:5000/api/translations/admin/products/import",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ...chunk, assistantBatch: true, dryRun: false }),
        credentials: "include",
      },
    );
    const text = await res.text();
    console.log(
      `chunk ${index + 1}/${chunks.length}: STATUS ${res.status} ${Date.now() - startedAt}ms ${text.slice(0, 220)}`,
    );
    if (res.status >= 500) {
      console.log("Stopped on first 5xx.");
      break;
    }
    await new Promise((r) => setTimeout(r, 800));
  }

  await mongoose.disconnect();
})().catch((e) => {
  console.error("ERR:", e.message);
  process.exit(1);
});
