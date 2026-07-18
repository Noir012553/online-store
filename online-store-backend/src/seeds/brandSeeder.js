const Brand = require('../models/Brand');
const { getMessage } = require('../i18n/messages');

const brandsData = [
  {
    name: "Dell",
    logo: "https://upload.wikimedia.org/wikipedia/commons/4/48/Dell_Logo.svg",
    key: "dell",
  },
  {
    name: "HP",
    logo: "https://upload.wikimedia.org/wikipedia/commons/a/ad/HP_logo_2012.svg",
    key: "hp",
  },
  {
    name: "Lenovo",
    logo: "https://upload.wikimedia.org/wikipedia/commons/b/b8/Lenovo_logo_2015.svg",
    key: "lenovo",
  },
  {
    name: "Asus",
    logo: "https://upload.wikimedia.org/wikipedia/commons/b/b0/ASUS_Corporate_Logo.svg",
    key: "asus",
  },
  {
    name: "Acer",
    logo: "https://upload.wikimedia.org/wikipedia/commons/0/00/Acer_2011.svg",
    key: "acer",
  },
  {
    name: "MSI",
    logo: "https://upload.wikimedia.org/wikipedia/vi/6/6c/Msi_logo.png",
    key: "msi",
  },
];

const seedBrands = async () => {
  try {
    // Check if brands already exist
    const existingBrands = await Brand.find({ isDeleted: false });

    if (existingBrands.length > 0) {
      return existingBrands;
    }

    // Insert all brands
    const createdBrands = await Brand.insertMany(brandsData);
    return createdBrands;
  } catch (error) {
    const { getDefaultLanguage } = require('../config/languageInventory');
    const seedLang = getDefaultLanguage().code.toUpperCase();
    console.error(getMessage(seedLang, 'seeder-messages.brand_seeding_error', {
      error: error.message
    }));
    throw error;
  }
};

module.exports = seedBrands;
