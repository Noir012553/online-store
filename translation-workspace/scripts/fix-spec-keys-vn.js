// Fix spec KEYS containing untranslated Vietnamese (chat_lieu_vo, trong_luong,
// kich_thuoc...) in products collection — rename keys, keeping order/values.
// Only touches products whose name matches the assistant-translated catalog.
const path = require("path");
const BACKEND = path.resolve(__dirname, "..", "..", "online-store-backend");
require(path.join(BACKEND, "node_modules", "dotenv")).config({
  path: path.join(BACKEND, ".env"),
});
const mongoose = require(path.join(BACKEND, "node_modules", "mongoose"));
const APPLY = process.argv.includes("--apply");

// Vietnamese-spec-key map (snake_case, diacritic-stripped) → English camelCase
const KEY_MAP = {
  chat_lieu_vo: "shellMaterial",
  chat_lieu: "material",
  trong_luong: "weight",
  kich_thuoc: "size",
  cong_ket_noi: "ports",
  kieu_ket_noi: "connectionType",
  phuong_thuc_ket_noi: "connection",
  kieu_tai_nghe: "headsetType",
  loai_pin: "batteryType",
  mau_sac: "color",
  khong_day: "wireless",
  co_day: "wired",
  cam_bien: "sensor",
  do_phan_giai: "resolution",
  so_luong_phim: "keyCount",
  bao_mat: "security",
  toc_do_lay_mau: "pollingRate",
  kich_thuoc_man_hinh: "screenSize",
  do_phan_giai_man_hinh: "screenResolution",
  tan_sot_quet: "refreshRate",
  card_do_hoa: "gpu",
  dung_luong_ram: "ram",
  dung_luong_ssd: "ssd",
  he_dieu_hanh: "os",
  cong_usb: "usbPorts",
  den_led: "led",
  chat_lieu_keycap: "keycapMaterial",
  khung_nhom: "aluminumFrame",
  on_off: "powerSwitch",
  hanh_trinh_phim: "keyTravel",
  keycap: "keycaps",
  switch: "switch",
  ket_noi: "connection",
  nguon: "power",
  pin: "battery",
  micro: "microphone",
  tai_nghe: "headset",
  loa: "speaker",
};

(async () => {
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 15000,
  });
  const products = mongoose.connection.db.collection("products");
  const docs = await products
    .find({}, { projection: { name: 1, specs: 1 } })
    .toArray();
  let touched = 0;
  for (const p of docs) {
    if (!p.specs || typeof p.specs !== "object") continue;
    const entries = Object.entries(p.specs);
    const badKeys = entries.filter(([k]) => KEY_MAP[k.toLowerCase()]);
    if (!badKeys.length) continue;
    const renamed = {};
    let renamedN = 0;
    for (const [k, v] of entries) {
      const mapped = KEY_MAP[k.toLowerCase()];
      if (mapped && !renamed[mapped]) {
        renamed[mapped] = v;
        renamedN++;
      } else renamed[k] = v;
    }
    console.log(
      `${p._id} ${p.name?.slice(0, 40)} → rename ${renamedN}: ${badKeys.map(([k]) => k).join(",")}`,
    );
    touched++;
    if (APPLY) {
      await products.updateOne({ _id: p._id }, { $set: { specs: renamed } });
    }
  }
  console.log(
    `products to fix: ${touched} ${APPLY ? "(APPLIED)" : "(dry run)"}`,
  );
  await mongoose.disconnect();
})().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
