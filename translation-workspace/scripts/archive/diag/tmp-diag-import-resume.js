// Temporary diagnosis: resume the chunked REAL import (skips nothing; keys are timestamped so always fresh).
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
const CHUNK = 10;
const START = Number(process.env.DIAG_START || "0");

(async () => {
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
    console.log("LOGIN FAILED");
    process.exit(1);
  }

  for (let start = START; start < b.records.length; start += CHUNK) {
    const startedAt = Date.now();
    const res = await fetch(
      "http://localhost:5000/api/translations/admin/products/import",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          records: b.records.slice(start, start + CHUNK),
          idempotencyKey: `diag-real2-${Date.now()}-${start}`,
          assistantBatch: true,
          dryRun: false,
        }),
        credentials: "include",
      },
    );
    const text = await res.text();
    console.log(
      `chunk ${start}-${Math.min(start + CHUNK, b.records.length)}: STATUS ${res.status} ${Date.now() - startedAt}ms ${text.slice(0, 200)}`,
    );
    if (res.status >= 500) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  await mongoose.disconnect();
  console.log("DONE");
})().catch((e) => {
  console.error("ERR:", e.message);
  process.exit(1);
});
