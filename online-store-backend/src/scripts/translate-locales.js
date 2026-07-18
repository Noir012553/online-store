#!/usr/bin/env node

/**
 * Dịch tự động tất cả file JSON từ default language sang các ngôn ngữ khác
 * Sử dụng claude-3-5-sonnet để dịch nhanh chóng
 */

const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { getDefaultLanguage, getActiveLangCodes, getLanguageNames } = require('../config/languageInventory');

const client = new Anthropic();

const LOCALES_DIR = path.join(__dirname, '../locales');
const defaultLang = getDefaultLanguage().code;
const DEFAULT_DIR = path.join(LOCALES_DIR, defaultLang);

// Get target languages (exclude default language)
const allLangs = getActiveLangCodes();
const TARGET_LANGS_CODES = allLangs.filter(l => l !== defaultLang);

// Get language names dynamically from config (not hardcoded)
const LANG_NAMES = getLanguageNames();

const TARGET_LANGS = TARGET_LANGS_CODES.reduce((acc, code) => {
  acc[code] = LANG_NAMES[code] || code;
  return acc;
}, {});

/**
 * Dịch object JSON từ default language sang target language
 */
async function translateObject(srcObj, targetLang, langName, filename) {
  const prompt = `Translate the following JSON object from ${LANG_NAMES[defaultLang]} to ${langName}. 
Keep the JSON structure exactly the same, only translate the values.
Keep brand names like "LaptopStore", "LT", emails, numbers unchanged.
Return only valid JSON, no markdown code blocks or extra text.

JSON to translate:
${JSON.stringify(srcObj, null, 2)}`;

  try {
    const response = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    // Parse JSON response
    let jsonText = content.text.trim();
    // Remove markdown code blocks if present
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/^```json\n/, '').replace(/\n```$/, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```\n/, '').replace(/\n```$/, '');
    }

    const translatedObj = JSON.parse(jsonText);
    console.log(`✅ Translated ${filename} to ${langName}`);
    return translatedObj;
  } catch (error) {
    console.error(`❌ Error translating ${filename} to ${langName}:`, error.message);
    throw error;
  }
}

/**
 * Main translation process
 */
async function main() {
  console.log('🚀 Starting translation of JSON locale files...\n');
  console.log(`📍 Default Language: ${defaultLang}`);
  console.log(`📍 Target Languages: ${TARGET_LANGS_CODES.join(', ')}\n`);

  // Get all JSON files from default language directory
  const defaultFiles = fs
    .readdirSync(DEFAULT_DIR)
    .filter((file) => file.endsWith('.json'))
    .sort();

  console.log(`📁 Found ${defaultFiles.length} files to translate\n`);

  let successCount = 0;
  let errorCount = 0;

  for (const filename of defaultFiles) {
    const defaultFilePath = path.join(DEFAULT_DIR, filename);
    const defaultContent = JSON.parse(fs.readFileSync(defaultFilePath, 'utf8'));

    console.log(`\n📄 Processing: ${filename}`);

    for (const [langCode, langName] of Object.entries(TARGET_LANGS)) {
      const targetDir = path.join(LOCALES_DIR, langCode);

      // Create directory if not exist
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const targetFilePath = path.join(targetDir, filename);

      // Skip if file already exists
      if (fs.existsSync(targetFilePath)) {
        // Check if file is fully translated (not all from default language)
        const existingContent = JSON.parse(fs.readFileSync(targetFilePath, 'utf8'));
        const isFullyTranslated = JSON.stringify(existingContent) !== JSON.stringify(defaultContent);

        if (isFullyTranslated) {
          console.log(`   ⏭️  ${langCode}: Already translated, skipping`);
          continue;
        }
      }

      try {
        const translatedContent = await translateObject(defaultContent, langCode, langName, filename);

        // Write translated file
        fs.writeFileSync(targetFilePath, JSON.stringify(translatedContent, null, 2) + '\n', 'utf8');
        console.log(`   ✅ ${langCode}: Translated and saved`);
        successCount++;

        // Add delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.log(`   ❌ ${langCode}: Translation failed`);
        errorCount++;
      }
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ Translation Complete!`);
  console.log(`   Success: ${successCount}`);
  console.log(`   Errors: ${errorCount}`);
  console.log(`${'='.repeat(60)}\n`);
}

// Run
main().catch(console.error);
