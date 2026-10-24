const fs = require("fs");
function loadClean(p) {
  let s = fs.readFileSync(p, "utf8");
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return s;
}
function save(p, s) {
  fs.writeFileSync(p, s, "utf8");
}
function repAll(s, a, b) {
  const n = s.split(a).length - 1;
  return [s.split(a).join(b), n];
}

// ===== group1: 917 (nl,sv) + 918 (en,fr,de,it,es,nl,sv) =====
let g1 = loadClean("E:/dev-camp/24-9-26 copy 98/translation-workspace/data/translations/translations-group1.json");
// 917: specs/techdesc phải giữ "54 g" (nguồn spec dùng "54 g", không phải plain token)
// Chiến lược: hoàn tác replace trong techdesc bằng cách đặt lại giá trị chuẩn
g1 = g1.split('"Gewicht\\": \\"54g\\"').join('"Gewicht\\": \\"54 g\\"');
g1 = g1.split('"Vikt\\": \\"54g\\"').join('"Vikt\\": \\"54 g\\"');
g1 = g1.split('"weight": "54g"').join('"weight": "54 g"');
// 918 de: connection "2,4-GHz-Funk" -> "2.4GHz Funk" (token 2.4GHz tách riêng)
[g1] = [g1, null];
let n;
[g1, n] = repAll(g1, "2,4-GHz-Funk", "2.4GHz Funk");
console.log("g1 2,4-GHz-Funk:", n);
[g1, n] = repAll(g1, "2.4GHz-Funk", "2.4GHz Funk");
console.log("g1 2.4GHz-Funk:", n);
// 918 fr: "Édition CS2" kết thúc bằng CS2 + quote trong techdesc tạo token "2inch" -> đổi thứ tự
[g1, n] = repAll(
  g1,
  '\\"Couleur\\": \\"Édition CS2\\"',
  '\\"Couleur\\": \\"CS2 Édition\\"',
);
console.log("g1 fr techdesc color:", n);
[g1, n] = repAll(g1, '"color": "Édition CS2"', '"color": "CS2 Édition"');
console.log("g1 fr spec color:", n);
// 918 fr: "2e génération" -> "deuxième génération" (token 2e không có trong nguồn)
[g1, n] = repAll(g1, "de 2e génération", "de deuxième génération");
console.log("g1 fr 2e:", n);
[g1, n] = repAll(g1, "2e génération", "deuxième génération");
console.log("g1 fr 2e(2):", n);
save("E:/dev-camp/24-9-26 copy 98/translation-workspace/data/translations/translations-group1.json", g1);

// ===== group2: 919 (fr,de,it,es,nl,sv) =====
let g2 = loadClean("E:/dev-camp/24-9-26 copy 98/translation-workspace/data/translations/translations-group2.json");
// 919 de: alt "Gen-4-Switch" -> không có token (nguồn alt không có token kỹ thuật)
[g2, n] = repAll(
  g2,
  "mit langlebigem optischem Gen-4-Switch",
  "mit langlebigem optischem Switch der Generation 4",
);
[g2, n2] = repAll(
  g2,
  "mit langlebigem optischen Gen-4-Switch",
  "mit langlebigem optischem Switch der Generation 4",
);
console.log("g2 de alt Gen-4-Switch:", n + n2);
[g2, n] = repAll(g2, "Gen-4-Switch", "Gen‑4-Switch");
console.log("g2 còn lại Gen-4-Switch (U+2011):", n);
// 919 de desc: "Razer Optical Gen‑4 Switches" - U+2011 ok; tìm ASCII "Gen-4" trong desc
const asciiGen4 = (g2.match(/Gen-4/g) || []).length;
console.log("g2 ASCII Gen-4 còn lại:", asciiGen4);
[g2, n] = repAll(g2, "Razer Optical Gen-4", "Razer Optical Gen‑4");
save("E:/dev-camp/24-9-26 copy 98/translation-workspace/data/translations/translations-group2.json", g2);

// ===== group3: 91a (en,pt,fr,de,it,es,nl,sv) =====
let g3 = loadClean("E:/dev-camp/24-9-26 copy 98/translation-workspace/data/translations/translations-group3.json");
// 91a de/nl/sv: "8K-Dongle" token sai -> "8K Dongle"
[g3, n] = repAll(g3, "HyperPolling-8K-Dongle", "HyperPolling 8K Dongle");
console.log("g3 de 8K-Dongle:", n);
[g3, n] = repAll(g3, "HyperPolling 8K-dongle", "HyperPolling 8K Dongle");
console.log("g3 nl 8K-dongle:", n);
[g3, n] = repAll(g3, "8K-donglen", "8K donglen");
console.log("g3 sv 8K-donglen:", n);
[g3, n] = repAll(g3, "HyperPolling-8K-dongle", "HyperPolling 8K Dongle");
console.log("g3 8K-dongle:", n);
// 91a de connection: "2.4GHz-Funk" -> "2.4GHz Funk"
[g3, n] = repAll(g3, "2.4GHz-Funk", "2.4GHz Funk");
console.log("g3 2.4GHz-Funk:", n);
[g3, n] = repAll(g3, "2,4-GHz-Funk", "2.4GHz Funk");
console.log("g3 2,4-GHz-Funk:", n);
save("E:/dev-camp/24-9-26 copy 98/translation-workspace/data/translations/translations-group3.json", g3);

// ===== group5: 91e (it,es,nl,sv) + 91f (it,es,nl,sv) + 920 (fr,it,es,nl,sv) =====
let g5 = loadClean("E:/dev-camp/24-9-26 copy 98/translation-workspace/data/translations/translations-group5.json");
// 91f/920: "0,125 ms" -> "0.125ms" (token nguồn "0.125ms")
[g5, n] = repAll(g5, "0,125 ms", "0.125ms");
console.log("g5 0,125 ms:", n);
[g5, n] = repAll(g5, "0.125 ms", "0.125ms");
console.log("g5 0.125 ms:", n);
// 920: specs/techdesc weight phải "54 g" (giữ form nguồn); desc giữ "54g"
// chỉ trong techdesc JSON-embedded và specs
[g5, n] = repAll(g5, '\\"Poids\\": \\"54g\\"', '\\"Poids\\": \\"54 g\\"');
console.log("g5 fr techdesc:", n);
[g5, n] = repAll(g5, '\\"Peso\\": \\"54g\\"', '\\"Peso\\": \\"54 g\\"');
console.log("g5 it/es techdesc:", n);
[g5, n] = repAll(g5, '\\"Vikt\\": \\"54g\\"', '\\"Vikt\\": \\"54 g\\"');
console.log("g5 sv techdesc:", n);
[g5, n] = repAll(g5, '\\"Gewicht\\": \\"54g\\"', '\\"Gewicht\\": \\"54 g\\"');
console.log("g5 nl techdesc:", n);
[g5, n] = repAll(g5, '"weight": "54g"', '"weight": "54 g"');
console.log("g5 spec weight:", n);
// 91f: techdesc weight là "150 g" - kiểm tra không bị ảnh hưởng
// 920 fr/it/es desc: HyperPolling 8KHz - kiểm tra
console.log('g5 "8KHz" count:', (g5.match(/8KHz/g) || []).length);
console.log('g5 "8 kHz" count:', (g5.match(/8 kHz/g) || []).length);
console.log('g5 "0.125ms" count:', (g5.match(/0\.125ms/g) || []).length);
save("E:/dev-camp/24-9-26 copy 98/translation-workspace/data/translations/translations-group5.json", g5);
console.log("done");
