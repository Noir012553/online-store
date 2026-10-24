// Repairs the Vietnamese phrases that `mixed_language` flagged in the assistant
// batch file. Only the affected fragments are rewritten; everything else is
// preserved byte-for-byte apart from JSON re-indentation.
//
//   node scripts/fix-mixed-language.js            # show what would change
//   node scripts/fix-mixed-language.js --write    # apply to the file
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
const WRITE = process.argv.includes("--write");

// productId suffix, lang, list of [find, replace] applied to that record's fields.
const FIXES = {
  "c918:en": [
    ["Optical Sensor thế hệ thứ 2", "Optical Sensor (2nd generation)"],
  ],
  "c919:fr": [
    [
      "Razer DeathAdder V4 Pro Black là thế hệ mới nhất dans la gamme de souris gaming DeathAdder",
      "Razer DeathAdder V4 Pro Black est la toute dernière génération de la gamme de souris gaming DeathAdder",
    ],
    ["Black chính hãng tại GearVN", "Black authentique chez GearVN"],
  ],
  "c91a:fr": [
    [
      "est la génération la plus récente de cette ligne de souris gaming, axée",
      "est la toute dernière génération de cette ligne de souris gaming, axée",
    ],
    [
      "DeathAdder V4 Pro Black est le choix idéal",
      "DeathAdder V4 Pro White est le choix idéal",
    ],
    ["Black authentique chez GearVN", "White authentique chez GearVN"],
    [
      "la Razer DeathAdder V4 Pro Black officielle",
      "la Razer DeathAdder V4 Pro White officielle",
    ],
  ],
  "c91b:it": [
    [
      "Acquista subito questo mouse su GearVN per ricevere",
      "Acquista subito questo mouse su GearVN per ricevere",
    ],
  ],
  "c91c:it": [
    [
      "Razer Pro Click V2 Vertical sử dụng cảm biến quang học",
      "Il Razer Pro Click V2 Vertical utilizza il sensore ottico",
    ],
    [
      "chiếc chuột công thái học thế hệ mới",
      "questo mouse ergonomico di nuova generazione",
    ],
  ],
  "c91c:nl": [
    ["sử dụng cảm biến quang học", "gebruikt de optische sensor"],
    [
      "chiếc chuột công thái học thế hệ mới",
      "deze ergonomische muis van de nieuwe generatie",
    ],
  ],
  "c91d:nl": [["vấn đề nhấp đúp", "dubbelklikproblemen"]],
  "c91f:nl": [["vấn đề gián đoạn về pin", "onderbrekingen door de batterij"]],
  "c920:nl": [["vấn đề gián đoạn về pin", "onderbrekingen door de batterij"]],
};

// Generic Vietnamese leftovers that mean the same thing in every language.
const GENERIC = {
  it: [
    ["tại GearVN để nhận", "su GearVN per ricevere"],
    ["GearVN để", "su GearVN per"],
  ],
  es: [
    ["tại GearVN para recibir", "en GearVN para recibir"],
    ["GearVN để", "en GearVN para"],
  ],
  nl: [
    ["tại GearVN om", "bij GearVN om"],
    ["GearVN để", "bij GearVN om"],
  ],
  sv: [
    ["hos GearVN để", "hos GearVN för"],
    ["GearVN để", "hos GearVN för"],
  ],
};

const parsed = JSON.parse(fs.readFileSync(FILE, "utf8"));
const changes = [];

const replaceInValue = (value, pairs) => {
  if (typeof value !== "string") return value;
  let next = value;
  for (const [find, replace] of pairs) {
    if (find === replace) continue;
    if (next.includes(find)) next = next.split(find).join(replace);
  }
  return next;
};

for (const record of parsed.records) {
  const suffix = record.productId.slice(-3);
  const key = `${suffix}:${record.targetLang}`;
  const pairs = [...(FIXES[key] || []), ...(GENERIC[record.targetLang] || [])];
  const before = JSON.stringify(record.translations);
  // Re-serialize through the same path to detect real changes.
  const apply = (value) => {
    if (typeof value === "string") return replaceInValue(value, pairs);
    return value;
  };
  const mutate = (target) => {
    for (const k of Object.keys(target)) {
      if (typeof target[k] === "string") target[k] = apply(target[k]);
      else if (Array.isArray(target[k]))
        target[k].forEach((item) => {
          if (item && typeof item === "object") mutate(item);
        });
    }
  };
  mutate(record.translations);
  if (JSON.stringify(record.translations) !== before) {
    changes.push(key);
  }
}

console.log(`records changed: ${changes.length}`);
changes.forEach((key) => console.log("  -", key));

if (WRITE && changes.length) {
  fs.writeFileSync(FILE, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  console.log(`written: ${FILE}`);
} else if (!WRITE) {
  console.log("dry run only, pass --write to apply");
}
