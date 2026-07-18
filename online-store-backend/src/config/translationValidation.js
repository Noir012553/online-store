module.exports = {
  // ========== BRAND PRESERVATION ==========
  PRESERVED_BRANDS: [
    'Rapoo', 'Logitech', 'Corsair', 'Razer', 'SteelSeries',
    'ASUS', 'MSI', 'Lenovo', 'Dell', 'Apple', 'Samsung',
    'Intel', 'AMD', 'NVIDIA', 'Kingston', 'Crucial',
    'HyperX', 'Plantronics', 'JBL', 'Akko', 'Varmilo',
    'Keychron', 'Leopold', 'Ducky', 'Filco', 'iKBC',
    'Realforce', 'CHERRY', 'Topre', 'Matias', 'Das Keyboard',
    'Cooler Master', 'ROG', 'Alienware', 'Omen', 'ThinkPad',
    'MacBook', 'iPad', 'iPhone', 'AirPods', 'Sony', 'Anker',
    'Belkin', 'OtterBox', 'Spigen', 'tech21', 'OtterBox'
  ],
  ENABLE_BRAND_CHECK: true,

  // ========== LENGTH VALIDATION ==========
  MIN_LENGTH_RATIO: 0.2,
  MAX_LENGTH_RATIO: 3.0,
  ENABLE_LENGTH_CHECK: true,

  // ========== EMPTY CHECK ==========
  ENABLE_EMPTY_CHECK: true,

  // ========== LANGUAGE DETECTION ==========
  ENABLE_LANGUAGE_CHECK: true,
  // DEFAULT_LANGUAGES: Imported dynamically from languageInventory (see utils/translationValidator.js)

  // ========== INCONSISTENCY CHECK ==========
  ENABLE_INCONSISTENCY_CHECK: true,

  // ========== QUALITY SCORING ==========
  QUALITY_SCORE_FORMULA: {
    missing_brand: -20,
    too_short: -15,
    too_long: -15,
    empty: -100,
    wrong_language: -50,
    inconsistent: -20,
  },

  // ========== THRESHOLDS ==========
  QUALITY_THRESHOLD_FOR_APPROVAL: 70,
  QUALITY_THRESHOLD_FOR_REVIEW: 50,
  QUALITY_THRESHOLD_FOR_RETRANSLATE: 50,

  // ========== AUTO-APPROVAL RULES ==========
  AUTO_APPROVE_IF_NO_ERRORS: true,
  AUTO_RETRANSLATE_IF_CRITICAL: true,
  CRITICAL_ERRORS: ['empty', 'wrong_language'],

  // ========== LOGGING ==========
  VERBOSE: process.env.NODE_ENV === 'development',
  SAVE_REPORTS: true,
  REPORT_DIR: process.env.TRANSLATION_REPORT_DIR || './translation-reports',
  MAX_REPORT_SIZE: 10000,
};
