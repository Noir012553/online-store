// Inspect c770/fr technicalDescription token issue + desc iPad injection.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const HAND = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06e-hand.json",
);
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));
const SOURCES = fs.readFileSync(
  path.join(WS, "data", "sources-for-translation-next.txt"),
  "utf8",
);
const idByTail = {};
for (const pid of Object.keys(hand)) idByTail[pid.slice(-4)] = pid;
const blocks = SOURCES.split("===== PRODUCT ").slice(1);
const blockByPid = new Map(blocks.map((b) => [b.match(/^([0-9a-f]+)/)[1], b]));
{
  const t = hand[idByTail["c770"]].fr;
  const srcTech = blockByPid
    .get(idByTail["c770"])
    .match(/TECH_DESCRIPTION \(verbatim\):\n(.*)/)[1];
  console.log("SRC TECH:", srcTech);
  console.log("TR  TECH:", t.technicalDescription);
  // token missing: run validator
  const BACKEND = path.resolve(WS, "..", "online-store-backend");
  const validator = require(
    path.join(BACKEND, "src", "utils", "translationValidator.js"),
  );
  const r1 = validator.checkTechnicalTokens(srcTech, t.technicalDescription);
  console.log("tech token check:", JSON.stringify(r1));
}
