#!/usr/bin/env node

require('dotenv').config();
const { loadTranslationsCache, getTranslationStatus } = require('../i18n/messages');
const { CLI_SYMBOLS } = require('../utils/cliSymbols');

async function main() {
  try {
    console.log('[seed-i18n] Loading i18n translations from JSON files...');

    // Load all translations from JSON files
    loadTranslationsCache();
    const status = getTranslationStatus();

    console.log(`[seed-i18n] ${CLI_SYMBOLS.success} Translation Status:`);
    console.log(`   Supported languages: ${status.supportedLanguages.join(', ').toUpperCase()}`);
    console.log(`   Loaded languages: ${status.loadedLanguages.join(', ').toUpperCase()}`);
    console.log(`   Total namespaces: ${status.totalNamespaces}`);
    console.log(`[seed-i18n] ${CLI_SYMBOLS.success} All i18n translations loaded successfully`);
    process.exit(0);
  } catch (error) {
    console.error(`[seed-i18n] ${CLI_SYMBOLS.error} Error:`, error);
    process.exit(1);
  }
}

main();
