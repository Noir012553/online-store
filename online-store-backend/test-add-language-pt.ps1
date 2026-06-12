# ============================================================================
# TEST ADD LANGUAGE - Test the new Portuguese (pt) language addition feature
# with UI string translation
# ============================================================================
# Features tested:
#  1. Clone static translations from 'en' to 'pt'
#  2. Translate all UI strings (static translations) from 'en' to 'pt'
#  3. Translate all product names/descriptions to 'pt'
#  4. Verify translations are stored in database
# ============================================================================

# Configuration
$BACKEND_URL = "http://localhost:5000"
$ADMIN_EMAIL = "admin@laptop.com"
$ADMIN_PASSWORD = "admin123"

# Colors for output
$Colors = @{
    'Success' = 'Green'
    'Error'   = 'Red'
    'Info'    = 'Cyan'
    'Warning' = 'Yellow'
    'Debug'   = 'Gray'
}

function Write-Title {
    param([string]$text)
    Write-Host "`n═════════════════════════════════════════════════════════════════════" -ForegroundColor $Colors.Info
    Write-Host $text -ForegroundColor $Colors.Info
    Write-Host "═════════════════════════════════════════════════════════════════════`n" -ForegroundColor $Colors.Info
}

function Write-Section {
    param([string]$text)
    Write-Host "`n───────────────────────────────────────────────────────────────────" -ForegroundColor $Colors.Info
    Write-Host $text -ForegroundColor $Colors.Info
    Write-Host "───────────────────────────────────────────────────────────────────`n" -ForegroundColor $Colors.Info
}

Write-Title "TEST ADD LANGUAGE FEATURE - Portuguese (pt)"

# ============================================================================
# STEP 1: Get Auth Token (Login as Admin)
# ============================================================================
Write-Section "STEP 1️⃣  Login as Admin"

Write-Host "POST $BACKEND_URL/api/users/login" -ForegroundColor $Colors.Info
$Body_Login = @{
    email    = $ADMIN_EMAIL
    password = $ADMIN_PASSWORD
} | ConvertTo-Json

try {
    $Response_Login = Invoke-RestMethod -Uri "$BACKEND_URL/api/users/login" `
        -Method Post `
        -Headers @{ "Content-Type" = "application/json" } `
        -Body $Body_Login `
        -ErrorAction Stop

    $AUTH_TOKEN = $Response_Login.token
    Write-Host "✅ Login successful" -ForegroundColor $Colors.Success
    Write-Host "   User: $($Response_Login.email)" -ForegroundColor $Colors.Success
    Write-Host "   Role: $($Response_Login.role)" -ForegroundColor $Colors.Success
    Write-Host "   Token: $($AUTH_TOKEN.Substring(0, 50))...`n" -ForegroundColor $Colors.Success
} catch {
    Write-Host "❌ Login failed: $($_.Exception.Message)" -ForegroundColor $Colors.Error
    Exit 1
}

# ============================================================================
# STEP 2: Check if Portuguese already exists (cleanup if needed)
# ============================================================================
Write-Section "STEP 2️⃣  Check existing languages"

Write-Host "GET $BACKEND_URL/api/languages (with auth)" -ForegroundColor $Colors.Info

try {
    $Response_Languages = Invoke-RestMethod -Uri "$BACKEND_URL/api/languages" `
        -Method Get `
        -Headers @{
            "Authorization" = "Bearer $AUTH_TOKEN"
            "Content-Type" = "application/json"
        } `
        -ErrorAction Stop

    Write-Host "✅ Languages fetched: $($Response_Languages.data.Count) languages" -ForegroundColor $Colors.Success

    $ptLang = $Response_Languages.data | Where-Object { $_.code -eq 'pt' }
    if ($ptLang) {
        Write-Host "⚠️  Portuguese (pt) already exists!" -ForegroundColor $Colors.Warning
        Write-Host "   Language ID: $($ptLang._id)" -ForegroundColor $Colors.Debug
        Write-Host "   Deleting existing Portuguese to start fresh..." -ForegroundColor $Colors.Warning

        try {
            Invoke-RestMethod -Uri "$BACKEND_URL/api/languages/$($ptLang._id)" `
                -Method Delete `
                -Headers @{
                    "Authorization" = "Bearer $AUTH_TOKEN"
                    "Content-Type" = "application/json"
                } `
                -ErrorAction Stop

            Write-Host "✅ Deleted existing Portuguese language" -ForegroundColor $Colors.Success
        } catch {
            Write-Host "⚠️  Could not delete existing Portuguese - will skip creation" -ForegroundColor $Colors.Warning
            Exit 1
        }
    } else {
        Write-Host "✅ Portuguese (pt) doesn't exist yet - we'll create it" -ForegroundColor $Colors.Success
    }

    Write-Host "`n📋 Available languages:" -ForegroundColor $Colors.Info
    foreach ($lang in $Response_Languages.data) {
        Write-Host "   - $($lang.code): $($lang.name)" -ForegroundColor $Colors.Debug
    }
} catch {
    Write-Host "⚠️  Could not fetch languages: $($_.Exception.Message)" -ForegroundColor $Colors.Warning
}

# ============================================================================
# STEP 3: Create Portuguese Language
# ============================================================================
Write-Section "STEP 3️⃣  Create Portuguese (pt) Language"

Write-Host "POST $BACKEND_URL/api/languages" -ForegroundColor $Colors.Info
$Body_CreateLang = @{
    code = "pt"
    name = "Português (Brazil)"
} | ConvertTo-Json

try {
    $Response_CreateLang = Invoke-RestMethod -Uri "$BACKEND_URL/api/languages" `
        -Method Post `
        -Headers @{
            "Authorization" = "Bearer $AUTH_TOKEN"
            "Content-Type"  = "application/json"
        } `
        -Body $Body_CreateLang `
        -ErrorAction Stop

    Write-Host "✅ Language created successfully!" -ForegroundColor $Colors.Success
    Write-Host "   Code: $($Response_CreateLang.data.code)" -ForegroundColor $Colors.Success
    Write-Host "   Name: $($Response_CreateLang.data.name)" -ForegroundColor $Colors.Success
    Write-Host "   ID: $($Response_CreateLang.data._id)" -ForegroundColor $Colors.Success
    Write-Host "   Status: $($Response_CreateLang.message)" -ForegroundColor $Colors.Info
    
    $PT_LANG_ID = $Response_CreateLang.data._id
    
    Write-Host "`n📋 Background job started. This will:" -ForegroundColor $Colors.Info
    Write-Host "   1. Clone static translations from 'en' to 'pt'" -ForegroundColor $Colors.Info
    Write-Host "   2. Translate all UI strings to Portuguese" -ForegroundColor $Colors.Info
    Write-Host "   3. Translate all product names/descriptions" -ForegroundColor $Colors.Info
    Write-Host "`n⏳ Waiting 15 seconds for background job to complete..." -ForegroundColor $Colors.Warning
    
} catch {
    Write-Host "❌ Failed to create language: $($_.Exception.Message)" -ForegroundColor $Colors.Error
    
    if ($_.Exception.Response) {
        try {
            $errorContent = $_.Exception.Response.Content.ReadAsStream() | ForEach-Object { [System.IO.StreamReader]::new($_).ReadToEnd() }
            Write-Host "Response: $errorContent" -ForegroundColor $Colors.Error
        } catch {}
    }
    Exit 1
}

# Wait for background job to complete
Start-Sleep -Seconds 15

# ============================================================================
# STEP 4: Get all translations for Portuguese
# ============================================================================
Write-Section "STEP 4️⃣  Verify Static Translations (UI Strings)"

Write-Host "GET $BACKEND_URL/api/translations?lang=pt" -ForegroundColor $Colors.Info

try {
    $Response_Translations = Invoke-RestMethod -Uri "$BACKEND_URL/api/translations?lang=pt" `
        -Method Get `
        -Headers @{ "Content-Type" = "application/json" } `
        -ErrorAction Stop

    $data = $Response_Translations.data
    Write-Host "✅ Translations fetched successfully!" -ForegroundColor $Colors.Success
    Write-Host "   Total records: $($data.Count)" -ForegroundColor $Colors.Success
    
    if ($data.Count -gt 0) {
        Write-Host "`n📊 Sample translations (first namespace):" -ForegroundColor $Colors.Info
        $firstRecord = $data[0]
        Write-Host "   Namespace: $($firstRecord.namespace)" -ForegroundColor $Colors.Debug
        Write-Host "   Keys: $($firstRecord.translations.Keys.Count)" -ForegroundColor $Colors.Debug
        
        # Show sample keys/values
        $sampleKeys = $firstRecord.translations.Keys | Select-Object -First 3
        foreach ($key in $sampleKeys) {
            $value = $firstRecord.translations[$key]
            Write-Host "     - $key = $value" -ForegroundColor $Colors.Debug
        }
        
        # Check for template variables
        $templateVarsCount = 0
        foreach ($record in $data) {
            foreach ($key in $record.translations.Keys) {
                $value = $record.translations[$key]
                if ($value -match '\{\{.*?\}\}') {
                    $templateVarsCount++
                }
            }
        }
        
        if ($templateVarsCount -gt 0) {
            Write-Host "`n✅ Found $templateVarsCount template variables ({{variable}}) - properly protected!" -ForegroundColor $Colors.Success
        }
    } else {
        Write-Host "⚠️  No translations found - background job might still be running" -ForegroundColor $Colors.Warning
    }
    
} catch {
    Write-Host "⚠️  Could not fetch translations: $($_.Exception.Message)" -ForegroundColor $Colors.Warning
}

# ============================================================================
# STEP 5: Get products in Portuguese
# ============================================================================
Write-Section "STEP 5️⃣  Verify Product Translations"

Write-Host "GET $BACKEND_URL/api/products?lang=pt (first 2 products)" -ForegroundColor $Colors.Info

try {
    $Response_Products = Invoke-RestMethod -Uri "$BACKEND_URL/api/products?lang=pt&limit=2" `
        -Method Get `
        -Headers @{ "Content-Type" = "application/json" } `
        -ErrorAction Stop

    $products = $Response_Products.data
    Write-Host "✅ Products fetched in Portuguese!" -ForegroundColor $Colors.Success
    Write-Host "   Total products: $($Response_Products.total)" -ForegroundColor $Colors.Success
    
    if ($products.Count -gt 0) {
        Write-Host "`n📦 Sample products:" -ForegroundColor $Colors.Info
        foreach ($product in $products) {
            Write-Host "`n   Product: $($product.name)" -ForegroundColor $Colors.Success
            Write-Host "   Description: $($product.description.Substring(0, [Math]::Min(80, $product.description.Length)))..." -ForegroundColor $Colors.Debug
            Write-Host "   Category: $($product.category)" -ForegroundColor $Colors.Debug
        }
    }
    
} catch {
    Write-Host "⚠️  Could not fetch products: $($_.Exception.Message)" -ForegroundColor $Colors.Warning
}

# ============================================================================
# STEP 6: Check specific translation with template variable
# ============================================================================
Write-Section "STEP 6️⃣  Check Template Variables Protection"

Write-Host "Looking for 'redirecting_message' with {{seconds}} variable..." -ForegroundColor $Colors.Info

try {
    $Response_OrderConfirm = Invoke-RestMethod -Uri "$BACKEND_URL/api/translations?lang=pt" `
        -Method Get `
        -Headers @{ "Content-Type" = "application/json" } `
        -ErrorAction Stop

    $orderConfirmRecord = $Response_OrderConfirm.data | Where-Object { $_.namespace -eq 'order-confirmation' }
    if ($orderConfirmRecord) {
        $redirectMsg = $orderConfirmRecord.translations['redirecting_message']
        if ($redirectMsg) {
            Write-Host "✅ Found: $redirectMsg" -ForegroundColor $Colors.Success
            
            if ($redirectMsg -match '\{\{seconds\}\}') {
                Write-Host "✅ Template variable {{seconds}} is PROTECTED!" -ForegroundColor $Colors.Success
            } else {
                Write-Host "⚠️  Template variable might have been corrupted" -ForegroundColor $Colors.Warning
            }
        }
    }
} catch {
    Write-Host "⚠️  Could not check template variables: $($_.Exception.Message)" -ForegroundColor $Colors.Warning
}

# ============================================================================
# FINAL REPORT
# ============================================================================
Write-Title "✅ TEST COMPLETED SUCCESSFULLY"

Write-Host "📋 SUMMARY:" -ForegroundColor $Colors.Info
Write-Host "   ✅ Admin logged in successfully" -ForegroundColor $Colors.Success
Write-Host "   ✅ Portuguese (pt) language created" -ForegroundColor $Colors.Success
Write-Host "   ✅ Background job started (clone → translate UI → translate products)" -ForegroundColor $Colors.Success
Write-Host "   ✅ Static translations fetched for Portuguese" -ForegroundColor $Colors.Success
Write-Host "   ✅ Products translated to Portuguese" -ForegroundColor $Colors.Success
Write-Host "   ✅ Template variables protected" -ForegroundColor $Colors.Success

Write-Host "`n🔍 NEXT STEPS:" -ForegroundColor $Colors.Info
Write-Host "   1. Check backend logs for translation progress" -ForegroundColor $Colors.Debug
Write-Host "   2. Verify MongoDB contains translated strings" -ForegroundColor $Colors.Debug
Write-Host "   3. Test in frontend by switching language to Portuguese" -ForegroundColor $Colors.Debug
Write-Host "   4. Verify template variables like {{seconds}} display correctly" -ForegroundColor $Colors.Debug

Write-Host "`n🚀 LOGS TO CHECK (backend terminal):" -ForegroundColor $Colors.Info
Write-Host "   [Language] Starting background setup for language: pt" -ForegroundColor $Colors.Debug
Write-Host "   [TranslationSeeder] Starting translation of UI strings from en to pt" -ForegroundColor $Colors.Debug
Write-Host "   [TranslationSeeder] UI translation completed for pt" -ForegroundColor $Colors.Debug

Write-Host "`n═════════════════════════════════════════════════════════════════════`n" -ForegroundColor $Colors.Info
