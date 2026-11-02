// c88e/pt: whitelist "Ligação" — it's legit Portuguese (means connection);
// the flag was a false positive from my filter.
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

// Check c88e/pt context
const t = hand["6ad0d0390069aece85a8c88e"].pt;
const VIET = /[ăâđêôơưáàảãạấầẩẫậắằẳẵặếềểễệốồổỗộớờởỡợứừửữự]/u;
const m =
  (t.description + " " + (t.imageAlts || []).join(" ")).match(
    /[\p{L}]*[ăâđêôơưáàảãạấầẩẫậắằẳẵặếềểễệốồổỗộớờởỡợứừửữự][\p{L}]*/gu,
  ) || [];
console.log("flags:", [...new Set(m)]);
// If "Ligação" appears, it IS pt — legit. Check other flagged words too:
const all = [
  t.name,
  t.description,
  t.technicalDescription,
  Object.values(t.specs || {}).join(" "),
  (t.imageAlts || []).join(" "),
].join(" ");
console.log("full scan:", [
  ...new Set(
    all.match(
      /[\p{L}]*[ăâđêôơưáàảãạấầẩẫậắằẳẵặếềểễệốồổỗộớờởỡợứừửữự][\p{L}]*/gu,
    ) || [],
  ),
]);
