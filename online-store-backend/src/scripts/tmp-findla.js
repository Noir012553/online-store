const fs = require("fs");
const s = fs
  .readFileSync("src/scripts/tmp-source-desc.txt", "utf8")
  .toLocaleLowerCase("vi");
const words = s.split(/[\s.,;:!?()"'«»—–-]+/).filter(Boolean);
const hits = [];
words.forEach((w, i) => {
  if (w === "là" || w === "la")
    hits.push(`${i}:${words.slice(Math.max(0, i - 2), i + 3).join(" ")}`);
});
console.log(
  "source occurrences of la/là:",
  JSON.stringify(hits.slice(0, 8), null, 2),
);
