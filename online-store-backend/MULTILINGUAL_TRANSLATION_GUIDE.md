# 🌍 Multilingual Translation System - Complete Guide

## Overview

Hệ thống dịch phân cấp chi tiết cho nền tảng thương mại điện tử:

- **Layer 1 (Cố định)**: UI strings (menu, buttons, labels) - **MỨC ƯU TIÊN CAO**
- **Layer 2 (Động)**: Sản phẩm, danh mục, reviews - Chấp nhận fallback & rate limit

### Key Features
✅ Non-blocking setup (Phase 1-3 chạy background)
✅ Smart 429 handling (ghi nhận lỗi, Admin retry, manual edit)
✅ Real-time progress monitoring
✅ Admin Dashboard quản lý tiến độ
✅ Exponential backoff retry strategy

---

## Architecture

### Database Schema

#### `languages` Collection
```javascript
{
  code: "pt",
  name: "Português",
  isActive: true,
  isReady: false,
  setupStartedAt: Date,
  setupCompletedAt: Date,
}
```
- **Unique Index**: `code`
- **Query Index**: `isReady`, `isActive`

#### `statictranslations` Collection (Layer 1)
```javascript
{
  code: "pt",
  namespace: "common",  // Namespace grouping
  translations: {
    "login_btn": "Entrar",
    "logout_btn": "Sair",
    // ... 16+ keys per namespace
  },
  isDeleted: false,
  createdAt: Date,
  updatedAt: Date
}
```
- **Compound Unique Index**: `(code, namespace)`
- **Document Count**: ~530 (10 languages × 53 namespaces)
- **Query Performance**: < 20ms

#### `livetranslationcaches` Collection (Layer 2)
```javascript
{
  hashKey: "8b64e132ef2e55490ff456e36d40f807",
  originalText: "Laptop Dell XPS 13",
  translatedText: "Notebook Dell XPS 13",
  targetLang: "pt",
  entityId: ObjectId("..."), // Product/Category ID
  entityType: "product_name",
  status: "success", // 'success' | 'failed_rate_limit' | 'failed_error'
  retryCount: 0,
  lastRetryAt: Date,
  createdAt: Date, // TTL: 30 days
}
```
- **Unique Index**: `hashKey` (cache hit detection)
- **Compound Index**: `(entityId, targetLang, entityType)`
- **TTL Index**: Auto-delete after 30 days
- **Document Count Estimate**: 45,000 (1,000 products × 5 fields × 9 languages)

---

## Timeline Strategy

### Phase 0: Instant (T=0)
Admin clicks "Add Language" → HTTP 201 returned immediately
```bash
curl -X POST http://localhost:5000/api/language \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code":"pt", "name":"Português"}'
```

### Phase 1: Clone + Translate UI (T+1s to T+30s)
1. Clone 53 namespaces từ English → Portuguese
2. Translate từng namespace với concurrency=5, throttle=1000ms
3. Tránh 429 errors từ Cloudflare AI

**Configuration:**
```javascript
CONCURRENCY_LIMIT = 5       // Max 5 keys translating simultaneously
THROTTLE_MS = 1000          // Wait 1s between batches
TOTAL_KEYS = ~850           // 53 namespaces × ~16 keys
ESTIMATE = 170s (~3 phút)   // (850/5) × 1s
```

### Phase 2: Translate Products (T+30s to T+120s)
1. Chunking: Load 10 products mỗi lần (memory efficient)
2. Concurrency: 3 products in parallel
3. Per-product: dịch name, desc, brand, specs, features
4. Throttling: 500ms between chunks (linh hoạt hơn Layer 1)
5. **429 Handling**: Ghi nhận lỗi → status='failed_rate_limit'

**Configuration:**
```javascript
CHUNK_SIZE = 10
CONCURRENT_PRODUCTS = 3
THROTTLE_BETWEEN_CHUNKS = 500ms
MAX_RETRIES = 3
```

### Phase 3: Finalize (T+120s+)
1. Mark language as `isReady = true`
2. Invalidate in-memory cache
3. Language becomes active system-wide

---

## API Endpoints

### Backend APIs

#### Create Language (HTTP 201 + background job)
```bash
POST /api/language
Authorization: Bearer $TOKEN
Content-Type: application/json

{
  "code": "pt",
  "name": "Português"
}

Response:
{
  "success": true,
  "message": "Language added. Background setup started...",
  "data": {
    "code": "pt",
    "isReady": false,
    "setupStartedAt": "2026-06-12T..."
  }
}
```

#### Get Setup Status
```bash
GET /api/language/pt/setup-status
Authorization: Bearer $TOKEN

Response:
{
  "success": true,
  "data": {
    "code": "pt",
    "isReady": false,
    "status": "SETTING_UP",
    "setupDurationSeconds": 45
  }
}
```

#### Get Translation Status (NEW - Phase 2)
```bash
GET /api/translation/admin/status/pt
Authorization: Bearer $TOKEN

Response:
{
  "success": true,
  "data": {
    "code": "pt",
    "layer1": {
      "progress": 100,
      "completedNamespaces": 53,
      "totalNamespaces": 53
    },
    "layer2": {
      "progress": 85,
      "actualTranslations": 4250,
      "expectedTranslations": 5000
    },
    "errors": {
      "failed_rate_limit": 30,
      "failed_error": 5,
      "pending_retry": 0
    },
    "totalErrors": 35
  }
}
```

#### Get Failed Translations
```bash
GET /api/translation/admin/failed/pt?limit=50&status=failed_rate_limit
Authorization: Bearer $TOKEN

Response:
{
  "success": true,
  "data": {
    "items": [
      {
        "_id": "...",
        "hashKey": "8b64e132ef2e55490ff456e36d40f807",
        "originalText": "Laptop Dell XPS 13",
        "translatedText": "Laptop Dell XPS 13",
        "entityType": "product_name",
        "status": "failed_rate_limit",
        "retryCount": 1
      }
    ],
    "pagination": {
      "total": 35,
      "limit": 50,
      "hasMore": false
    }
  }
}
```

#### Retry Failed Translations
```bash
POST /api/translation/admin/retry/pt
Authorization: Bearer $TOKEN
Content-Type: application/json

{}

Response:
{
  "success": true,
  "message": "Marked 35 translations for retry. Background job started.",
  "data": {
    "resetCount": 35
  }
}
```

#### Manual Edit Translation
```bash
POST /api/translation/admin/edit-manual
Authorization: Bearer $TOKEN
Content-Type: application/json

{
  "hashKey": "8b64e132ef2e55490ff456e36d40f807",
  "translatedText": "Notebook Dell XPS 13 corrigido"
}

Response:
{
  "success": true,
  "message": "Translation updated successfully",
  "data": { ... }
}
```

#### Batch Edit Translations
```bash
POST /api/translation/admin/batch-edit
Authorization: Bearer $TOKEN
Content-Type: application/json

{
  "updates": [
    { "hashKey": "key1", "translatedText": "Texto 1" },
    { "hashKey": "key2", "translatedText": "Texto 2" }
  ]
}

Response:
{
  "success": true,
  "message": "Updated 2 translations",
  "data": { ... }
}
```

---

## Admin Dashboard (Frontend)

### Location
`/admin/translationDashboard`

### Features
1. **Language Selector** - Chọn ngôn ngữ để view
2. **Layer 1 Progress** - UI strings translation status
3. **Layer 2 Progress** - Product translations status
4. **Error Summary** - Breakdown of 429, errors, pending
5. **Failed Items List** - Table with edit dialog
6. **Retry Button** - Trigger background retry job
7. **Manual Edit Modal** - Edit individual translations

### UI Components
- Progress bars (0-100%)
- Error badges (429, error, pending)
- Retry/edit buttons
- Modal dialogs for inline editing

---

## Error Handling Strategy

### 429 (Rate Limited)
```javascript
// Automatic detection & logging
if (error.response?.status === 429) {
  // Save to DB with status='failed_rate_limit'
  await RateLimitHandler.recordRateLimitError(...)
  
  // Admin can retry from dashboard
  // Or manually edit via modal
}
```

### Exponential Backoff
```javascript
const delay = 2^retryCount * 1000 + jitter
// Retry 1: 2000ms
// Retry 2: 4000ms
// Retry 3: 8000ms
// Max: 60000ms (60s)
```

### Fallback Strategy
- **Layer 1**: Không bao giờ bỏ dịch (bắt buộc UI hoạt động)
- **Layer 2**: Nếu dính 429, lưu text gốc → Admin sửa tay sau

---

## Running Tests

### Unit Tests (verify logic)
```bash
npm run test
```

### E2E Test (full workflow)
```bash
export ADMIN_TOKEN="your_jwt_token"
export API_BASE="http://localhost:5000/api"
node test-translation-e2e.js
```

**Test Flow:**
1. Create language
2. Monitor Phase 1-3
3. Verify API endpoints
4. Check DB records
5. Test retry endpoint
6. Confirm language is active

---

## Production Checklist

### Before Deployment
- [ ] Set `CLOUDFLARE_ACCOUNT_ID` & `CLOUDFLARE_API_TOKEN` in .env
- [ ] Verify MongoDB indexes created:
  ```bash
  npm run setup-i18n-indexes
  ```
- [ ] Test full setup with test language
- [ ] Configure rate limits (Cloudflare AI quota)
- [ ] Setup monitoring for background jobs

### Monitoring
```javascript
// Enable detailed logging
process.env.DEBUG = 'translation:*'

// Monitor these log patterns:
// [Language] PHASE 1: Clone UI strings...
// [Language] PHASE 2: Dịch sản phẩm...
// [TranslationController] 🔄 Starting retry background job
// [RateLimitHandler] 📌 Ghi nhận 429 error
```

### Scaling
- **1,000 products** (base): ~2-3 minutes setup
- **10,000 products** (medium): ~12-15 minutes setup
- **100,000 products** (large): ~120 minutes setup

Adjust `CONCURRENT_PRODUCTS` and throttling if needed.

---

## Troubleshooting

### Issue: Language stuck at `isReady=false`
**Solution:**
1. Check logs: `docker logs <container> | grep "\[Language\]"`
2. Check API credentials in .env
3. Check MongoDB connection
4. Manually mark ready:
```javascript
db.languages.updateOne(
  { code: "pt" },
  { $set: { isReady: true, setupCompletedAt: new Date() } }
)
```

### Issue: All translations failed with 429
**Solution:**
1. Cloudflare AI quota exceeded → wait or increase quota
2. Check concurrency settings (reduce `CONCURRENT_PRODUCTS`)
3. Increase throttle delay
4. Use Admin Dashboard to retry when quota resets

### Issue: Products not translated
**Solution:**
1. Check `LiveTranslationCache` has documents
2. Verify Layer 1 (UI) completed first
3. Check product.name/description not empty
4. Manual edit via dashboard

---

## Future Enhancements

- [ ] Parallel Phase 1 + Phase 2 execution
- [ ] Translation quality scoring (confidence %)
- [ ] Selective product translation (by category)
- [ ] Webhook notifications on completion
- [ ] A/B testing for translation variants
- [ ] Multi-language simultaneous setup

---

## References

- BLUEPRINT_DATABASE_TIMELINE.md - Original design document
- cloudflareAiService.js - Translation API integration
- productTranslationSeederService.js - Layer 2 implementation
- translationSeederService.js - Layer 1 implementation
- RateLimitHandler.js - Error handling & retry logic
- TranslationDashboardPage.tsx - Admin UI component

---

**Last Updated**: 2026-06-12
**Status**: Production Ready ✅
**Version**: 1.0
