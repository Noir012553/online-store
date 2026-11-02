// Verify: how many distinct (productId,targetLang) pairs are approved in DB?
const cfg = require("./config");
const { MongoClient } = require(cfg.MONGODB_PATH);
const URI = cfg.MONGO_URI;
const DB = cfg.MONGO_DB;
(async () => {
  const c = await MongoClient.connect(URI);
  const col = c.db(DB).collection("producttranslations");
  const approved = await col
    .find({ status: "approved" })
    .sort({ _id: 1 })
    .toArray();
  console.log("approved pairs:", approved.length);
  const byPid = {};
  for (const a of approved) byPid[a.productId] = (byPid[a.productId] || 0) + 1;
  console.log("distinct productIds:", Object.keys(byPid).length);
  const expected = Number(process.env.EXPECTED_PRODUCTS || 0) * 8; // overridable via env
  console.log("expected pairs:", expected);
  console.log("shortfall:", expected - approved.length);
  const missing = [];
  for (const [pid, cnt] of Object.entries(byPid)) {
    if (cnt < 8) missing.push(pid.slice(-4) + ":" + cnt);
  }
  console.log(
    "productIds with < 8 approved:",
    missing.length ? missing.join(",") : "(none)",
  );
  await c.close();
})();
