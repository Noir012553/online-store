// Smoke-test promo-templates-next.js with the real promo strings.
const P = require("./promo-templates-next.js");
const samples = [
  {
    type: "Gift",
    title:
      'Tặng ngay 1 x Màn hình Acer KG241Y-X1 24" IPS 200Hz Gsync chuyên game (trị giá 2.390.000đ )',
    giftProductName: 'Màn hình Acer KG241Y-X1 24" IPS 200Hz Gsync chuyên game',
    scope: "",
    discountText: "",
  },
  {
    type: "Gift",
    title: "Tặng ngay 1 x Chuột Logitech G304 Wireless (trị giá 725.000đ )",
    giftProductName: "Chuột Logitech G304 Wireless",
    scope: "",
    discountText: "",
  },
  {
    type: "Gift",
    title: "Tặng ngay 1 x Balo Acer Predator SUV (trị giá 2.000.000đ )",
    giftProductName: "Balo Acer Predator SUV",
    scope: "",
    discountText: "",
  },
  {
    type: "Discount",
    title: "[Laptop] Giảm 1% tối đa 500k cho HSSV khi mua laptop",
    giftProductName: "",
    scope: "Laptop",
    discountText: "[Laptop] Giảm 1% tối đa 500k cho HSSV khi mua laptop",
  },
];
const LANGS = ["en", "pt", "fr", "de", "it", "es", "nl", "sv"];
for (const s of samples) {
  console.log("SRC:", s.title);
  for (const l of LANGS) {
    const r = P.translate(s, l);
    console.log(" ", l, "|", r ? r.title : "(null)");
    if (r && s.giftProductName) console.log("      gift:", r.giftProductName);
  }
  console.log("---");
}
