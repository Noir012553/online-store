const Category = require('../models/Category');
const CategoryCatalogTranslationCache = require('../models/CategoryCatalogTranslationCache');

const TRANSLATIONS = {
  keyboard: {
    vi: { name: 'Bàn phím', description: 'Bàn phím máy tính chất lượng cao dành cho văn phòng và game thủ' },
    en: { name: 'Keyboard', description: 'High quality computer keyboards for office and gaming' },
    pt: { name: 'Teclado', description: 'Teclados de computador de alta qualidade para escritório e jogos' },
    fr: { name: 'Clavier', description: "Claviers d'ordinateur de haute qualité pour bureau et gaming" },
    de: { name: 'Tastatur', description: 'Hochwertige Computertastaturen für Büro und Gaming' },
    it: { name: 'Tastiera', description: 'Tastiere per computer di alta qualità per ufficio e gaming' },
    es: { name: 'Teclado', description: 'Teclados de computadora de alta calidad para oficina y gaming' },
    nl: { name: 'Toetsenbord', description: 'Hoogwaardige computertoetsenborden voor kantoor en gaming' },
    sv: { name: 'Tangentbord', description: 'Högkvalitativa tangentbord för kontor och gaming' },
  },
  mouse: {
    vi: { name: 'Chuột', description: 'Chuột máy tính công thái học, độ chính xác cao cho công việc và gaming' },
    en: { name: 'Mouse', description: 'Ergonomic computer mice with high precision for work and gaming' },
    pt: { name: 'Mouse', description: 'Mouses ergonômicos de alta precisão para trabalho e jogos' },
    fr: { name: 'Souris', description: 'Souris ergonomiques haute précision pour travail et gaming' },
    de: { name: 'Maus', description: 'Ergonomische Computermäuse mit hoher Präzision für Arbeit und Gaming' },
    it: { name: 'Mouse', description: 'Mouse ergonomici ad alta precisione per lavoro e gaming' },
    es: { name: 'Ratón', description: 'Ratones ergonómicos de alta precisión para trabajo y gaming' },
    nl: { name: 'Muis', description: 'Ergonomische computermuizen met hoge precisie voor werk en gaming' },
    sv: { name: 'Mus', description: 'Ergonomiska datormöss med hög precision för arbete och gaming' },
  },
  headphones: {
    vi: { name: 'Tai nghe', description: 'Tai nghe máy tính với âm thanh sống động phù hợp cho công việc và giải trí' },
    en: { name: 'Headphones', description: 'Computer headphones with dynamic sound suitable for work and entertainment' },
    pt: { name: 'Fones de ouvido', description: 'Fones de ouvido com som dinâmico para trabalho e entretenimento' },
    fr: { name: 'Casque audio', description: 'Casques audio avec son dynamique pour le travail et le divertissement' },
    de: { name: 'Kopfhörer', description: 'Computerkopfhörer mit dynamischem Klang für Arbeit und Unterhaltung' },
    it: { name: 'Cuffie', description: 'Cuffie per computer con suono dinamico per lavoro e intrattenimento' },
    es: { name: 'Auriculares', description: 'Auriculares con sonido dinámico para trabajo y entretenimiento' },
    nl: { name: 'Koptelefoon', description: 'Computerkoptelefoons met dynamisch geluid voor werk en entertainment' },
    sv: { name: 'Hörlurar', description: 'Datorkoptelefoner med dynamiskt ljud för arbete och underhållning' },
  },
  cooling: {
    vi: { name: 'Tản nhiệt', description: 'Giải pháp tản nhiệt máy tính hiệu quả giúp CPU và GPU hoạt động tối ưu' },
    en: { name: 'Cooling', description: 'Efficient computer cooling solutions for optimal CPU and GPU cooling' },
    pt: { name: 'Refrigeração', description: 'Soluções eficientes de refrigeração para CPU e GPU ideais' },
    fr: { name: 'Refroidissement', description: 'Solutions de refroidissement efficaces pour CPU et GPU optimaux' },
    de: { name: 'Kühlung', description: 'Effiziente Computerkühllösungen für optimale CPU- und GPU-Kühlung' },
    it: { name: 'Raffreddamento', description: 'Soluzioni di raffreddamento efficienti per CPU e GPU ottimali' },
    es: { name: 'Refrigeración', description: 'Soluciones de refrigeración eficientes para CPU y GPU óptimas' },
    nl: { name: 'Koeling', description: 'Efficiënte koeloplossingen voor optimale CPU- en GPU-prestaties' },
    sv: { name: 'Kylning', description: 'Effektiva kyllösningar för optimal CPU- och GPU-kylning' },
  },
  gaming_laptop: {
    vi: { name: 'Laptop Gaming', description: 'Laptop gaming hiệu năng cao với GPU mạnh mẽ phù hợp cho các tựa game AAA' },
    en: { name: 'Gaming Laptop', description: 'High performance gaming laptops with powerful GPU suitable for AAA games' },
    pt: { name: 'Laptop Gamer', description: 'Laptops gamer de alto desempenho com GPU potente para jogos AAA' },
    fr: { name: 'PC Portable Gaming', description: 'PC portables gaming haute performance avec GPU puissant pour jeux AAA' },
    de: { name: 'Gaming Laptop', description: 'Hochleistungs-Gaming-Laptops mit leistungsstarker GPU für AAA-Spiele' },
    it: { name: 'Laptop da Gaming', description: 'Laptop da gaming ad alte prestazioni con GPU potente per giochi AAA' },
    es: { name: 'Laptop Gaming', description: 'Laptops gaming de alto rendimiento con GPU potente para juegos AAA' },
    nl: { name: 'Gaming Laptop', description: 'High-performance gaming laptops met krachtige GPU voor AAA-games' },
    sv: { name: 'Gaming Laptop', description: 'Högpresterande gaming-laptops med kraftfull GPU för AAA-spel' },
  },
  office_laptop: {
    vi: { name: 'Laptop Văn phòng', description: 'Laptop văn phòng nhỏ gọn, pin lâu phục vụ công việc hàng ngày' },
    en: { name: 'Office Laptop', description: 'Lightweight office laptops with long battery life for daily work' },
    pt: { name: 'Notebook Corporativo', description: 'Notebooks leves para escritório com longa duração de bateria' },
    fr: { name: 'PC Portable Professionnel', description: 'PC portables légers avec longue autonomie pour le travail quotidien' },
    de: { name: 'Business Laptop', description: 'Leichte Business-Laptops mit langer Akkulaufzeit für die tägliche Arbeit' },
    it: { name: 'Laptop da Ufficio', description: 'Laptop da ufficio leggeri con lunga autonomia per il lavoro quotidiano' },
    es: { name: 'Laptop de Oficina', description: 'Laptops de oficina ligeras con larga duración de batería para trabajo diario' },
    nl: { name: 'Zakelijke Laptop', description: 'Lichtgewicht zakelijke laptops met lange batterijduur voor dagelijks werk' },
    sv: { name: 'Kontorsbärbar dator', description: 'Lätta kontorsbärbara datorer med lång batteritid för dagligt arbete' },
  },
};

const SUPPORTED_LANGS = ['vi', 'en', 'pt', 'fr', 'de', 'it', 'es', 'nl', 'sv'];
const CATEGORY_KEYS = Object.keys(TRANSLATIONS);

const seedCategoryTranslations = async () => {
  const categories = await Category.find({
    key: { $in: CATEGORY_KEYS },
    isDeleted: false,
  }).lean();

  if (categories.length === 0) {
    console.warn('⚠️  No categories found for translation seeding. Run categories seeder first.');
    return;
  }

  const categoriesByKey = new Map(categories.map(c => [c.key, c]));
  const ops = [];

  for (const key of CATEGORY_KEYS) {
    const category = categoriesByKey.get(key);
    if (!category) continue;

    for (const lang of SUPPORTED_LANGS) {
      const t = TRANSLATIONS[key]?.[lang];
      if (!t) continue;

      ops.push({
        updateOne: {
          filter: { entityId: String(category._id), targetLang: lang },
          update: {
            $set: {
              entityId: String(category._id),
              targetLang: lang,
              name: t.name,
              description: t.description,
              status: 'success',
              retryCount: 0,
              lastErrorMessage: null,
              lastRetryAt: null,
              updatedAt: new Date(),
            },
          },
          upsert: true,
        },
      });
    }
  }

  if (ops.length > 0) {
    await CategoryCatalogTranslationCache.bulkWrite(ops);
  }

  return categories;
};

module.exports = seedCategoryTranslations;
