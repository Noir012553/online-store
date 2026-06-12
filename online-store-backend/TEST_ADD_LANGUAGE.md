# 🧪 TEST GUIDE - Add Language Feature with UI Translation

## 📋 Overview

This guide covers testing the **Add Language** feature which now includes:
1. Clone static translations from English ('en') to target language
2. **NEW**: Translate all UI strings (static translations) automatically
3. Translate all product names/descriptions
4. Protect template variables like `{{seconds}}` during translation

---

## 🚀 Quick Start

### Windows (PowerShell)

```powershell
# 1. Navigate to backend directory
cd online-store-backend

# 2. Update credentials in script (if needed)
# Open test-add-language-pt.ps1 and update:
#   $ADMIN_EMAIL = "noir@example.com"
#   $ADMIN_PASSWORD = "password123"

# 3. Run the test script
.\test-add-language-pt.ps1
```

### Linux / macOS (Bash)

```bash
# 1. Navigate to backend directory
cd online-store-backend

# 2. Make script executable
chmod +x test-add-language-pt.sh

# 3. Update credentials in script (if needed)
# Edit test-add-language-pt.sh and update:
#   ADMIN_EMAIL="noir@example.com"
#   ADMIN_PASSWORD="password123"

# 4. Run the test script
./test-add-language-pt.sh
```

---

## 📝 Manual Test Steps (Using curl/Postman)

### Prerequisites
- Backend running on `http://localhost:5000`
- Admin account with valid credentials
- MongoDB with English (en) translations seeded

### Step 1: Get Admin Auth Token

**PowerShell:**
```powershell
$Response = Invoke-RestMethod -Uri "http://localhost:5000/api/users/login" `
    -Method Post `
    -Headers @{"Content-Type" = "application/json"} `
    -Body '{"email":"noir@example.com","password":"password123"}'

$TOKEN = $Response.token
Write-Host $TOKEN
```

**Bash:**
```bash
RESPONSE=$(curl -s -X POST "http://localhost:5000/api/users/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"noir@example.com","password":"password123"}')

TOKEN=$(echo $RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)
echo $TOKEN
```

### Step 2: Create Portuguese Language

**PowerShell:**
```powershell
$TOKEN = "YOUR_TOKEN_HERE"

$Response = Invoke-RestMethod -Uri "http://localhost:5000/api/languages" `
    -Method Post `
    -Headers @{
        "Authorization" = "Bearer $TOKEN"
        "Content-Type" = "application/json"
    } `
    -Body '{"code":"pt","name":"Português (Brazil)"}'

Write-Host $Response.message
```

**Bash:**
```bash
TOKEN="YOUR_TOKEN_HERE"

curl -s -X POST "http://localhost:5000/api/languages" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code":"pt","name":"Português (Brazil)"}'
```

### Step 3: Wait for Background Job (15 seconds)

The background job will:
1. Clone English translations to Portuguese
2. **Translate UI strings from English to Portuguese**
3. Translate product data to Portuguese

Watch the backend logs for:
```
[Language] Starting background setup for language: pt
[TranslationSeeder] Starting translation of UI strings from en to pt
[TranslationSeeder] Translating namespace 'common' ...
[TranslationSeeder] Protected X variables in key '...'
[TranslationSeeder] UI translation completed for pt
```

### Step 4: Verify Static Translations

**PowerShell:**
```powershell
$Response = Invoke-RestMethod -Uri "http://localhost:5000/api/translations?lang=pt" `
    -Method Get `
    -Headers @{"Content-Type" = "application/json"}

# Show first namespace
$Response.data[0] | ConvertTo-Json -Depth 10
```

**Bash:**
```bash
curl -s -X GET "http://localhost:5000/api/translations?lang=pt" \
  -H "Content-Type: application/json" | jq '.data[0]'
```

### Step 5: Verify Products are Translated

**PowerShell:**
```powershell
$Response = Invoke-RestMethod -Uri "http://localhost:5000/api/products?lang=pt&limit=2" `
    -Method Get `
    -Headers @{"Content-Type" = "application/json"}

$Response.data | ForEach-Object {
    Write-Host "Product: $($_.name)"
    Write-Host "Description: $($_.description.SubString(0, 50))..."
    Write-Host ""
}
```

**Bash:**
```bash
curl -s -X GET "http://localhost:5000/api/products?lang=pt&limit=2" \
  -H "Content-Type: application/json" | jq '.data[] | {name, description: .description[0:50]}'
```

### Step 6: Check Template Variables Protection

Look for the `redirecting_message` in `order-confirmation` namespace:

**MongoDB:**
```javascript
db.statictranslations.findOne({
  code: "pt",
  namespace: "order-confirmation"
}).translations.redirecting_message

// Should be something like:
// "Redirecionando para página inicial em {{seconds}} segundos..."
// NOT: "Redirecionando para página inicial em __VAR_0__ segundos..."
```

---

## ✅ Success Criteria

| Criterion | Expected | Check |
|-----------|----------|-------|
| Language Created | Portuguese added to system | ✅ GET /api/languages shows `pt` |
| UI Translations Cloned | 50+ namespaces in DB | ✅ StaticTranslation with code='pt' exists |
| UI Translations Translated | All strings in Portuguese | ✅ GET /api/translations?lang=pt returns Portuguese text |
| Template Variables Protected | `{{variable}}` preserved | ✅ Check `redirecting_message` value |
| Products Translated | All products in Portuguese | ✅ GET /api/products?lang=pt shows Portuguese names |
| Logging Detailed | Clear error messages | ✅ Backend logs show which keys/namespaces were translated |

---

## 🐛 Troubleshooting

### Problem: Login fails
**Solution:**
- Check if backend is running on `http://localhost:5000`
- Verify admin email and password are correct
- Ensure account has 'admin' role

### Problem: No translations appear after 15 seconds
**Solution:**
- Check backend logs for errors
- Verify Cloudflare AI service is configured (environment variables)
- Look for `[TranslationSeeder]` log entries
- May need more time - wait 30 seconds and try again

### Problem: Template variables are corrupted (e.g., `__VAR_0__` appears in output)
**Solution:**
- This is a bug - variables should be protected and restored
- Check `_protectTemplateVariables()` and `_restoreTemplateVariables()` functions
- Verify Cloudflare doesn't translate the placeholder itself

### Problem: Products not translated
**Solution:**
- Ensure Cloudflare AI service is working
- Check if `cloudflareAiService.translate()` is being called
- Verify product names/descriptions exist in English

### Problem: Database connection errors
**Solution:**
- Verify MongoDB is running and accessible
- Check connection string in environment variables
- Ensure database has English translations seeded first

---

## 📊 Expected Log Output

### Complete Success Flow

```
[Language] Starting background setup for language: pt
[TranslationSeeder] Starting clone from en to pt
[TranslationSeeder] Found 50 source records in DB
[TranslationSeeder] Successfully cloned 50 translation records for pt
[Language] Cloned 50 static translations for pt

[TranslationSeeder] Starting translation of UI strings from en to pt
[TranslationSeeder] Translating namespace 'common' (15 keys) to pt
[TranslationSeeder] Protected 0 variables in namespace 'common'
[TranslationSeeder] Namespace 'common' translation completed (15 keys)
[TranslationSeeder] Translating namespace 'order-confirmation' (30 keys) to pt
[TranslationSeeder] Protected 1 variables in key 'redirecting_message' (namespace 'order-confirmation')
[TranslationSeeder] Namespace 'order-confirmation' translation completed (30 keys)
...
[TranslationSeeder] UI translation completed for pt. Total translated: 450, Errors: 0
[Language] Translated 450 UI strings to pt

[Language] Language cache invalidated

[Language] Starting auto-translation of products...
[Language] Found 25 products to translate
[Language] Completed setup for pt. Products translated: 50, Errors: 0
```

---

## 🔍 Testing Tips

### 1. Check MongoDB directly

```javascript
// Connect to MongoDB
mongosh

// Switch to your database
use online_store

// Check if Portuguese translations exist
db.statictranslations.countDocuments({ code: "pt" })
// Should return 50+

// See sample translation
db.statictranslations.findOne({ code: "pt", namespace: "common" })

// Check template variable is protected
db.statictranslations.findOne({ code: "pt", namespace: "order-confirmation" }).translations.redirecting_message
```

### 2. Monitor Backend Logs

```bash
# If running in terminal, logs will show in real-time
# Look for [TranslationSeeder] and [Language] prefixes
```

### 3. Frontend Test

1. Open frontend in browser
2. Switch language to "Português"
3. Verify entire UI is in Portuguese
4. Check that forms with placeholders still work (like pagination, cart counts)

### 4. Automated Repeat Test

Run the script again for another language (e.g., French):
```powershell
# Modify script to use 'fr' instead of 'pt'
.\test-add-language-pt.ps1  # Edit to use 'fr'
```

---

## 📚 Related Files

- `src/services/translationSeederService.js` - Core logic for cloning and translating
- `src/controllers/languageController.js` - Endpoint and background job trigger
- `src/services/cloudflareAiService.js` - AI translation service
- `src/models/StaticTranslation.js` - Database schema

---

## 🎯 Key Features Tested

### ✅ Feature 1: Clone Static Translations
- Clones all English (en) translations to new language
- Creates backup copy to prevent 404 errors

### ✅ Feature 2: Translate UI Strings (NEW)
- Translates all cloned strings from English to target language
- Uses Cloudflare AI for automatic translation
- Protects template variables like `{{variable}}` during translation

### ✅ Feature 3: Translate Products
- Automatically translates all product names and descriptions
- Uses same Cloudflare AI service
- Caches translations to avoid duplicate work

### ✅ Feature 4: Detailed Logging
- Logs show exactly which keys are translated
- Error messages include namespace and key names
- Progress visible in real-time

---

## 🚀 Next Steps

After successful test:

1. ✅ Merge to main branch
2. ✅ Deploy to production
3. ✅ Test with admin adding new languages
4. ✅ Monitor logs for any translation errors
5. ✅ Gather user feedback on translation quality

---

## 📞 Support

If you encounter issues, check:
1. Backend logs for `[TranslationSeeder]` entries
2. MongoDB for translation data
3. Environment variables for Cloudflare AI config
4. Database connection and authentication
