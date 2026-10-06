require('dotenv').config();
const mongoose = require('mongoose');
const Review = require('../models/Review');
const ProductTranslationSeederService = require('../services/productTranslationSeederService');
const translationSeederHelper = require('../services/translationSeederHelper');
const { connectMongo } = require('../config/mongoConnection');
const { getActiveLangCodes, getDefaultLanguage, isSupportedLanguage } = require('../config/languageInventory');

const args = process.argv.slice(2);
const parseOptions = () => {
  const languagesArg = args.find(argument => argument.startsWith('--languages='));
  const sourceLang = getDefaultLanguage().code;
  const targetLanguages = languagesArg
    ? [...new Set(languagesArg.slice('--languages='.length).split(',').map(language => language.trim()).filter(Boolean))]
    : getActiveLangCodes().filter(language => language !== sourceLang);
  const invalidLanguage = targetLanguages.find(language => !isSupportedLanguage(language) || language === sourceLang);

  if (invalidLanguage) throw new Error(`Ngôn ngữ đích không hợp lệ: ${invalidLanguage}`);
  if (targetLanguages.length === 0) throw new Error('Không có ngôn ngữ đích để dịch');

  return {
    sourceLang,
    targetLanguages,
    productsOnly: args.includes('--products-only'),
    reviewsOnly: args.includes('--reviews-only'),
  };
};

const main = async () => {
  const { sourceLang, targetLanguages, productsOnly, reviewsOnly } = parseOptions();
  if (productsOnly && reviewsOnly) throw new Error('Chỉ chọn một trong --products-only hoặc --reviews-only');
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI environment variable is not set');

  await connectMongo();
  let hasNonRateLimitErrors = false;
  console.log('[TranslationRetry] Không chạy crawler/import/clear; chỉ thử lại bản dịch chưa được duyệt.');

  if (!reviewsOnly) {
    for (const targetLang of targetLanguages) {
      const summary = await ProductTranslationSeederService.translateAllProducts(targetLang, sourceLang);
      console.log(`[TranslationRetry] Sản phẩm ${targetLang}: ${summary.successCount} thành công, ${summary.rateLimitCount} rate limit, ${summary.errorCount} lỗi khác.`);
      hasNonRateLimitErrors ||= summary.errorCount > 0;
    }
  }

  if (!productsOnly) {
    const reviews = await Review.find({ isDeleted: false }).lean();
    const summary = await translationSeederHelper.translateReviewsBatch(reviews, targetLanguages);
    console.log(`[TranslationRetry] Review: ${summary.translated} thành công, ${summary.rateLimitFailed} lỗi rate limit, ${summary.nonRateLimitFailed} lỗi khác.`);
    hasNonRateLimitErrors ||= summary.nonRateLimitFailed > 0;
  }

  if (hasNonRateLimitErrors) process.exitCode = 1;
};

main()
  .catch(error => {
    console.error(`[TranslationRetry] ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });
