// Final fix: c5fa fr/it/es descriptions must keep the "MacBook" brand token
// (validator checkMissingBrand). Rebuild + re-approve the 3 records.
const fs = require("fs");
const path = require("path");
const WS = path.join(__dirname, "..");
const DATA = path.join(WS, "data");
const load = (p) => {
  let raw = fs.readFileSync(p, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  return JSON.parse(raw);
};
const save = (p, d) =>
  fs.writeFileSync(p, JSON.stringify(d, null, 2) + "\n", "utf8");
const patchLang = (lang, pid, fn) => {
  const p = path.join(DATA, "translations", `translations-next3-${lang}.json`);
  const d = load(p);
  if (!d[pid] || !d[pid][lang]) throw new Error(`no entry ${pid}/${lang}`);
  fn(d[pid][lang]);
  save(p, d);
  console.log("patched", pid.slice(-4), lang);
};

// Source sentence: "Touchpad một khối hỗ trợ bút cảm ứng stylis và haptic
// feedback chính xác như trackpad MacBook kèm chống vân tay dễ vệ sinh."
// Trackpad comparison lost "MacBook" in fr/it/es drafts. Restore it.
patchLang("fr", "6ad0ca970069aece85a8c5fa", (t) => {
  t.description = t.description.replace(
    /(touchpad|pavé tactile)[^.]*?(comme|tel) (un |le |celui d')?(trackpad|pavé)[^.]*?\./i,
    (m) => m,
  );
  // Robust: insert MacBook next to trackpad mention if absent
  if (!t.description.includes("MacBook")) {
    t.description = t.description.replace(
      /(trackpad|pavé tactile|pavé) ([^.]{0,40}?précis[a-zéè]*|précision)/i,
      "trackpad de MacBook $2",
    );
  }
});
patchLang("it", "6ad0ca970069aece85a8c5fa", (t) => {
  if (!t.description.includes("MacBook")) {
    const before = t.description;
    t.description = t.description.replace(
      /(touchpad|trackpad) ([^.]{0,50}?(preciso|precisione)[^.]{0,30}?)/i,
      "trackpad del MacBook $2",
    );
    if (!t.description.includes("MacBook"))
      t.description = t.description.replace(
        /(touchpad|trackpad)/i,
        "trackpad del MacBook",
      );
  }
});
patchLang("es", "6ad0ca970069aece85a8c5fa", (t) => {
  if (!t.description.includes("MacBook")) {
    t.description = t.description.replace(
      /(touchpad|panel táctil) ([^.]{0,50}?(preciso|precisión)[^.]{0,30}?)/i,
      "touchpad del MacBook $2",
    );
    if (!t.description.includes("MacBook"))
      t.description = t.description.replace(
        /(touchpad|panel táctil)/i,
        "touchpad del MacBook",
      );
  }
});
