// Manual fixes for the 6 known mixed_language leaks (safe phrase swaps).
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const DIR = path.join(WS, "data", "translations");
const load = (f) =>
  JSON.parse(fs.readFileSync(f, "utf8").replace(/^\uFEFF/, ""));

function fix(lang, suffix, [re, to]) {
  const f = path.join(DIR, `translations-next3-${lang}.json`);
  const j = load(f);
  const pid = Object.keys(j).find((k) => k.endsWith(suffix));
  const t = j[pid][lang];
  const before = t.description;
  t.description = before.replace(re, to);
  const changed = before !== t.description;
  fs.writeFileSync(f, JSON.stringify(j, null, 2), "utf8");
  console.log(
    changed ? `✓ ${suffix}/${lang}` : `✗ no change ${suffix}/${lang} (${re})`,
  );
}

fix("nl", "c5f3", [/vấn đề/g, "probleem"]);
fix("it", "c5f6", [/ gaming mà\b/g, " per il gaming"]);
fix("es", "c5f6", [/\bcòn là\b/g, "también es"]);
fix("nl", "c5f8", [/\bgearvn để\b/gi, "GearVN om"]);
fix("de", "c5fb", [/\bđen obsidian\b/gi, "Obsidian Schwarz"]);
fix("es", "c5fb", [/\bcòn là\b/g, "también es"]);
console.log("done");
