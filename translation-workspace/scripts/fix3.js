const fs = require("fs");
function load(p) {
  return fs.readFileSync(p, "utf8");
}
function save(p, s) {
  fs.writeFileSync(p, s, "utf8");
}
function rep(s, a, b) {
  const n = s.split(a).length - 1;
  if (n) console.log("  replace:", JSON.stringify(a.slice(0, 50)), "->", n);
  return s.split(a).join(b);
}

// 918 it: "seconda generazione" benh "2 in"
let g1 = load("E:/dev-camp/24-9-26 copy 98/translation-workspace/data/translations/translations-group1.json");
g1 = rep(
  g1,
  "Razer Focus Pro 35K Optical Sensor di seconda generazione",
  "Razer Focus Pro 35K Optical Sensor, seconda generazione",
);
save("E:/dev-camp/24-9-26 copy 98/translation-workspace/data/translations/translations-group1.json", g1);

// 918 it/es techdesc: "Generation": "2nd Generation"? xem context
const idx1 = g1.indexOf('"Sensor\\": \\"Focus Pro 35K\\"');
console.log(
  "g1 techdesc Sensor ctx:",
  JSON.stringify(g1.slice(Math.max(0, idx1 - 200), idx1 + 80)),
);

// 91f/920 sv: tim "kHz" trong g5
let g5 = load("E:/dev-camp/24-9-26 copy 98/translation-workspace/data/translations/translations-group5.json");
const m = g5.match(/.{0,60}kHz.{0,60}/gi);
console.log("g5 kHz contexts:");
(m || []).forEach((x) => console.log("  ", JSON.stringify(x)));
