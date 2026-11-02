// Precisely: run backend validator on MY final hand texts (from disk after the
// brand sentence fix) for c869 fr, c874/c875/c876 en — print every validator
// error that still triggers BEFORE rebuilding and re-importing.
const path = require("path");
const BACKEND = path.resolve(__dirname, "..", "..", "online-store-backend");
const validator = require(
  path.join(BACKEND, "src", "utils", "translationValidator.js"),
);
const fs = require("fs");
const WS = path.join(__dirname, "..");
const HAND = path.join(
  WS,
  "data",
  "translations",
  "translations-nov06d-hand.json",
);
const hand = JSON.parse(fs.readFileSync(HAND, "utf8"));

(async () => {
  for (const [tail, lang] of [
    ["c869", "fr"],
    ["c874", "en"],
    ["c875", "en"],
    ["c876", "en"],
  ]) {
    const pid = Object.keys(hand).find((k) => k.endsWith(tail));
    if (!pid) {
      console.log(tail, "no hand");
      continue;
    }
    const t = hand[pid][lang];
    const v = await validator.validateTranslation(
      /* source name placeholder */ "Keyboard " + t.brand + " sample",
      t.description,
      lang,
      "product_description",
    );
    console.log(
      tail + "/" + lang,
      JSON.stringify(v.validationErrors),
      "score",
      v.qualityScore,
    );
    // also find missing tokens on description-level
    const br = v.validationErrors.find((e) =>
      /^missing_(brand|technical_token)/.test(e),
    );
    if (br === "missing_brand") {
      // try name & desc
      const dTok = validator.checkTechnicalTokens(
        "Keyboard " + t.brand,
        t.description,
      );
      console.log("   token check:", JSON.stringify(dTok));
    }
  }
})();
