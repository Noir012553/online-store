// Diagnose pending nov06d drafts: read validationErrors from DB.
const path = require("path");
const BACKEND = path.resolve(__dirname, "..", "..", "online-store-backend");
require(path.join(BACKEND, "node_modules", "dotenv")).config({
  path: path.join(BACKEND, ".env"),
});
const mongoose = require(path.join(BACKEND, "node_modules", "mongoose"));

const TAILS = [
  "c7c3",
  "c869",
  "c874",
  "c875",
  "c876",
  "c8a1",
  "c8a6",
  "c8a8",
  "c8a9",
  "c8ab",
  "c8ae",
  "c8c6",
  "c8df",
  "c8e1",
  "c623",
  "c636",
  "c640",
  "c653",
  "c697",
  "c69e",
  "c69f",
  "c6a3",
  "c6c7",
];
const LANGS = {
  c7c3: "it",
  c869: "fr",
  c874: "en",
  c875: "en",
  c876: "en",
  c8a1: "it",
  c8a6: "fr",
  c8a8: "fr",
  c8a9: "fr",
  c8ab: "it",
  c8ae: "fr",
  c8c6: "fr",
  c8df: "it",
  c8e1: "pt",
  c623: "fr",
  c636: "en",
  c640: "it",
  c653: "it",
  c697: "pt",
  c69e: "pt",
  c69f: "pt",
  c6a3: "fr",
  c6c7: "de",
};

(async () => {
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 15000,
  });
  const db = mongoose.connection.db;
  const cache = db.collection("product_catalog_translation_cache");
  for (const tail of TAILS) {
    const pid = Object.keys(ALL).find((k) => k.endsWith(tail));
  }
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
const ALL = {};
