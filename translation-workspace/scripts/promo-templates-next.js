// Promotion title / gift-name translation templates for assistant batches.
// Used by build-import-next.js: PROMO.translate(promo, targetLang) returns
// { title, giftProductName } translations, or null to keep the source text.
// Hard rule: never translate brand/model tokens (Acer, Predator, Logitech,
// G304, GSync, KG241Y-X1, ...) — validators count technical tokens, so only
// the generic Vietnamese noun around them is replaced.
"use strict";

// Generic Vietnamese nouns → per-language replacement (brand tokens stay).
const NOUNS = {
  balo: { vi: /balo/i, words: { en: "backpack", pt: "mochila", fr: "sac à dos", de: "Rucksack", it: "zaino", es: "mochila", nl: "rugzak", sv: "ryggsäck" } },
  chuot: { vi: /chuột/i, words: { en: "mouse", pt: "rato", fr: "souris", de: "Maus", it: "mouse", es: "ratón", nl: "muis", sv: "mus" } },
  man_hinh: { vi: /màn hình/i, words: { en: "monitor", pt: "monitor", fr: "écran", de: "Monitor", it: "monitor", es: "monitor", nl: "monitor", sv: "skärm" } },
  ghe: { vi: /ghế(?! gaming)/i, words: { en: "gaming chair", pt: "cadeira gaming", fr: "chaise gaming", de: "Gaming-Stuhl", it: "sedia gaming", es: "silla gaming", nl: "gaming-stoel", sv: "gamingstol" } },
  ban_phim: { vi: /bàn phím/i, words: { en: "keyboard", pt: "teclado", fr: "clavier", de: "Tastatur", it: "tastiera", es: "teclado", nl: "toetsenbord", sv: "tangentbord" } },
  tai_nghe: { vi: /tai nghe/i, words: { en: "headset", pt: "auscultadores", fr: "casque", de: "Headset", it: "cuffie", es: "auriculares", nl: "headset", sv: "headset" } },
  the_cao: { vi: /e-?gift code|thẻ cào/i, words: { en: "e-Gift code", pt: "código e-Gift", fr: "code e-Gift", de: "e-Gift-Code", it: "codice e-Gift", es: "código e-Gift", nl: "e-Gift-code", sv: "e-Gift-kod" } },
  khong_day: { vi: /không dây\s*/i, words: { en: "wireless ", pt: "sem fios ", fr: "sans fil ", de: "kabellos ", it: "wireless ", es: "inalámbrico ", nl: "draadloos ", sv: "trådlös " } },
};

// Trailing Vietnamese qualifiers often glued to the model token
// (e.g. "KG241Y-X1 24\" IPS 200Hz Gsync chuyên game").
const QUALIFIERS = [
  { vi: /,?\s*chuyên game/i, words: { en: " for gaming", pt: " para gaming", fr: " pour le gaming", de: " für Gaming", it: " per il gaming", es: " para gaming", nl: " voor gaming", sv: " för gaming" } },
  { vi: /,?\s*cho game thủ/i, words: { en: " for gamers", pt: " para gamers", fr: " pour les gamers", de: " für Gamer", it: " per i gamer", es: " para gamers", nl: " voor gamers", sv: " för gamers" } },
  { vi: /,?\s*chuyên game va lam viec|,?\s*chuyên game & làm việc/i, words: { en: " for gaming and work", pt: " para gaming e trabalho", fr: " pour le gaming et le travail", de: " für Gaming und Arbeit", it: " per gaming e lavoro", es: " para gaming y trabajo", nl: " voor gaming en werk", sv: " för gaming och arbete" } },
  { vi: /,?\s*khi mua laptop|,?\s*khi mua laptop acer/i, words: { en: " with laptop purchase", pt: " na compra de laptop", fr: " à l'achat d'un laptop", de: " beim Laptopkauf", it: " all'acquisto di un laptop", es: " al comprar un laptop", nl: " bij aankoop van een laptop", sv: " vid laptopköp" } },
];

// Vietnamese sentence templates → per-language title templates.
const TEMPLATES = [
  // "Tặng ngay 1 x <gift> (trị giá <amount>)"
  {
    vi: /^tặng ngay 1 x (.+?) \(trị giá (.+?)\)\s*$/i,
    giftIdx: 1,
    amountIdx: 2,
    build: (gift, amount) => ({
      en: `Get 1 x ${gift} free (worth ${amount})`,
      pt: `Receba 1 x ${gift} de brinde (valor ${amount})`,
      fr: `Recevez 1 x ${gift} offert (d'une valeur de ${amount})`,
      de: `1 x ${gift} gratis dazu (Wert ${amount})`,
      it: `In omaggio 1 x ${gift} (del valore di ${amount})`,
      es: `Recibe 1 x ${gift} de regalo (valorado en ${amount})`,
      nl: `Gratis 1 x ${gift} (ter waarde van ${amount})`,
      sv: `Få 1 x ${gift} gratis (värt ${amount})`,
    }),
  },
  // "[Laptop] Giảm 1% tối đa 500k cho HSSV khi mua laptop"
  {
    vi: /^\[laptop\] giảm (\d+%) tối đa (\S+) cho hssv khi mua laptop$/i,
    giftIdx: -1,
    build: (pct, max) => ({
      en: `[Laptop] ${pct} off up to ${max} for students`,
      pt: `[Laptop] ${pct} de desconto, máx. ${max}, para estudantes`,
      fr: `[Laptop] ${pct} de remise, max ${max}, pour étudiants`,
      de: `[Laptop] ${pct} Rabatt, max. ${max}, für Studenten`,
      it: `[Laptop] ${pct} di sconto, max ${max}, per studenti`,
      es: `[Laptop] ${pct} de descuento, máx. ${max}, para estudiantes`,
      nl: `[Laptop] ${pct} korting, max ${max}, voor studenten`,
      sv: `[Laptop] ${pct} rabatt, max ${max}, för studenter`,
    }),
  },
];

function translateGiftName(name, lang) {
  if (!name) return name;
  let out = String(name);
  for (const q of QUALIFIERS) {
    if (q.vi.test(out)) out = out.replace(q.vi, q.words[lang] || "");
  }
  for (const key of Object.keys(NOUNS)) {
    const n = NOUNS[key];
    if (n.vi.test(out)) out = out.replace(n.vi, n.words[lang] || "");
  }
  return out;
}

// Translate a promo object. Returns null when nothing safe to change —
// caller keeps the source promo untouched in that case.
function translate(promo, lang) {
  if (!promo || !lang) return null;
  const title = String(promo.title || "");
  for (const t of TEMPLATES) {
    const m = title.match(t.vi);
    if (!m) continue;
    const giftRaw = t.giftIdx >= 0 ? m[t.giftIdx] : promo.giftProductName;
    const gift = translateGiftName(giftRaw || promo.giftProductName, lang);
    const amount = t.amountIdx ? m[t.amountIdx] : null;
    const built = amount != null ? t.build(gift, amount) : t.build(...m.slice(1));
    const out = built[lang];
    if (!out) return null;
    return { title: out, giftProductName: gift, discountText: out, scope: promo.scope || "" };
  }
  return null;
}

module.exports = { translate, translateGiftName };
