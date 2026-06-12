# Language Synchronization Fixes - Summary

## Problem Statement
Frontend và Backend không đồng bộ khi admin thêm ngôn ngữ mới (ví dụ `pt`):
- ❌ `/api/translations?lang=pt&ns=common` → 404 (UI strings không có)
- ❌ `/api/products/:id/translations?lang=pt` → 400 (allowlist hardcode chỉ vi/en)

## Root Causes Identified

### Gap 1: Hardcoded Allowlist in translationController.js
- Endpoint `getProductTranslations()` hardcode check `{vi, en}`
- Khi user request `pt`, bị reject với 400 Bad Request

### Gap 2: Missing Static Translations for New Languages
- Seeder chỉ seed `vi` và `en` từ JSON files
- Khi admin thêm `pt`, không có dữ liệu trong `StaticTranslation` collection
- Frontend gọi `/api/translations?lang=pt` → 404

### Gap 3: Wrong Cache Format
- Background job ghi cache generic format (chỉ `hashKey`)
- Endpoint cần format: `{entityId, entityType, targetLang}`
- Dữ liệu được tạo nhưng không được tìm thấy

### Gap 4: Race Condition
- Khi clone từ DB, `en` có thể chưa được seed
- Cần fallback: load từ JSON files nếu DB không có

## Fixes Applied

### 1. ✅ Dynamic Allowlist Check (translationController.js)
**File:** `online-store-backend/src/controllers/translationController.js`

```javascript
// BEFORE: Hardcoded
if (!SUPPORTED_LANGUAGES[lang]) return res.status(400);

// AFTER: Dynamic check via LanguageService
const isLangSupported = await LanguageService.isSupportedLanguage(lang);
if (!isLangSupported) return res.status(400);
```

**Impact:** `/api/products/:id/translations?lang=pt` tự động work khi `pt` được add

---

### 2. ✅ Auto-Clone Static Translations (languageController.js)
**File:** `online-store-backend/src/controllers/languageController.js`

```javascript
// Step 1: Clone static translations from 'en' to new language
const clonedCount = await TranslationSeederService.cloneStaticTranslations('en', langCode);
console.log(`Cloned ${clonedCount} static translations for ${langCode}`);

// Step 2: Invalidate cache
LanguageService.invalidateCache();

// Step 3: Translate products with entityId + entityType format
```

**Impact:** 
- UI strings (header, footer, etc.) automatically available cho ngôn ngữ mới
- `/api/translations?lang=pt&ns=common` → 200 OK

---

### 3. ✅ Fallback to JSON Files (translationSeederService.js)
**File:** `online-store-backend/src/services/translationSeederService.js`

```javascript
// If DB doesn't have source translations, load from JSON files
let sourceTranslations = await StaticTranslation.find({ code: sourceCode }).lean();
if (sourceTranslations.length === 0) {
  sourceTranslations = await this._loadTranslationsFromJSON(sourceCode);
}
```

**Impact:**
- Nếu `en` chưa được seed vào DB, sẽ load từ `/src/locales/en/*.json`
- Đảm bảo clone luôn thành công

---

### 4. ✅ Correct Cache Format (languageController.js)
**File:** `online-store-backend/src/controllers/languageController.js`

```javascript
// BEFORE: Generic format
{
  hashKey: "...",
  originalText: "...",
  targetLang: "pt",
  translatedText: "..."
}

// AFTER: Full format with entityId + entityType
{
  hashKey: "...",
  originalText: "...",
  targetLang: "pt",
  translatedText: "...",
  entityId: "product_123",      // NEW
  entityType: "product_name"    // NEW
}
```

**Impact:**
- `/api/products/:id/translations?lang=pt` tìm được cache
- Dữ liệu được tạo và sử dụng đúng cách

---

### 5. ✅ Dynamic Language Service (languageService.js)
**File:** `online-store-backend/src/services/languageService.js`

```javascript
// Query DB cho active languages, cache 5 minutes
static async getActiveLanguageCodes() {
  if (cachedLanguages && Date.now() < cacheExpiry) {
    return cachedLanguages;
  }
  const languages = await Language.find({ isActive: true });
  // Cache result...
}

// Invalidate cache when language added/removed
static invalidateCache() {
  cachedLanguages = null;
  cacheExpiry = null;
}
```

**Impact:**
- Endpoints không hardcode, đọc từ DB
- Cache tối ưu (5 min TTL)

---

## Files Modified

| File | Changes | Lines |
|------|---------|-------|
| `src/controllers/languageController.js` | Add clone, correct format, langCode variable | 119-250 |
| `src/controllers/translationController.js` | Dynamic allowlist check (6 endpoints) | Multiple |
| `src/services/translationSeederService.js` | Add `_loadTranslationsFromJSON()` fallback | 90-137 |
| `src/services/languageService.js` | Already correct (dynamic + cache) | ✓ |

---

## Test Scripts Created

### 1. `test-language-sync.js`
Test workflow:
```bash
npm run seed                    # Initial seed
node test-language-sync.js     # Run tests
```

Tests:
- ✓ GET /api/languages/supported
- ✓ POST /api/languages {code: 'pt'}
- ✓ GET /api/translations?lang=pt&ns=common (wait 10s for background job)
- ✓ GET /api/translations?lang=pt&ns=footer
- ✓ GET /api/products/:id/translations?lang=pt

### 2. `check-db-state.js`
Debug database state:
```bash
node check-db-state.js
```

Checks:
- Languages in DB
- StaticTranslation records by language
- LiveTranslationCache records by language

---

## Flow After Fixes

```
Admin click "Add Language: Português (pt)"
  ↓
Frontend: POST /api/languages {code: 'pt', name: 'Português'}
  ↓
Backend:
  1. Validate code against SUPPORTED_LANGUAGES ✓
  2. Create Language record ✓
  3. Response 201 immediately ✓
  
Background Job (setImmediate):
  1. Clone StaticTranslation from 'en' → 'pt' ✓
     (Fallback: Load from /locales/en/*.json if DB missing) ✓
  2. Invalidate language cache ✓
  3. Translate all products with entityId + entityType ✓
  4. Write to LiveTranslationCache ✓

User select "Português"
  ↓
GET /api/translations?lang=pt&ns=common
  → StaticTranslation.findOne({code:'pt', namespace:'common'})
  → ✅ 200 OK (cloned from 'en')

GET /api/products/123/translations?lang=pt
  → Check via LanguageService.isSupportedLanguage('pt')
  → ✅ Pass validation (dynamic)
  → LiveTranslationCache.find({entityId:'123', targetLang:'pt'})
  → ✅ 200 OK (correct format)
```

---

## Verification Checklist

- [x] Remove hardcoded allowlist → Dynamic via LanguageService
- [x] Add auto-clone StaticTranslation when language created
- [x] Add fallback to JSON files if DB missing
- [x] Fix cache format: add entityId + entityType
- [x] Invalidate cache on language changes
- [x] Test scripts created
- [x] Error handling + logging added
- [x] No breaking changes to frontend

---

## Known Limitations

1. **Background Job Async**: StaticTranslation clone & product translation happen in background
   - Solution: Wait 10s before testing, or check logs
   
2. **Fallback to JSON Files**: If locales JSON structure changes, may need update
   - Mitigation: Error handling + console logs
   
3. **Cache TTL 5 Minutes**: If language added/removed frequently, cache may lag
   - Solution: LanguageService.invalidateCache() called explicitly

---

## Next Steps

1. **Deploy to production**
   - Run `npm run seed` to ensure statictranslation seeded for vi, en
   - Test: `node check-db-state.js` to verify
   - Test: `node test-language-sync.js` to verify endpoints

2. **Monitor**
   - Check logs for `[Language] Cloned X static translations`
   - Check DB: `StaticTranslation.countDocuments({code: 'pt'})`
   - Monitor API response times for `/api/translations` and `/api/products/:id/translations`

3. **Future Enhancements**
   - Add UI progress bar for language creation (polling background job)
   - Add webhook to notify when language setup complete
   - Support machine translation quality verification
