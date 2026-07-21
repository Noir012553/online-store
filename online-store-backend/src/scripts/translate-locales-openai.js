#!/usr/bin/env node

/**
 * Dịch tự động tất cả file JSON từ default language sang các ngôn ngữ khác
 * Sử dụng OpenAI API (bạn có thể dùng ChatGPT, GPT-4, etc.)
 *
 * Cách dùng:
 * 1. Thiết lập OPENAI_API_KEY trong .env
 * 2. Chạy: node translate-locales-openai.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { getDefaultLanguage, getActiveLangCodes, getLanguageNames } = require('../config/languageInventory');
const { CLI_SYMBOLS } = require('../utils/cliSymbols');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const LOCALES_DIR = path.join(__dirname, '../locales');
const defaultLang = getDefaultLanguage().code;
const DEFAULT_DIR = path.join(LOCALES_DIR, defaultLang);

// Get language names dynamically from config (not hardcoded)
const LANG_NAMES = getLanguageNames();

const allActiveLangs = getActiveLangCodes();
const TARGET_LANGS_CODES = allActiveLangs.filter(l => l !== defaultLang);
const TARGET_LANGS = TARGET_LANGS_CODES.reduce((acc, code) => {
  acc[code] = LANG_NAMES[code] || code;
  return acc;
}, {});

// Dịch với OpenAI API
async function translateWithOpenAI(srcObj, targetLang, langName, filename) {
  const prompt = `Translate the following JSON object from ${LANG_NAMES[defaultLang]} to ${langName}. 
Keep the JSON structure exactly the same, only translate the values.
Keep brand names like "LaptopStore", "LT", emails, numbers, URLs unchanged.
Keep flag emojis (like 🇻🇳, 🇺🇸) exactly as they are.
Return ONLY valid JSON, no markdown code blocks or extra text.

JSON to translate:
${JSON.stringify(srcObj, null, 2)}`;

  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content:
            'You are an expert translator. Translate JSON objects accurately, preserving structure and keeping technical terms intact.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 4000,
    });

    const options = {
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
    };

    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);

          if (parsed.error) {
            reject(new Error(`OpenAI Error: ${parsed.error.message}`));
            return;
          }

          const content = parsed.choices[0].message.content.trim();
          let jsonText = content;

          // Remove markdown code blocks if present
          if (jsonText.startsWith('```json')) {
            jsonText = jsonText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
          } else if (jsonText.startsWith('```')) {
            jsonText = jsonText.replace(/^```\n?/, '').replace(/\n?```$/, '');
          }

          const translatedObj = JSON.parse(jsonText);
          console.log(`${CLI_SYMBOLS.success} Translated ${filename} to ${langName}`);
          resolve(translatedObj);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);

    req.write(data);
    req.end();
  });
}

// Main translation process
async function main() {
  if (!OPENAI_API_KEY) {
    console.error(`${CLI_SYMBOLS.error} Error: OPENAI_API_KEY is not set`);
    console.error('Please set the OPENAI_API_KEY environment variable');
    process.exit(1);
  }

  console.log(`${CLI_SYMBOLS.rocket} Starting translation of JSON locale files using OpenAI...\n`);

  // Get all JSON files from en directory
  const enFiles = fs
    .readdirSync(EN_DIR)
    .filter((file) => file.endsWith('.json'))
    .sort();

  console.log(`${CLI_SYMBOLS.folder} Found ${enFiles.length} files to translate\n`);

  let successCount = 0;
  let errorCount = 0;

  for (const filename of enFiles) {
    const enFilePath = path.join(EN_DIR, filename);
    const enContent = JSON.parse(fs.readFileSync(enFilePath, 'utf8'));

    console.log(`\n${CLI_SYMBOLS.report} Processing: ${filename}`);

    for (const [langCode, langName] of Object.entries(TARGET_LANGS)) {
      const targetDir = path.join(LOCALES_DIR, langCode);

      // Create directory if not exist
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const targetFilePath = path.join(targetDir, filename);

      // Skip if file already exists and is translated
      if (fs.existsSync(targetFilePath)) {
        const existingContent = JSON.parse(fs.readFileSync(targetFilePath, 'utf8'));
        const isFullyTranslated = JSON.stringify(existingContent) !== JSON.stringify(enContent);

        if (isFullyTranslated) {
          console.log(`   ${CLI_SYMBOLS.skip}  ${langCode}: Already translated, skipping`);
          continue;
        }
      }

      try {
        const translatedContent = await translateWithOpenAI(
          enContent,
          langCode,
          langName,
          filename
        );

        // Write translated file
        fs.writeFileSync(targetFilePath, JSON.stringify(translatedContent, null, 2) + '\n', 'utf8');
        console.log(`   ${CLI_SYMBOLS.success} ${langCode}: Translated and saved`);
        successCount++;

        // Add delay to avoid rate limiting (2 seconds)
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        console.log(`   ${CLI_SYMBOLS.error} ${langCode}: Translation failed - ${error.message}`);
        errorCount++;

        // Wait longer on error (rate limit or quota)
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`${CLI_SYMBOLS.success} Translation Complete!`);
  console.log(`   Success: ${successCount}`);
  console.log(`   Errors: ${errorCount}`);
  console.log(`${'='.repeat(60)}\n`);
}

// Run
main().catch(console.error);
