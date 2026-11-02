// Verify the Product pre-validate hook: save a doc with Vietnamese-diactritic-
// stripped spec keys → keys must come back normalized to English canonical.
const path = require("path");
const BACKEND = path.resolve(__dirname, "..", "..", "online-store-backend");
require(path.join(BACKEND, "node_modules", "dotenv")).config({
  path: path.join(BACKEND, ".env"),
});
const mongoose = require(path.join(BACKEND, "node_modules", "mongoose"));
const Product = require(path.join(BACKEND, "src", "models", "Product"));
const Category = require(path.join(BACKEND, "src", "models", "Category"));

(async () => {
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 15000,
  });
  const cat = await Category.findOne({ isDeleted: false });
  const User = mongoose.connection.db.collection("users");
  const adminUser = await User.findOne({ email: "admin@laptop.com" });
  const probe = new Product({
    name: "__HOOK_PROBE__",
    brand: "ProbeBrand",
    price: 1000,
    category: cat?._id,
    baseCurrencyCode: "VND",
    image: "https://example.com/probe.png",
    user: adminUser?._id,
    specs: {
      "Chat lieu vo": "Nhựa",
      "Kich thuoc man hinh": '15.6"',
      "Trong luong": "1.2 kg",
      cam_bien: "Quang học",
    },
  });
  await probe.save();
  console.log("saved keys:", Object.keys(probe.specs).join(", "));
  console.log(probe.specs);
  await Product.deleteOne({ _id: probe._id });
  console.log("probe cleaned up");
  await mongoose.disconnect();
})().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
