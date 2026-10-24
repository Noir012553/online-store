/**
 * Translation Seeder - Đẩy dữ liệu i18n từ JSON files vào Database
 *
 * Mục đích: Backup/persistence - tránh mất dữ liệu i18n nếu:
 *   - File JSON bị xóa nhầm
 *   - Deploy mà quên file
 *   - Version control issue
 *   - File system lỗi
 *
 * Bằng cách seed vào MongoDB, dữ liệu được lưu trữ centralized & persistent,
 * không phụ thuộc vào file system.
 *
 * Dữ liệu lấy từ: online-store-backend/src/locales/[lang]/[namespace].json
 * Lưu vào: StaticTranslation collection
 *
 * Namespaces: ~60 files per language (common, admin, checkout, products, etc.)
 * Languages: vi, en, pt, fr, de, it, es, nl, sv (9 languages)
 */

const StaticTranslation = require('../models/StaticTranslation');
const { getDefaultLanguage, getActiveLangCodes } = require('../config/languageInventory');
const fs = require('fs');
const path = require('path');

const LOCALES_PATH = path.join(__dirname, '../locales');

/**
 * Dynamically scan and get available namespaces from locales directory
 * by reading files from the default language folder
 */
function getAvailableNamespaces() {
  const defaultLang = getDefaultLanguage().code;
  const defaultLocalePath = path.join(LOCALES_PATH, defaultLang);

  if (!fs.existsSync(defaultLocalePath)) {
    return [];
  }

  try {
    const files = fs.readdirSync(defaultLocalePath);
    const namespaces = files
      .filter(file => file.endsWith('.json'))
      .map(file => file.replace('.json', ''));

    return namespaces;
  } catch (error) {
    return [];
  }
}

/**
 * Seed static translations từ JSON files vào DB
 *
 * Sử dụng upsert để ensure data persistence:
 * - Nếu translation (lang, namespace) đã tồn tại → update dữ liệu
 * - Nếu chưa tồn tại → tạo mới
 *
 * Kết quả: Dữ liệu i18n được lưu trữ trong database, an toàn khỏi mất file
 */
const seedTranslations = async () => {
  try {
    const SUPPORTED_LANGUAGES = getActiveLangCodes();
    const SUPPORTED_NAMESPACES = getAvailableNamespaces();

    let totalSeeded = 0;
    let totalFailed = 0;
    const results = [];

    for (const lang of SUPPORTED_LANGUAGES) {
      const operations = [];
      const entries = [];

      for (const namespace of SUPPORTED_NAMESPACES) {
        try {
          const filePath = path.join(LOCALES_PATH, lang, `${namespace}.json`);

          if (!fs.existsSync(filePath)) {
            continue;
          }

          const fileContent = fs.readFileSync(filePath, 'utf-8');
          const translations = JSON.parse(fileContent);

          operations.push({
            updateOne: {
              filter: { code: lang, namespace },
              update: {
                $set: {
                  code: lang,
                  namespace,
                  translations,
                },
              },
              upsert: true,
            },
          });
          entries.push({ language: lang, namespace, keysCount: Object.keys(translations).length });
        } catch (error) {
          results.push({
            language: lang,
            namespace,
            status: 'failed',
            error: error.message,
          });
          totalFailed++;
        }
      }

      if (operations.length === 0) {
        continue;
      }

      await StaticTranslation.bulkWrite(operations, { ordered: false });
      entries.forEach(entry => results.push({ ...entry, status: 'success' }));
      totalSeeded += entries.length;
      console.log(`[TranslationSeeder] ${lang}: ${entries.length} namespace(s) seeded`);
    }

    return results;
  } catch (error) {
    console.error('❌ Translation seeding failed:', error);
    throw error;
  }
};

module.exports = seedTranslations;
