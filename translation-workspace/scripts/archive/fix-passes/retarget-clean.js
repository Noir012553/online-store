// Retarget cleaning scripts at nov06d by editing the file path constant.
const fs = require("fs");
const p = __dirname + "/clean-accessory-translations.js";
let raw = fs.readFileSync(p, "utf8");
if (!raw.includes("translations-nov06d-hand.json")) {
  raw = raw.replace(
    /translations-nov06c-hand\.json/g,
    "translations-nov06d-hand.json",
  );
  fs.writeFileSync(p, raw, "utf8");
  console.log("clean-accessory-translations.js retargeted to nov06d");
}
for (const f of [
  "clean-accessory-translations2.js",
  "clean-accessory-translations3.js",
  "clean-accessory-translations4.js",
  "clean-accessory-translations5.js",
  "clean-accessory-translations6.js",
]) {
  const fp = __dirname + "/" + f;
  let raw2 = fs.readFileSync(fp, "utf8");
  if (!raw2.includes("translations-nov06d-hand.json")) {
    raw2 = raw2.replace(
      /translations-nov06c-hand\.json/g,
      "translations-nov06d-hand.json",
    );
    fs.writeFileSync(fp, raw2, "utf8");
    console.log(f, "retargeted");
  }
}
