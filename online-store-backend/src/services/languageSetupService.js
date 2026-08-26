const Language = require('../models/Language');
const TranslationSeederService = require('./translationSeederService');
const ProductTranslationSeederService = require('./productTranslationSeederService');
const LanguageService = require('./languageService');
const distributedLockService = require('./distributedLockService');
const { getDefaultLanguage } = require('../config/languageInventory');
const { CLI_SYMBOLS } = require('../utils/cliSymbols');

const activeSetups = new Set();

const markSetupFailed = async (langCode) => {
  await Language.updateOne(
    { code: langCode },
    { $set: { isReady: false, isActive: false }, $unset: { setupCompletedAt: 1 } },
  );
};

const runLanguageSetup = async (langCode) => {
  if (activeSetups.has(langCode)) return false;
  activeSetups.add(langCode);

  let setupFailed = false;
  let lockId = null;
  const lockKey = `language-setup:${langCode}`;
  try {
    await distributedLockService.initialize();
    lockId = await distributedLockService.acquireLock(lockKey, 6 * 60 * 60);
    if (!lockId) return false;

    const language = await Language.findOne({ code: langCode }).lean();
    if (!language || language.isReady) return false;

    const defaultLang = getDefaultLanguage().code;
    console.log(`[Language] ${CLI_SYMBOLS.location} Starting setup for ${langCode}`);

    try {
      const clonedCount = await TranslationSeederService.cloneStaticTranslations(defaultLang, langCode);
      if (clonedCount > 0) {
        const { translatedCount, errorCount } = await TranslationSeederService.translateStaticTranslations(
          langCode,
          defaultLang,
        );
        setupFailed = errorCount > 0;
        console.log(`[Language] ${CLI_SYMBOLS.check} Phase 1 ${langCode}: ${translatedCount} translated, ${errorCount} errors`);
      }
    } catch (error) {
      setupFailed = true;
      console.error(`[Language] ${CLI_SYMBOLS.error} Phase 1 failed for ${langCode}:`, error.message);
    }

    try {
      const { successCount, errorCount, rateLimitCount, totalProcessed } =
        await ProductTranslationSeederService.translateAllProducts(langCode, defaultLang);
      setupFailed = setupFailed || errorCount > 0 || rateLimitCount > 0;
      console.log(`[Language] ${CLI_SYMBOLS.check} Phase 2 ${langCode}: ${successCount} successful, ${errorCount} errors, ${totalProcessed} processed`);
    } catch (error) {
      setupFailed = true;
      console.error(`[Language] ${CLI_SYMBOLS.error} Phase 2 failed for ${langCode}:`, error.message);
    }

    if (setupFailed) {
      await markSetupFailed(langCode);
      return false;
    }

    await Language.updateOne(
      { code: langCode, isReady: false },
      {
        $set: {
          isReady: true,
          isActive: true,
          setupCompletedAt: new Date(),
        },
      },
    );
    LanguageService.invalidateCache();
    console.log(`[Language] ${CLI_SYMBOLS.success} Setup complete for ${langCode}`);
    return true;
  } catch (error) {
    console.error(`[Language] ${CLI_SYMBOLS.error} Setup failed unexpectedly for ${langCode}:`, error.message);
    await markSetupFailed(langCode).catch((updateError) => {
      console.error(`[Language] Could not update ${langCode} setup status:`, updateError.message);
    });
    return false;
  } finally {
    if (lockId) await distributedLockService.releaseLock(lockKey, lockId);
    activeSetups.delete(langCode);
  }
};

const queueLanguageSetup = (langCode) => {
  setImmediate(() => {
    void runLanguageSetup(langCode);
  });
};

const resumePendingLanguageSetups = async () => {
  const pendingLanguages = await Language.find({
    isReady: false,
    setupStartedAt: { $ne: null },
    setupCompletedAt: null,
  }).select('code').lean();

  pendingLanguages.forEach(({ code }) => queueLanguageSetup(code));
  if (pendingLanguages.length > 0) {
    console.log(`[Language] Queued ${pendingLanguages.length} incomplete setup(s) for resume`);
  }
  return pendingLanguages.length;
};

module.exports = {
  queueLanguageSetup,
  resumePendingLanguageSetups,
  runLanguageSetup,
};
