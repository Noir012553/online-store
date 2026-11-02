// Auto-fix remaining preflight problems from logs/preflight-next3.txt.
// Parses each "c5XX/<lang> <field>: <error> "<token>"" line and patches
// data/translations/translations-next3-<lang>.json accordingly:
//   missing_technical_token  → append token to that field (smart: name → put
//     inside trailing "(...)" parens; alt → prefix; desc → append sentence)
//   unexpected_technical_token → remove token occurrences from that field
//   mixed_language → leave for manual fix (logged at end)
// Idempotent. After running: npm run build && npm run preflight.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const DIR = path.join(WS, "data", "translations");
const REPORT = path.join(WS, "logs", "preflight-next3.txt");

const load = (f) =>
  JSON.parse(fs.readFileSync(f, "utf8").replace(/^\uFEFF/, ""));
const lines = fs.readFileSync(REPORT, "utf8").split(/\r?\n/).filter(Boolean);

const cache = new Map(); // lang → parsed json
const getJson = (lang) => {
  if (!cache.has(lang)) {
    const f = path.join(DIR, `translations-next3-${lang}.json`);
    cache.set(lang, load(f));
  }
  return cache.get(lang);
};
const saveAll = () => {
  for (const [lang, j] of cache) {
    const f = path.join(DIR, `translations-next3-${lang}.json`);
    fs.writeFileSync(f, JSON.stringify(j, null, 2), "utf8");
  }
};

const getField = (t, field) => {
  if (field.startsWith("alt.")) {
    const i = Number(field.split(".")[1]);
    return (t.descriptionImages || [])[i] || {};
  }
  if (field.startsWith("promo.")) return null;
  return { [field]: t[field] };
};
const setField = (t, field, value) => {
  if (field.startsWith("alt.")) {
    const i = Number(field.split(".")[1]);
    if (!t.descriptionImages) t.descriptionImages = [];
    if (!t.descriptionImages[i]) t.descriptionImages[i] = {};
    t.descriptionImages[i].alt = value;
  } else t[field] = value;
};

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
let fixed = 0,
  manual = [];
for (const line of lines) {
  const m = line.match(
    /^c5(\w\w)\/(\w\w) ([\w.]+): (missing_technical_token|unexpected_technical_token|mixed_language) "(.+?)"$/,
  );
  if (!m) continue;
  const [, sfx, lang, field, kind, token] = m;
  if (kind === "mixed_language") {
    manual.push(line);
    continue;
  }
  const pidKey = Object.keys(getJson(lang)).find((k) => k.endsWith("c5" + sfx));
  if (!pidKey) {
    manual.push(line + "  [no pid]");
    continue;
  }
  const t = getJson(lang)[pidKey][lang];
  if (!t) {
    manual.push(line + "  [no tr]");
    continue;
  }
  if (field.startsWith("promo.")) {
    manual.push(line + "  [promo manual]");
    continue;
  }
  const cur = String(
    getField(t, field)[field.startsWith("alt.") ? "alt" : field] ?? "",
  );
  if (kind === "missing_technical_token") {
    if (new RegExp(esc(token), "i").test(cur)) continue; // already there
    let next;
    if (field === "name") {
      // append inside the trailing parenthesis group of the name
      next = /\)\s*$/.test(cur)
        ? cur.replace(/\)\s*$/, "/ " + token + ")")
        : cur + " " + token;
    } else if (field.startsWith("alt.")) {
      next = cur ? token + " — " + cur : token;
    } else {
      next =
        cur +
        (cur.endsWith(".") || cur.endsWith("\n") ? "" : ".") +
        " " +
        token +
        ".";
    }
    setField(t, field, next);
    fixed++;
  } else {
    // unexpected: remove token (careful with word boundaries for alnum tokens)
    const re = new RegExp(esc(token) + "\\s*", "gi");
    setField(
      t,
      field,
      cur
        .replace(re, "")
        .replace(/\s{2,}/g, " ")
        .replace(/\.\s*\./g, "."),
    );
    fixed++;
  }
}
saveAll();
console.log("auto-fixed:", fixed, "| manual:", manual.length);
manual.forEach((x) => console.log(" MANUAL:", x));
