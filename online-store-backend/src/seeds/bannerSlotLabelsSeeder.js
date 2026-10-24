const StaticTranslation = require('../models/StaticTranslation');
const { getActiveLangCodes } = require('../config/languageInventory');
const { CLI_SYMBOLS } = require('../utils/cliSymbols');

// Base translations - only seed these if language is active
const bannerSlotLabelsBase = {
  VI: {
    slot_sitewide_top: 'banner_slot_sitewide_top',
    slot_homepage_hero: 'banner_slot_homepage_hero',
    slot_homepage_warranty: 'banner_slot_homepage_warranty',
    slot_homepage_left: 'banner_slot_homepage_left',
    slot_homepage_right: 'banner_slot_homepage_right',
    slot_homepage_inline: 'banner_slot_homepage_inline',
    slot_products_top: 'banner_slot_products_top',
    slot_category_top: 'banner_slot_category_top',
    slot_product_top: 'banner_slot_product_top',
  },
  EN: {
    slot_sitewide_top: 'Sitewide Top',
    slot_homepage_hero: 'Homepage Hero',
    slot_homepage_warranty: 'Homepage Warranty Info',
    slot_homepage_left: 'Homepage Left Sidebar',
    slot_homepage_right: 'Homepage Right Sidebar',
    slot_homepage_inline: 'Homepage Inline Content',
    slot_products_top: 'Products Top',
    slot_category_top: 'Category Top',
    slot_product_top: 'Product Details Top',
  },
  PT: {
    slot_sitewide_top: 'Topo do Site',
    slot_homepage_hero: 'Hero da Página Inicial',
    slot_homepage_warranty: 'Informações de Garantia',
    slot_homepage_left: 'Barra Lateral Esquerda',
    slot_homepage_right: 'Barra Lateral Direita',
    slot_homepage_inline: 'Conteúdo em Linha',
    slot_products_top: 'Topo de Produtos',
    slot_category_top: 'Topo de Categoria',
    slot_product_top: 'Topo de Detalhes do Produto',
  },
  FR: {
    slot_sitewide_top: 'Haut du Site',
    slot_homepage_hero: 'Héros de la Page d\'Accueil',
    slot_homepage_warranty: 'Informations de Garantie',
    slot_homepage_left: 'Barre Latérale Gauche',
    slot_homepage_right: 'Barre Latérale Droite',
    slot_homepage_inline: 'Contenu en Ligne',
    slot_products_top: 'Haut des Produits',
    slot_category_top: 'Haut de la Catégorie',
    slot_product_top: 'Haut des Détails du Produit',
  },
  DE: {
    slot_sitewide_top: 'Website-weit oben',
    slot_homepage_hero: 'Homepage-Hero',
    slot_homepage_warranty: 'Garantieinformationen',
    slot_homepage_left: 'Linke Seitenleiste',
    slot_homepage_right: 'Rechte Seitenleiste',
    slot_homepage_inline: 'Inline-Inhalt',
    slot_products_top: 'Produkte oben',
    slot_category_top: 'Kategorie oben',
    slot_product_top: 'Produktdetails oben',
  },
  IT: {
    slot_sitewide_top: 'Inizio Sito',
    slot_homepage_hero: 'Hero della Homepage',
    slot_homepage_warranty: 'Informazioni sulla Garanzia',
    slot_homepage_left: 'Barra Laterale Sinistra',
    slot_homepage_right: 'Barra Laterale Destra',
    slot_homepage_inline: 'Contenuto in Linea',
    slot_products_top: 'Inizio Prodotti',
    slot_category_top: 'Inizio Categoria',
    slot_product_top: 'Inizio Dettagli Prodotto',
  },
  ES: {
    slot_sitewide_top: 'Parte Superior del Sitio',
    slot_homepage_hero: 'Hero de la Página Principal',
    slot_homepage_warranty: 'Información de Garantía',
    slot_homepage_left: 'Barra Lateral Izquierda',
    slot_homepage_right: 'Barra Lateral Derecha',
    slot_homepage_inline: 'Contenido en Línea',
    slot_products_top: 'Parte Superior de Productos',
    slot_category_top: 'Parte Superior de Categoría',
    slot_product_top: 'Parte Superior de Detalles del Producto',
  },
  NL: {
    slot_sitewide_top: 'Website-brede bovenkant',
    slot_homepage_hero: 'Homepage Hero',
    slot_homepage_warranty: 'Garantie-informatie',
    slot_homepage_left: 'Linker zijbalk',
    slot_homepage_right: 'Rechter zijbalk',
    slot_homepage_inline: 'Inline-inhoud',
    slot_products_top: 'Bovenkant Producten',
    slot_category_top: 'Bovenkant Categorie',
    slot_product_top: 'Bovenkant Productdetails',
  },
  SV: {
    slot_sitewide_top: 'Webbplats-överst',
    slot_homepage_hero: 'Hemsida Hero',
    slot_homepage_warranty: 'Garantiinformation',
    slot_homepage_left: 'Vänster sidofält',
    slot_homepage_right: 'Höger sidofält',
    slot_homepage_inline: 'Inline-innehål',
    slot_products_top: 'Produkter överst',
    slot_category_top: 'Kategori överst',
    slot_product_top: 'Produktinformation överst',
  },
};

// Filter to only active languages
const getActiveTranslations = () => {
  const activeLangs = getActiveLangCodes();
  return Object.fromEntries(
    Object.entries(bannerSlotLabelsBase).filter(([langKey]) =>
      activeLangs.includes(langKey.toLowerCase())
    )
  );
};

const bannerSlotLabelsTranslations = getActiveTranslations();

const seedBannerSlotLabels = async () => {
  try {
    console.log(`${CLI_SYMBOLS.seed} Seeding banner slot labels translations...`);

    // Dynamically build langMap from active languages
    const activeLangs = getActiveLangCodes();
    const langMap = Object.fromEntries(
      activeLangs.map(code => [code.toUpperCase(), code])
    );

    for (const [langKey, langCode] of Object.entries(langMap)) {
      await StaticTranslation.findOneAndUpdate(
        { code: langCode, namespace: 'banner', isDeleted: false },
        {
          code: langCode,
          namespace: 'banner',
          translations: bannerSlotLabelsTranslations[langKey],
          isDeleted: false,
        },
        { upsert: true, returnDocument: 'after' }
      );
      console.log(`${CLI_SYMBOLS.success} ${langKey} banner slot labels created/updated`);
    }
  } catch (error) {
    console.error(`${CLI_SYMBOLS.error} Error seeding banner slot labels:`, error.message);
    throw error;
  }
};

module.exports = seedBannerSlotLabels;
