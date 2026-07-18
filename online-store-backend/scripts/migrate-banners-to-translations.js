require('dotenv').config();
const mongoose = require('mongoose');
const { Banner, SUPPORTED_LANGUAGES } = require('../src/models/Banner');
const { BannerTranslation } = require('../src/models/BannerTranslation');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/online-store');
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    process.exit(1);
  }
};

const migrateBannersToTranslations = async () => {
  try {
    console.log('Starting banner translation migration...');

    const banners = await Banner.find({}).lean();
    console.log(`Found ${banners.length} banners to migrate`);

    let createdCount = 0;
    let updatedCount = 0;
    let errorCount = 0;

    for (const banner of banners) {
      try {
        for (const lang of SUPPORTED_LANGUAGES) {
          // Get translation data from banner fields
          const translationData = {
            title: banner.title?.[lang] || '',
            subtitle: banner.subtitle?.[lang] || '',
            description: banner.description?.[lang] || '',
            ctaText: banner.ctaText?.[lang] || '',
          };

          // Check if we have any content for this language
          const hasContent = Object.values(translationData).some(field => String(field).trim());
          if (!hasContent) continue;

          // Check if translation already exists
          const existing = await BannerTranslation.findOne({
            bannerId: banner._id,
            language: lang,
          });

          if (existing) {
            // Update existing
            Object.assign(existing, translationData);
            await existing.save();
            updatedCount++;
          } else {
            // Create new
            const newTranslation = new BannerTranslation({
              bannerId: banner._id,
              language: lang,
              ...translationData,
            });
            await newTranslation.save();
            createdCount++;
          }
        }
      } catch (error) {
        console.error(`Error migrating banner ${banner._id}:`, error.message);
        errorCount++;
      }
    }

    console.log(`\nMigration completed:`);
    console.log(`  Created: ${createdCount} translations`);
    console.log(`  Updated: ${updatedCount} translations`);
    console.log(`  Errors: ${errorCount} banners`);
  } catch (error) {
    console.error('Migration error:', error.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
};

connectDB().then(migrateBannersToTranslations);
