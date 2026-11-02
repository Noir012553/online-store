// Shared config for all translation-workspace scripts.
// All paths are derived from __dirname — no absolute hardcoded paths.
const path = require("path");

const WS = path.resolve(__dirname, "..");
// Repo root = parent of translation-workspace (folder may be renamed/copied freely)
const ROOT = path.resolve(WS, "..");
const BACKEND = process.env.BACKEND_DIR
  ? path.resolve(process.env.BACKEND_DIR)
  : path.join(ROOT, "online-store-backend");

// Resolve backend node_modules once; mongoose ships mongodb as a dependency.
const BACKEND_MODULES = path.join(BACKEND, "node_modules");
const MONGODB_PATH = path.join(
  BACKEND_MODULES,
  "mongoose",
  "node_modules",
  "mongodb",
);

const MONGO_URI =
  process.env.MONGO_URI ||
  (() => {
    try {
      require(path.join(BACKEND_MODULES, "dotenv")).config({
        path: path.join(BACKEND, ".env"),
      });
    } catch {
      /* dotenv optional when MONGO_URI is exported */
    }
    return process.env.MONGO_URI;
  })() ||
  "mongodb://admin:admin123@localhost:27017/?authSource=admin";

const MONGO_DB = process.env.MONGO_DB || "laptop-shop";

const CACHE_COLLECTION = "product_catalog_translation_cache";
const TRANSLATIONS_COLLECTION = "producttranslations";
const LOCALES = ["en", "pt", "fr", "de", "it", "es", "nl", "sv"];

// Batch tag: current working batch suffix. Bump via env (TRANSLATION_TAG) when
// starting a new batch generation without renaming anything.
const TAG = process.env.TRANSLATION_TAG || "next3";

// Fixed data-file convention (see scripts/README.md)
const DATA = {
  exportBatch: path.join(WS, "data", "export", `assistant-batch-${TAG}.json`),
  sourcesTxt: path.join(WS, "data", `sources-for-translation-${TAG}.txt`),
  sourcesDir: path.join(WS, "data", `sources-${TAG}`),
  importBatch: path.join(
    WS,
    "data",
    "import",
    `assistant-batch-import-${TAG}.json`,
  ),
  translationsDir: path.join(WS, "data", "translations"),
  translationsFile: (lang) =>
    path.join(WS, "data", "translations", `translations-${TAG}-${lang}.json`),
  importState: path.join(WS, "logs", `import-${TAG}-state.json`),
  preflightLog: path.join(WS, "logs", `preflight-${TAG}.txt`),
};

const API_BASE = process.env.BACKEND_URL || "http://localhost:5000";
const MAX_PRODUCTS = Number(process.env.MAX_PRODUCTS || 10);

// Small helpers every script re-uses
const loadJson = (p) => {
  const fs = require("fs");
  let raw = fs.readFileSync(p, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1); // strip BOM
  return JSON.parse(raw);
};

const connectMongoose = async () => {
  const mongoose = require(path.join(BACKEND_MODULES, "mongoose"));
  if (!MONGO_URI) throw new Error("MONGO_URI is not set (check backend .env)");
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  return mongoose;
};

module.exports = {
  WS,
  ROOT,
  BACKEND,
  BACKEND_MODULES,
  MONGODB_PATH,
  MONGO_URI,
  MONGO_DB,
  CACHE_COLLECTION,
  TRANSLATIONS_COLLECTION,
  LOCALES,
  TAG,
  DATA,
  API_BASE,
  MAX_PRODUCTS,
  loadJson,
  connectMongoose,
};
