const fs = require("fs");
function load(p) {
  let s = fs.readFileSync(p, "utf8");
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return s;
}
function save(p, s) {
  fs.writeFileSync(p, s, "utf8");
}
function rep(s, a, b) {
  const n = s.split(a).length - 1;
  if (n) console.log("  ", JSON.stringify(a), "->", n);
  return s.split(a).join(b);
}

console.log("--- group1 (917, 918)");
let g1 = load("E:/dev-camp/24-9-26 copy 98/translation-workspace/data/translations/translations-group1.json");
// 918 en: CS2-themed
g1 = rep(g1, "CS2-themed keyboard", "keyboard themed after CS2");
// 918 de: CS2-Thema
g1 = rep(g1, "im CS2-Thema", "im Thema CS2");
// 918 nl: CS2-thema + 54g-ultrasnaar
g1 = rep(g1, "muismat in CS2-thema", "muismat in het thema van CS2");
g1 = rep(
  g1,
  "een 54g-ultrasnaar esportswapen",
  "een esportswapen, ultrasnaar met 54g",
);
// 918 sv: CS2-tema
g1 = rep(g1, "musmatta i CS2-tema", "musmatta i tema efter CS2");
// 917 nl: 54g-ultrasnaar
g1 = rep(
  g1,
  "en 54g-ultrasnaar esportswapen",
  "een esportswapen, ultrasnaar met 54g",
);
// quét mọi "CS2-" / "54g-" còn sót
console.log("  còn CS2-x:", (g1.match(/CS2-\p{L}+/gu) || []).join("|"));
console.log("  còn 54g-x:", (g1.match(/54g-\p{L}+/gu) || []).join("|"));
save("E:/dev-camp/24-9-26 copy 98/translation-workspace/data/translations/translations-group1.json", g1);

console.log("--- group2 (919 de)");
let g2 = load("E:/dev-camp/24-9-26 copy 98/translation-workspace/data/translations/translations-group2.json");
g2 = rep(
  g2,
  "8.000Hz-Dongle und HyperSpeed-Gen-2-Verbindung",
  "8.000Hz Dongle und HyperSpeed Gen\u20112 Verbindung",
);
g2 = rep(
  g2,
  "die kabellose Razer-HyperSpeed-Wireless-Gen\u20112-Verbindung",
  "die kabellose Razer HyperSpeed Wireless Gen\u20112 Verbindung",
);
g2 = rep(g2, "ein 8.000Hz-Dongle in", "ein 8.000Hz Dongle in");
console.log("  còn Gen-2-x:", (g2.match(/Gen-2-\p{L}+/gu) || []).join("|"));
console.log(
  "  còn Gen\u20112-x:",
  (g2.match(/Gen\u20112-\p{L}+/gu) || []).join("|"),
);
console.log(
  "  còn 8.000Hz-x:",
  (g2.match(/8\.000Hz-\p{L}+/gu) || []).join("|"),
);
save("E:/dev-camp/24-9-26 copy 98/translation-workspace/data/translations/translations-group2.json", g2);

console.log("--- group3 (91a de)");
let g3 = load("E:/dev-camp/24-9-26 copy 98/translation-workspace/data/translations/translations-group3.json");
g3 = rep(g3, "Mit Gen-4-Optical-Switches", "Mit optischen Gen\u20114 Switches");
console.log("  còn Gen-4-x:", (g3.match(/Gen-4-\p{L}+/gu) || []).join("|"));
save("E:/dev-camp/24-9-26 copy 98/translation-workspace/data/translations/translations-group3.json", g3);

console.log("--- group5 (91f, 920 nl/sv)");
let g5 = load("E:/dev-camp/24-9-26 copy 98/translation-workspace/data/translations/translations-group5.json");
g5 = rep(
  g5,
  "Met de Razer HyperPolling 8KHz-technologie",
  "Met de technologie Razer HyperPolling 8KHz",
);
g5 = rep(
  g5,
  "Met Razer HyperPolling 8KHz-tekniken",
  "Med tekniken Razer HyperPolling 8KHz",
);
console.log("  còn 8KHz-x:", (g5.match(/8KHz-\p{L}+/gu) || []).join("|"));
save("E:/dev-camp/24-9-26 copy 98/translation-workspace/data/translations/translations-group5.json", g5);
console.log("done");
