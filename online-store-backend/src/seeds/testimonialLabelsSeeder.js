const StaticTranslation = require('../models/StaticTranslation');
const { getActiveLangCodes } = require('../config/languageInventory');

const testimonialLabelsBase = {
  VI: {
    role_customer: 'testimonial_role_customer',
    anonymous_customer: 'testimonial_anonymous_customer',
  },
  EN: {
    role_customer: 'Customer',
    anonymous_customer: 'Anonymous Customer',
  },
  PT: {
    role_customer: 'Cliente',
    anonymous_customer: 'Cliente Anônimo',
  },
  FR: {
    role_customer: 'Client',
    anonymous_customer: 'Client Anonyme',
  },
  DE: {
    role_customer: 'Kunde',
    anonymous_customer: 'Anonymer Kunde',
  },
  IT: {
    role_customer: 'Cliente',
    anonymous_customer: 'Cliente Anonimo',
  },
  ES: {
    role_customer: 'Cliente',
    anonymous_customer: 'Cliente Anónimo',
  },
  NL: {
    role_customer: 'Klant',
    anonymous_customer: 'Anonieme Klant',
  },
  SV: {
    role_customer: 'Kund',
    anonymous_customer: 'Anonym Kund',
  },
};

const getActiveTranslations = () => {
  const activeLangs = getActiveLangCodes();
  return Object.fromEntries(
    Object.entries(testimonialLabelsBase).filter(([langKey]) =>
      activeLangs.includes(langKey.toLowerCase())
    )
  );
};

const testimonialLabelsTranslations = getActiveTranslations();

const seedTestimonialLabels = async () => {
  try {
    console.log('🌱 Seeding testimonial labels translations...');

    // Dynamically build langMap from active languages
    const activeLangs = getActiveLangCodes();
    const langMap = Object.fromEntries(
      activeLangs.map(code => [code.toUpperCase(), code])
    );

    for (const [langKey, langCode] of Object.entries(langMap)) {
      await StaticTranslation.findOneAndUpdate(
        { code: langCode, namespace: 'testimonial', isDeleted: false },
        {
          code: langCode,
          namespace: 'testimonial',
          translations: testimonialLabelsTranslations[langKey],
          isDeleted: false,
        },
        { upsert: true, returnDocument: 'after' }
      );
      console.log(`✅ ${langKey} testimonial labels created/updated`);
    }
  } catch (error) {
    console.error('❌ Error seeding testimonial labels:', error.message);
    throw error;
  }
};

module.exports = seedTestimonialLabels;
