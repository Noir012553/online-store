// Fix pass 12: 20 pending records. Two categories:
//  A) missing_brand (all 20): the brand sentence injection in pass11 didn't
//     land for these (my injected brand sentence may not contain the EXACT
//     brand token the validator looks for, e.g. "HyperX" vs "HP HYPERX...").
//     Approach: inject brand sentence using the EXACT token from source name.
//  B) mixed_language (c8a8/c8a9/c8ae fr, c8e1 pt): leak phrase per record —
//     print context first, then fix.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const HAND = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06d-hand.json",
);
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov06d.json",
);
const importData = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const SOURCES = fs.readFileSync(
  path.join(WS, "data", "sources-for-translation-next.txt"),
  "utf8",
);
const blocks = SOURCES.split("===== PRODUCT ").slice(1);
const blockByPid = new Map(blocks.map((b) => [b.match(/^([0-9a-f]+)/)[1], b]));
const idByTail = {};
for (const pid of Object.keys(hand)) idByTail[pid.slice(-4)] = pid;

const PENDING = [
  ["c869", "fr"],
  ["c874", "en"],
  ["c875", "en"],
  ["c876", "en"],
  ["c8a8", "fr"],
  ["c8a9", "fr"],
  ["c8ae", "fr"],
  ["c8c6", "fr"],
  ["c8df", "it"],
  ["c8e1", "pt"],
  ["c623", "fr"],
  ["c623", "it"],
  ["c697", "pt"],
  ["c697", "fr"],
  ["c69e", "pt"],
  ["c69e", "fr"],
  ["c69f", "pt"],
  ["c69f", "fr"],
  ["c6a3", "fr"],
  ["c6a3", "nl"],
];

// 1. Print name + first line of desc + whether brand token present
for (const [tail, lang] of PENDING) {
  const pid = idByTail[tail];
  const block = blockByPid.get(pid);
  const nameSrc = (block.match(/NAME: (.*)/)[1] || "").trim();
  const t = hand[pid][lang];
  const hasBrand = [
    "Logitech",
    "HyperX",
    "HYPERX",
    "Akko",
    "AKKO",
    "ASUS",
    "AULA",
    "DareU",
    "MSI",
    "Rapoo",
    "Razer",
    "HP",
    "Acer",
  ].some(
    (b) => (t.description || "").includes(b) || (t.name || "").includes(b),
  );
  console.log(
    tail + "/" + lang,
    "| src:",
    nameSrc.slice(0, 55),
    "| brandOk:",
    hasBrand,
    "| desc len:",
    (t.description || "").length,
  );
}
