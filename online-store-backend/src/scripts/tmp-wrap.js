// Wrap full descriptions into short lines for reading
const path = require("path");
const fs = require("fs");
const data = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "tmp-batch1-full.json"), "utf8"),
);
const wrap = (text, width = 180) => {
  const words = String(text || "").split(/(\s+)/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + w).length > width && cur.trim()) {
      lines.push(cur.trimEnd());
      cur = "";
    }
    cur += w;
  }
  if (cur.trim()) lines.push(cur.trimEnd());
  return lines.join("\n");
};
for (const [id, p] of Object.entries(data)) {
  const out = `### ${id}\n### NAME: ${p.name}\n### DESCRIPTION:\n${wrap(p.description)}\n### TECH:\n${p.technicalDescription}\n`;
  fs.writeFileSync(
    path.resolve(__dirname, `tmp-src-${id.slice(-4)}.txt`),
    out,
    "utf8",
  );
}
console.log("done");
