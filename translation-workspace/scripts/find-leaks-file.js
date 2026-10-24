// Lists every field of a batch file record that still contains Vietnamese
// diacritics (the trigger for the validator's `mixed_language` error).
//
//   node scripts/find-leaks-file.js
const fs = require("fs");
const path = require("path");

const FILE =
  process.env.FILE ||
  path.join(
    __dirname,
    "..",
    "data",
    "import",
    "assistant-batch-import-10-products.json",
  );

// Vietnamese-only letters and tone marks. Accents shared with fr/es/pt/it such
// as é, á, ó, ñ are NOT flagged; only genuine Vietnamese text is.
// Only Vietnamese base letters and tone marks that no other supported locale uses.
// ă/â/ơ/ư and the Vietnamese-only tone marks. Shared accents such as é, à, ô,
// ê, â, á, ó, í, ú, ñ stay allowed because fr/es/pt/it use them too.
const VI = /[ăđơưẠạẢảẤấẦầẨẩẪẫẬậẮắẰằẲẳẴẵẶặẸẹẺẻẼẽẾếỀềỂểỄễỆệỈỉỊịỌọỎỏỐốỒồỔổỖỗỘộỚớỜờỞởỠỡỢợỤụỦủỨứỪừỬửỮữỰựỲỳỶỷỸỹỴỵ]/;
const VI_WORDS = /\b(thế hệ|vấn đề|GearVN để|của|với|được|không|những)\b/;

const parsed = JSON.parse(fs.readFileSync(FILE, "utf8"));
let total = 0;

const scan = (node, trail, out) => {
  if (typeof node === "string") {
    if (VI.test(node) || VI_WORDS.test(node)) out.push(trail);
  } else if (Array.isArray(node)) {
    node.forEach((item, i) => scan(item, `${trail}[${i}]`, out));
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node))
      scan(v, trail ? `${trail}.${k}` : k, out);
  }
};

for (const record of parsed.records) {
  const out = [];
  scan(record.translations, "", out);
  if (!out.length) continue;
  total += 1;
  console.log(`${record.productId}/${record.targetLang}`);
  for (const field of out) {
    const value = field.split(".").reduce((acc, part) => {
      const m = part.match(/^([^[]+)\[(\d+)\]$/);
      return m ? acc?.[m[1]]?.[Number(m[2])] : acc?.[part];
    }, record.translations);
    console.log(`   ${field}: ${JSON.stringify(String(value).slice(0, 260))}`);
  }
}

console.log(`\nrecords containing Vietnamese text: ${total}`);
