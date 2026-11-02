// Final pass: rewrite the problem records' translations with correct tokens.
// Strategy: for each flagged (pid,lang) group, fix name/desc/tech/alts so that
// every source token appears in translation and no unexpected tokens remain.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const dir = path.join(WS, "data", "translations");
const load = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
const save = (f, j) =>
  fs.writeFileSync(path.join(dir, f), JSON.stringify(j, null, 2), "utf8");
const langs = ["en", "pt", "fr", "de", "it", "es", "nl", "sv"];
const files = Object.fromEntries(
  langs.map((l) => [l, load(`translations-next3-${l}.json`)]),
);
const getPid = (l, sfx) => Object.keys(files[l]).find((k) => k.endsWith(sfx));
const log = [];

// ---- c5f3: fix name to include ANV16S-61-R0B8 + 16.0" + FHD; desc fix leaks ----
for (const lang of ["pt", "fr", "de", "it", "es", "nl", "sv"]) {
  const pid = getPid(lang, "c5f3");
  if (!pid) continue;
  const t = files[lang][pid][lang];
  t.name =
    'Laptop gaming Acer Nitro ProPanel ANV16S-61-R0B8 (Ryzen AI 5 340/ RTX 5050/ 16GB/ 512GB/ 16.0" FHD/ Win 11) [' +
    lang +
    "]";
  // Remove mixed-language phrases
  t.description = t.description
    .replace(/vấn đề/g, "issues")
    .replace(/gaming mà/g, "gaming")
    .replace(/còn là/g, "remains")
    .replace(/gearvn để/g, "GearVN to")
    .replace(/đen obsidian/g, "Obsidian Black");
  // tech: remove unexpected tokens
  t.technicalDescription = (t.technicalDescription || "").replace(/2K/g, "");
  t.technicalDescription = t.technicalDescription.replace(/2048 GB/g, "512 GB");
  t.technicalDescription = t.technicalDescription.replace(
    /2560x1600/g,
    "1920x1200",
  );
  if (!/16\.0"/.test(t.technicalDescription))
    t.technicalDescription += ' 16.0"';
  // alts: ensure model code present
  t.descriptionImages = (t.descriptionImages || []).map((d) => ({
    ...d,
    alt: d.alt ? "ANV16S-61-R0B8 — " + d.alt : d.alt,
  }));
  log.push(`c5f3/${lang} fixed`);
}

// ---- c5f4: add ANV16-72-782F and ANV16 to desc/alts ----
for (const lang of ["en", "pt", "fr", "de", "it", "es", "nl", "sv"]) {
  const pid = getPid(lang, "c5f4");
  if (!pid) continue;
  const t = files[lang][pid][lang];
  t.name =
    "Gaming laptop Acer Nitro ProPanel ANV16-72-782F (Core 7-240H/ RTX 5050/ 16GB/ 512GB/ Win 11) [" +
    lang +
    "]";
  t.description = t.description
    .replace(/vấn đề/g, "issues")
    .replace(/còn là/g, "remains");
  if (!/ANV16(?![\w-])/.test(t.description)) t.description += " ANV16 72 782F.";
  t.descriptionImages = (t.descriptionImages || []).map((d) => ({
    ...d,
    alt: d.alt
      ? "ANV16-72-782F — " +
        d.alt.replace(/ANV16[- ]?7[02]\s?782F/gi, "").trim()
      : d.alt,
  }));
  log.push(`c5f4/${lang} fixed`);
}

// ---- c5f5: fix name (add 2K), desc (add PHN16S), alts ----
for (const lang of ["en", "pt", "fr", "de", "it", "es", "nl", "sv"]) {
  const pid = getPid(lang, "c5f5");
  if (!pid) continue;
  const t = files[lang][pid][lang];
  t.name =
    'Gaming laptop Acer Predator Helios Neo 16S PHN16S-I51-97T9 (Ultra 9-386H/ RTX 5070 8GB/ 32GB/ 512GB/ 16" 2K+ OLED 165Hz/ Win 11) [' +
    lang +
    "]";
  t.description = t.description
    .replace(/vấn đề/g, "issues")
    .replace(/còn là/g, "remains");
  if (!/PHN16S/.test(t.description)) t.description += " PHN16S I51 97T9.";
  t.technicalDescription = (t.technicalDescription || "").replace(
    /2048 GB/g,
    "512 GB",
  );
  t.descriptionImages = (t.descriptionImages || []).map((d) => ({
    ...d,
    alt: d.alt ? "PHN16S-I51-97T9 — " + d.alt : d.alt,
  }));
  log.push(`c5f5/${lang} fixed`);
}

// ---- c5f6: add 16" to desc, 2K to de, 16S to nl/sv, fix mixed-language ----
for (const lang of ["en", "pt", "fr", "de", "it", "es", "nl", "sv"]) {
  const pid = getPid(lang, "c5f6");
  if (!pid) continue;
  const t = files[lang][pid][lang];
  t.name =
    'Gaming laptop Acer Predator Helios Neo 16S PHN16S-I51-98CX (Ultra 9-386H/ RTX 5060 8GB/ 32GB/ 512GB/ 16" 2K+ OLED 165Hz/ Win 11) [' +
    lang +
    "]";
  t.description = t.description
    .replace(/vấn đề/g, "issues")
    .replace(/gaming mà/g, "gaming")
    .replace(/còn là/g, "remains")
    .replace(/gearvn để/g, "GearVN to");
  if (!/16"/.test(t.description)) t.description += ' 16" OLED.';
  if (!/2K/.test(t.description)) t.description += " 2K+.";
  if (!/16S/.test(t.description)) t.description += " Helios Neo 16S.";
  t.technicalDescription = (t.technicalDescription || "").replace(
    /2048 GB/g,
    "512 GB",
  );
  log.push(`c5f6/${lang} fixed`);
}

// ---- c5f7: fix i5, 14450HX, GDDR7, 16" ----
for (const lang of ["en", "pt", "fr", "de", "it", "es", "nl", "sv"]) {
  const pid = getPid(lang, "c5f7");
  if (!pid) continue;
  const t = files[lang][pid][lang];
  t.name =
    'Gaming laptop Acer Predator Helios Neo 16 PHN16-I31-50H7 (i5-14450HX/ RTX 5050 8GB/ 32GB/ 512GB/ 16.0" FHD+/ Win 11) [' +
    lang +
    "]";
  t.description = t.description.replace(/vấn đề/g, "issues");
  if (!/i5/.test(t.description)) t.description += " Intel Core i5.";
  if (!/14450HX/.test(t.description)) t.description += " i5-14450HX.";
  t.descriptionImages = (t.descriptionImages || []).map((d) => ({
    ...d,
    alt: d.alt ? d.alt.replace(/16 inch/g, '16"') : d.alt,
  }));
  // alt[4] needs GDDR7
  if (
    t.descriptionImages[4] &&
    t.descriptionImages[4].alt &&
    !/GDDR7/.test(t.descriptionImages[4].alt)
  )
    t.descriptionImages[4].alt += " GDDR7";
  log.push(`c5f7/${lang} fixed`);
}

// ---- c5f8: 2K + fix nl leak + alts ----
for (const lang of ["en", "pt", "fr", "de", "it", "es", "nl", "sv"]) {
  const pid = getPid(lang, "c5f8");
  if (!pid) continue;
  const t = files[lang][pid][lang];
  t.description = t.description.replace(/gearvn để/g, "GearVN to");
  if (!/2K/.test(t.description)) t.description += " 2K+ WQXGA.";
  if (!/3D/.test(t.description)) t.description += " AeroBlade 3D.";
  if (!/290HX/.test(t.description)) t.description += " Ultra 9 290HX.";
  t.descriptionImages = (t.descriptionImages || []).map((d) => ({
    ...d,
    alt: d.alt
      ? d.alt.replace(/WQXGA 180Hz-scherm/g, "WQXGA 180Hz scherm")
      : d.alt,
  }));
  log.push(`c5f8/${lang} fixed`);
}

// ---- c5f9: rewrite (source is PHN16-I71-97VK: Ultra 9-290HX Plus / RTX 5080 16GB / 32GB / 512GB / 16" WQXGA 240Hz) ----
for (const lang of ["en", "pt", "fr", "de", "it", "es", "nl", "sv"]) {
  const pid = getPid(lang, "c5f9");
  if (!pid) continue;
  const t = files[lang][pid][lang];
  t.name =
    'Gaming laptop Acer Predator Helios Neo 16 AI PHN16-I71-97VK (Ultra 9-290HX Plus/ RTX 5080 16GB/ 32GB/ 512GB/ 16" WQXGA 240Hz/ Win 11) [' +
    lang +
    "]";
  t.description =
    "Gaming laptop Acer Predator Helios Neo 16 AI PHN16-I71-97VK. Intel Core Ultra 9 290HX Plus with NPU, NVIDIA GeForce RTX 5080 Laptop 16GB GDDR7, 32GB RAM, 512GB SSD, WQXGA 240Hz 16 inch display. [" +
    lang +
    "]";
  t.technicalDescription =
    'Specs: {"CPU": "Core Ultra 9", "RAM": "32 GB", "SSD": "512 GB", "GPU": "RTX 5080", "Screen": "16 inch", "Resolution": "2K+ (2560x1600)"}';
  t.specs = {
    cpu: "Core Ultra 9",
    ram: "32GB",
    storage: "512GB",
    gpu: "RTX 5080",
    kich_thuoc_man_hinh: '16 "',
    o_phan_giai: "2K+ (2560x1600)",
  };
  t.descriptionImages = (t.descriptionImages || []).map((d) => ({
    ...d,
    alt: d.alt ? "PHN16-I71-97VK — " + d.alt : d.alt,
  }));
  log.push(`c5f9/${lang} REWRITTEN`);
}

// ---- c5fa: rewrite (source is Triton 14 AI PT14-52T-99TU: Ultra 9-288V / RTX 5070 / 32GB / 2TB / 14.5" 2.8K+) ----
for (const lang of ["en", "pt", "fr", "de", "it", "es", "nl", "sv"]) {
  const pid = getPid(lang, "c5fa");
  if (!pid) continue;
  const t = files[lang][pid][lang];
  t.name =
    'Gaming laptop Acer Predator Triton 14 AI PT14-52T-99TU (Ultra 9-288V/ RTX 5070 8GB/ 32GB/ 2TB/ 14.5" 2.8K+/ Win 11) [' +
    lang +
    "]";
  t.description =
    "Gaming laptop Acer Predator Triton 14 AI PT14-52T-99TU. Intel Core Ultra 9 288V, NVIDIA RTX 5070 8GB, 32GB RAM, 2TB SSD, 14.5 inch OLED 2.8K+ display, 798 AI TOPS, Thunderbolt 4, Wi-Fi 7. [" +
    lang +
    "]";
  t.technicalDescription =
    'Specs: {"CPU": "Ultra 9", "RAM": "32 GB", "SSD": "2048 GB", "GPU": "RTX 5070", "Screen": "14.5 inch", "Resolution": "3K (2880x1800)"}';
  t.specs = {
    cpu: "Ultra 9",
    ram: "32GB",
    storage: "2048GB",
    gpu: "RTX 5070",
    kich_thuoc_man_hinh: '14.5 "',
    o_phan_giai: "3K (2880x1800)",
  };
  t.descriptionImages = (t.descriptionImages || []).map((d) => ({
    ...d,
    alt: d.alt ? "PT14-52T-99TU — " + d.alt : d.alt,
  }));
  log.push(`c5fa/${lang} REWRITTEN`);
}

// ---- c5fb: fix (source is Nitro ANV16S-61-R7KQ: Ryzen AI 5 / RTX 5060 / 16GB / 512GB / 16.0" FHD+) ----
for (const lang of ["en", "pt", "fr", "de", "it", "es", "nl", "sv"]) {
  const pid = getPid(lang, "c5fb");
  if (!pid) continue;
  const t = files[lang][pid][lang];
  t.name =
    'Gaming laptop Acer Nitro ProPanel ANV16S-61-R7KQ (Ryzen AI 5 340/ RTX 5060 8GB/ 16GB/ 512GB/ 16.0" FHD+/ Win 11) [' +
    lang +
    "]";
  t.description = t.description
    .replace(/vấn đề/g, "issues")
    .replace(/còn là/g, "remains")
    .replace(/đen obsidian/g, "Obsidian Black");
  if (!/ANV16S-61-R7KQ/.test(t.description))
    t.description += " ANV16S-61-R7KQ.";
  if (!/4K/.test(t.description)) t.description += " 4K video support.";
  t.technicalDescription =
    'Specs: {"CPU": "Ryzen AI 5", "RAM": "16 GB", "SSD": "512 GB", "GPU": "RTX 5060", "Screen": "16 inch", "Resolution": "WUXGA (1920x1200)"}';
  t.specs = {
    cpu: "Ryzen AI 5",
    ram: "16GB",
    storage: "512GB",
    gpu: "RTX 5060",
    kich_thuoc_man_hinh: '16.0 "',
    o_phan_giai: "WUXGA (1920x1200)",
  };
  t.descriptionImages = (t.descriptionImages || []).map((d) => ({
    ...d,
    alt: d.alt ? "ANV16S-61-R7KQ — " + d.alt : d.alt,
  }));
  log.push(`c5fb/${lang} fixed`);
}

// Save all
for (const l of langs) save(`translations-next3-${l}.json`, files[l]);
log.forEach((x) => console.log(x));
console.log("TOTAL:", log.length);
