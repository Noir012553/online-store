// Generator for nov06f leftovers — covers products with DIFFERENT pids than
// the exported sample (many products not seen by gen-nov06f's source blocks
// because next50-products.json includes products from PREVIOUS batches).
// Rebuilds translations-nov06f-hand.json by MERGING nov06f gen output with
// old hand files (nov06d/nov06e/nov06c) for shared slots, then regenerates
// only the missing slots using gen-nov06f's own builder by importing its
// module-level state.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const load = (p) => {
  let raw = fs.readFileSync(p, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  return JSON.parse(raw);
};

const hand06fPath = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06f-hand.json",
);
const hand06dPath = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06d-hand.json",
);
const hand06ePath = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06e-hand.json",
);
const hand06cLaptop = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06c-laptop-hand.json",
);

const f = load(hand06fPath);
const d = load(hand06dPath);
const e = load(hand06ePath);
const cLaptop = load(hand06cLaptop);
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov06f.json",
);
const importData = JSON.parse(
  fs.readFileSync(
    path.join(WS, "data", "import", "assistant-batch-import-nov06f.json"),
    "utf8",
  ),
);

// For each missing slot in nov06f, look up translations in other hand files.
let recovered = 0;
const sources = [d, e, cLaptop];
const stillMissing = [];
for (const rec of importData.records) {
  const pid = rec.productId,
    lang = rec.targetLang;
  if (f[pid] && f[pid][lang] && f[pid][lang].name) continue;
  let found = null;
  for (const src of sources) {
    if (src[pid] && src[pid][lang] && src[pid][lang].name) {
      found = src[pid][lang];
      break;
    }
  }
  if (found) {
    f[pid] = f[pid] || {};
    f[pid][lang] = found;
    recovered++;
  } else {
    stillMissing.push(pid.slice(-4) + ":" + lang);
  }
}
fs.writeFileSync(hand06fPath, JSON.stringify(f, null, 2) + "\n", "utf8");
console.log("recovered:", recovered, "| still missing:", stillMissing.length);
if (stillMissing.length) console.log(stillMissing.slice(0, 60).join(" "));
