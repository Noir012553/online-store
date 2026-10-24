/**
 * API tooltip tiện dụng để chạy script manual-product-translation.js "cùng lúc"
 * với một lần kết nối MongoDB trực tiếp.
 *
 * Lý do: validator của project gọi `LiveTranslationCache.findOne()` cho từng field
 * (checkInconsistency). Khi chạy script import trong process riêng, mongoose có thể
 * không nối lại được DB trong thời gian ngắn; tooltip này giữ kết nối sống trong
 * process dùng chung để validator luôn truy vấn được.
 *
 * Cách dùng: `node scripts/run-with-live-db.js -- <args của manual-product-translation.js>`
 * File này KHÔNG tự ghi dữ liệu; toàn bộ logic vẫn nằm trong manual-product-translation.js.
 */
const path = require("node:path");
const { spawn } = require("node:child_process");
const mongoose = require("mongoose");

require("dotenv").config({
  path: path.resolve(__dirname, "../.env"),
  quiet: true,
});

const args = process.argv.slice(2);
const separatorIndex = args.indexOf("--");
const scriptArgs = separatorIndex >= 0 ? args.slice(separatorIndex + 1) : args;

const run = async () => {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not configured");
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 15000,
  });
  console.log(
    `[run-with-live-db] connected to database "${mongoose.connection.db.databaseName}" (read-only keepalive)`,
  );
  try {
    const exitCode = await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [path.join(__dirname, "manual-product-translation.js"), ...scriptArgs],
        { stdio: "inherit", env: process.env },
      );
      child.on("error", reject);
      child.on("close", (code) => resolve(code));
    });
    process.exitCode = exitCode ?? 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
};

run().catch((error) => {
  console.error(`[run-with-live-db] ${error.name}: ${error.message}`);
  process.exitCode = 1;
});
