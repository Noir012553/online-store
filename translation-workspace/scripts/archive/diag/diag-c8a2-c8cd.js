// Fix c8a2/it "rose sử" (name "...Xanh hồng—" + normalize? or the language
// mixing: "Sử dụng..." fragment survived in desc) and c8cd/en "thế laptop"
// (thế = "this/next-gen" fragment in desc).
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const IMPORT = path.join(
  WS,
  "data",
  "import",
  "assistant-batch-import-nov06e.json",
);
const HAND = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06e-hand.json",
);
const d = JSON.parse(fs.readFileSync(IMPORT, "utf8"));
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));

const a = d.records.find(
  (r) => r.productId.endsWith("c8a2") && r.targetLang === "it",
);
const aNorm = a.translations.description.replace(/\s+/g, " ");
const ai = aNorm.toLowerCase().indexOf("rose su");
console.log(
  "c8a2 idx:",
  ai,
  "ctx:",
  JSON.stringify(
    ai >= 0 ? aNorm.slice(Math.max(0, ai - 130), ai + 80) : "(absent in desc)",
  ),
);
// check name
const anIdx = a.translations.name.toLowerCase().indexOf("rose su");
console.log(
  "c8a2 name idx:",
  anIdx,
  JSON.stringify(
    ai >= 0 || anIdx >= 0
      ? a.translations.name.slice(Math.max(0, anIdx - 60), anIdx + 60)
      : "",
  ),
);

const b = d.records.find(
  (r) => r.productId.endsWith("c8cd") && r.targetLang === "en",
);
const bd = b.translations.description.replace(/\s+/g, " ");
const bi = bd.toLowerCase().indexOf("the laptop");
console.log(
  "c8cd idx:",
  bi,
  "ctx:",
  JSON.stringify(
    bi >= 0 ? bd.slice(Math.max(0, bi - 100), bi + 80) : "(absent)",
  ),
);
const bnIdx = b.translations.name.toLowerCase().indexOf("the laptop");
console.log(
  "c8cd name idx:",
  bnIdx,
  JSON.stringify(
    bnIdx >= 0
      ? b.translations.name.slice(Math.max(0, bnIdx - 60), bnIdx + 60)
      : "",
  ),
);
