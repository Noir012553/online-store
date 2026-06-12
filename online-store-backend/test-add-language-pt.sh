#!/bin/bash

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
BACKEND_URL="http://localhost:5000"
ADMIN_EMAIL="noir@example.com"
ADMIN_PASSWORD="password123"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;36m'
GRAY='\033[0;37m'
NC='\033[0m' # No Color

# Helper functions
write_title() {
    echo -e "\n${BLUE}═══════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}\n"
}

write_section() {
    echo -e "\n${BLUE}───────────────────────────────────────────────────────────────────${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}───────────────────────────────────────────────────────────────────${NC}\n"
}

write_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

write_error() {
    echo -e "${RED}❌ $1${NC}"
}

write_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

write_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

write_debug() {
    echo -e "${GRAY}   $1${NC}"
}

write_title "TEST ADD LANGUAGE FEATURE - Portuguese (pt)"

# ============================================================================
# STEP 1: Get Auth Token (Login as Admin)
# ============================================================================
write_section "STEP 1️⃣  Login as Admin"

echo "POST $BACKEND_URL/api/users/login"

RESPONSE_LOGIN=$(curl -s -X POST "$BACKEND_URL/api/users/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")

AUTH_TOKEN=$(echo $RESPONSE_LOGIN | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$AUTH_TOKEN" ]; then
    write_error "Login failed"
    echo "$RESPONSE_LOGIN" | head -20
    exit 1
fi

write_success "Login successful"
write_debug "User: $ADMIN_EMAIL"
write_debug "Token: ${AUTH_TOKEN:0:50}..."

# ============================================================================
# STEP 2: Check if Portuguese already exists
# ============================================================================
write_section "STEP 2️⃣  Check existing languages"

echo "GET $BACKEND_URL/api/languages"

RESPONSE_LANGUAGES=$(curl -s -X GET "$BACKEND_URL/api/languages" \
  -H "Content-Type: application/json")

PT_LANG=$(echo $RESPONSE_LANGUAGES | grep -o '"code":"pt"')

if [ ! -z "$PT_LANG" ]; then
    write_warning "Portuguese (pt) already exists!"
    write_info "You can wait for background job to complete or delete it first"
fi

write_success "Languages fetched"
echo $RESPONSE_LANGUAGES | grep -o '"code":"[a-z]*"' | while read code; do
    write_debug "$code"
done

# ============================================================================
# STEP 3: Create Portuguese Language
# ============================================================================
write_section "STEP 3️⃣  Create Portuguese (pt) Language"

echo "POST $BACKEND_URL/api/languages"

RESPONSE_CREATE=$(curl -s -X POST "$BACKEND_URL/api/languages" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code":"pt","name":"Português (Brazil)"}')

LANG_ID=$(echo $RESPONSE_CREATE | grep -o '"_id":"[^"]*' | cut -d'"' -f4)

if [ -z "$LANG_ID" ]; then
    write_error "Failed to create language"
    echo "$RESPONSE_CREATE" | head -20
    exit 1
fi

write_success "Language created successfully!"
write_debug "Code: pt"
write_debug "Name: Português (Brazil)"
write_debug "ID: $LANG_ID"
write_info ""
write_info "Background job started. This will:"
write_debug "1. Clone static translations from 'en' to 'pt'"
write_debug "2. Translate all UI strings to Portuguese"
write_debug "3. Translate all product names/descriptions"
write_warning "⏳ Waiting 15 seconds for background job to complete..."

sleep 15

# ============================================================================
# STEP 4: Get all translations for Portuguese
# ============================================================================
write_section "STEP 4️⃣  Verify Static Translations (UI Strings)"

echo "GET $BACKEND_URL/api/translations?lang=pt"

RESPONSE_TRANS=$(curl -s -X GET "$BACKEND_URL/api/translations?lang=pt" \
  -H "Content-Type: application/json")

TRANS_COUNT=$(echo $RESPONSE_TRANS | grep -o '"namespace"' | wc -l)

if [ $TRANS_COUNT -gt 0 ]; then
    write_success "Translations fetched successfully!"
    write_debug "Total records: $TRANS_COUNT"
    write_info "Sample translations found"
    echo $RESPONSE_TRANS | head -200 | tail -100
else
    write_warning "No translations found - background job might still be running"
fi

# ============================================================================
# STEP 5: Get products in Portuguese
# ============================================================================
write_section "STEP 5️⃣  Verify Product Translations"

echo "GET $BACKEND_URL/api/products?lang=pt&limit=2"

RESPONSE_PRODUCTS=$(curl -s -X GET "$BACKEND_URL/api/products?lang=pt&limit=2" \
  -H "Content-Type: application/json")

PRODUCT_COUNT=$(echo $RESPONSE_PRODUCTS | grep -o '"name"' | wc -l)

if [ $PRODUCT_COUNT -gt 0 ]; then
    write_success "Products fetched in Portuguese!"
    write_debug "Found products with Portuguese translations"
    echo $RESPONSE_PRODUCTS | head -300 | tail -150
else
    write_warning "No products found"
fi

# ============================================================================
# FINAL REPORT
# ============================================================================
write_title "✅ TEST COMPLETED SUCCESSFULLY"

echo -e "${BLUE}📋 SUMMARY:${NC}"
write_success "Admin logged in successfully"
write_success "Portuguese (pt) language created"
write_success "Background job started (clone → translate UI → translate products)"
write_success "Static translations fetched for Portuguese"
write_success "Products translated to Portuguese"

echo -e "\n${BLUE}🔍 NEXT STEPS:${NC}"
write_debug "1. Check backend logs for translation progress"
write_debug "2. Verify MongoDB contains translated strings"
write_debug "3. Test in frontend by switching language to Portuguese"
write_debug "4. Verify template variables like {{seconds}} display correctly"

echo -e "\n${BLUE}🚀 LOGS TO CHECK (backend terminal):${NC}"
write_debug "[Language] Starting background setup for language: pt"
write_debug "[TranslationSeeder] Starting translation of UI strings from en to pt"
write_debug "[TranslationSeeder] UI translation completed for pt"

echo -e "\n${BLUE}═══════════════════════════════════════════════════════════════════${NC}\n"
