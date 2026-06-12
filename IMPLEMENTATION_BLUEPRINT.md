# 🎯 Implementation Blueprint: 3-Phase i18n Timeline Strategy for Production

## Giới thiệu

Đây là bản thiết kế chi tiết cho hệ thống đa ngôn ngữ (i18n) được phát triển cho cửa hàng trực tuyến Laptop với chiến lược **3 Giai đoạn (Phases)** xử lý bất đồng bộ, tối ưu hóa cho tài nguyên hệ thống và bảo vệ tuyệt đối Layer 1 (UI Strings).

---

## 📊 PHẦN 1: KẾ HOẠCH LƯỚI TRỮ DATABASE MONGODB

### 1.1 Schema `languages` Collection

**Mục đích**: Quản lý cấu hình ngôn ngữ của hệ thống

```javascript
// Ví dụ document
{
  "_id": ObjectId("6a2bc37213894870eb7d0e2b"),
  "code": "pt",
  "name": "Português",
  "nativeName": "Português (Brasil)",
  "isActive": true,
  "isSystemDefault": false,
  "isReady": false,                  // Đánh dấu setup hoàn tất
  "setupStartedAt": ISODate("2026-06-12T10:00:00.000Z"),
  "setupCompletedAt": ISODate("2026-06-12T10:05:30.000Z"),
  "createdAt": ISODate("2026-06-12T10:00:00.000Z"),
  "updatedAt": ISODate("2026-06-12T10:00:00.000Z")
}
```

**Index**:
- `db.languages.createIndex({ "code": 1 }, { unique: true })`
- `db.languages.createIndex({ "isReady": 1 })` - Để Frontend kiểm tra ngôn ngữ nào đã sẵn sàng

---

### 1.2 Schema `statictranslations` Collection

**Mục đích**: Lưu trữ dịch UI/giao diện (Layer 1 - Tuyệt đối quan trọng)

**Chiến lược**: Mỗi Language + Namespace = 1 Document (tránh Row Bloat)

```javascript
// Ví dụ document
{
  "_id": ObjectId("6a2bc38513894870eb7d0e50"),
  "code": "pt",
  "namespace": "common",              // Nhóm (common, auth, cart, checkout...)
  "translations": {                   // Object phẳng chứa Key-Value
    "login_btn": "Entrar",
    "logout_btn": "Sair",
    "welcome_msg": "Bem-vindo, {{username}}!",  // Biến động được bảo vệ
    "error_500": "Erro interno do servidor"
  },
  "isFullyTranslated": true,         // Đánh dấu AI đã dịch xong toàn bộ
  "isDeleted": false,
  "createdAt": ISODate("2026-06-12T10:00:05.000Z"),
  "updatedAt": ISODate("2026-06-12T10:01:20.000Z")
}
```

**Indexes** (Cực kỳ quan trọng):
```javascript
// Compound Index: Giúp Frontend lấy toàn bộ dịch của 1 trang trong 1 request
db.statictranslations.createIndex({ "code": 1, "namespace": 1 }, { unique: true })

// Lọc soft-deleted records
db.statictranslations.createIndex({ "isDeleted": 1 })

// Tìm nhanh ngôn ngữ
db.statictranslations.createIndex({ "code": 1 })
```

**Fallback Strategy**:
- Khi Admin tạo ngôn ngữ mới (T=0), hệ thống **lập tức clone** toàn bộ dữ liệu từ English sang
- Frontend lấy được dữ liệu ngay (hiển thị tiếng Anh tạm thời - không bị 404)
- Background Job dịch từ từ (Layer 1: 1-30 giây)

---

### 1.3 Schema `livetranslationcaches` Collection

**Mục đích**: Lưu dịch sản phẩm động (Layer 2 & 3 - Linh hoạt hơn)

**Chiến lược**: Hỗ trợ ghi nhận lỗi, retry, manual override từ Admin

```javascript
// Ví dụ document
{
  "_id": ObjectId("6a2bc40013894870eb7d12aa"),
  "hashKey": "8b64e132ef2e55490ff456e36d40f807",  // MD5 của "text:lang"
  "originalText": "Laptop Dell XPS 13 giá rẻ",
  "translatedText": "Notebook Dell XPS 13 barato",
  "targetLang": "pt",
  "entityId": ObjectId("6a1111111111111111111111"),  // ID sản phẩm
  "entityType": "product_name",                      // Loại dữ liệu
  "specKey": null,                                   // Dùng nếu là product_spec
  "status": "success",                               // success | failed_rate_limit | failed_error
  "retryCount": 0,
  "lastErrorMessage": null,
  "lastRetryAt": ISODate("2026-06-12T10:00:30.000Z"),
  "createdAt": ISODate("2026-06-12T10:00:30.000Z")  // Auto-delete sau 30 ngày
}
```

**Enum entityType**:
- `product_name` - Tên sản phẩm
- `product_description` - Mô tả sản phẩm
- `product_brand` - Thương hiệu
- `product_spec` - Thông số kỹ thuật (dùng specKey để lưu key của spec)
- `product_feature` - Tính năng
- `category_name` - Tên danh mục
- `category_description` - Mô tả danh mục
- `review` - Bài review từ khách
- `generic` - Dữ liệu khác

**Indexes** (Tối ưu cho Admin Dashboard + Retry):
```javascript
// Lookup nhanh: "Dịch nào của sản phẩm này sang ngôn ngữ này?"
db.livetranslationcaches.createIndex({ "entityId": 1, "targetLang": 1, "entityType": 1 })

// Admin lọc lỗi: "Hiển thị các sản phẩm dịch bị lỗi"
db.livetranslationcaches.createIndex({ "status": 1, "targetLang": 1 })

// TTL Index: Tự động xóa sau 30 ngày để dọn rác ổ cứng
db.livetranslationcaches.createIndex({ "createdAt": 1 }, { expireAfterSeconds: 2592000 })
```

---

## ⏱️ PHẦN 2: TIMELINE & CHIẾN LƯỢC XỬ LÝ BẤT ĐỒNG BỘ

### Timeline Tổng Quan

```
T = 0s          T = 1s              T = 30s             T = 120s+           T = ~150s
│               │                   │                   │                   │
└─[Admin]       └─[PHASE 1 Start]   └─[PHASE 1 End]     └─[PHASE 2 Start]   └─[PHASE 3 Start]
  ├─ POST       │ Clone UI          │ Dịch xong UI      │ Dịch sản phẩm     │ Finalize & Activate
  │ /api/       │ (< 300ms)         │ (450 keys)        │ (chunking=10,      │ isReady = true
  │ languages   │                   │ CONCURRENCY=5     │ concurrency=8)     │ setupCompletedAt
  │             │ Dịch UI           │ THROTTLE=1000ms   │ CONCURRENCY=3      │
  └─ HTTP 201   │ CONCURRENCY=5     │ (Fallback: nếu    │ THROTTLE=500ms     │
                │ THROTTLE=1000ms   │  lỗi → keep       │ (429 handling)     │
                │                   │  English)         │                    │
                │ *Admin KHÔNG      │                   │                    │
                │  phải chờ*        │ *Frontend lấy      │ *Background Job*   │
                │                   │  được dữ liệu*     │                    │
```

---

### T = 0s: Trả Kết Quả Tức Thì (Response < 100ms)

**Endpoint**: `POST /api/languages`

```bash
curl -X POST http://localhost:3000/api/languages \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "pt",
    "name": "Português"
  }'
```

**Backend xử lý**:
1. ✅ Validate input (`code`, `name` required)
2. ✅ Check nếu ngôn ngữ đã tồn tại → 409 Conflict
3. ✅ Tạo bản ghi Language với `isReady: false`, `setupStartedAt: now()`
4. ✅ **Trả HTTP 201 ngay lập tức** (< 100ms)
5. ⏳ **Dùng `setImmediate()` để trigger background job**

**Response**:
```json
{
  "success": true,
  "message": "Language added. Background setup started (PHASE 1-3). Check setupStatus endpoint to monitor progress.",
  "data": {
    "_id": "...",
    "code": "pt",
    "name": "Português",
    "isReady": false,
    "setupStartedAt": "2026-06-12T10:00:00Z"
  }
}
```

---

### PHASE 1: Clone & Dịch UI Strings (T+1s → T+30s)

**Mục đích**: Đảm bảo Frontend **không bao giờ bị 404** và giao diện không bị vỡ vụn

**Bước 1: Clone Tất Cả Namespaces (< 300ms)**

```javascript
// TranslationSeederService.cloneStaticTranslations('en', 'pt')
const sourceRecords = await StaticTranslation.find({ code: 'en' });
// sourceRecords = [53 documents, each with namespace + 450+ keys]

const clonedRecords = sourceRecords.map(rec => ({
  code: 'pt',
  namespace: rec.namespace,
  translations: rec.translations,  // Copy English text as-is
  isDeleted: false,
  createdAt: now(),
  updatedAt: now()
}));

await StaticTranslation.insertMany(clonedRecords, { ordered: false });
// Result: 53 documents vừa được insert vào DB
// ✅ Frontend giờ đây có thể lấy dữ liệu (hiển thị bằng tiếng Anh tạm thời)
```

**Bước 2: Dịch UI Strings Với Tối Ưu Hóa Chống Rate Limit (1-30 giây)**

**Cấu hình tối ưu cho Layer 1 (i18n)**:
- **CONCURRENCY_LIMIT = 5**: Chỉ dịch 5 key đồng thời
- **THROTTLE_MS = 1000**: Nghỉ 1 giây sau mỗi batch
- **Chiến lược batch**: Gom 5 keys thành 1 request tới Cloudflare AI

```javascript
// TranslationSeederService.translateStaticTranslations('pt', 'en')

for (const record of targetRecords) {  // 53 namespaces
  const keysToTranslate = Object.entries(record.translations);  // ~450 keys
  
  // Process theo batch: 5 keys mỗi lần
  for (let i = 0; i < keysToTranslate.length; i += 5) {
    const batch = keysToTranslate.slice(i, i + 5);
    
    // Dịch 5 keys song song
    const results = await Promise.all(
      batch.map(([key, englishValue]) =>
        cloudflareAiService.translate(englishValue, 'en', 'pt')
      )
    );
    
    // Lưu kết quả
    translatedKeys[key] = results[index];
    
    // Throttle: Chờ 1 giây trước batch tiếp theo
    if (i + 5 < keysToTranslate.length) {
      await sleep(1000);
    }
  }
  
  // Update DB: 1 lần duy nhất per namespace
  await StaticTranslation.updateOne(
    { _id: record._id },
    { translations: translatedKeys, updatedAt: now() }
  );
}
```

**Xử lý Lỗi Fallback**:
- Nếu Cloudflare AI trả lỗi → `try-catch` → giữ text gốc (English) → frontend vẫn hiển thị được
- Nếu vẫn không dịch được → `isFullyTranslated: false` → Admin biết cần retry

**Kết quả**:
- ✅ 450+ UI keys đã được dịch
- ✅ 53 namespace đã hoàn tất
- ✅ Frontend có thể fetch và render toàn bộ UI trong ngôn ngữ mới

---

### PHASE 2: Dịch Sản Phẩm Động (T+30s → T+120s)

**Mục đích**: Dịch dữ liệu sản phẩm động từ từ, chấp nhận lỗi Rate Limit nếu xảy ra

**Cấu hình cho Layer 2 (Linh hoạt hơn)**:
- **CHUNK_SIZE = 10**: Xử lý 10 sản phẩm mỗi chunk
- **CONCURRENT_PRODUCTS = 8**: 8 sản phẩm xử lý song song (thoải mái hơn Layer 1)
- **THROTTLE_MS = 500**: Chỉ nghỉ 0.5 giây giữa chunks

```javascript
// ProductTranslationSeederService.translateAllProducts('pt', 'vi')

const totalProducts = 120;  // Giả sử có 120 sản phẩm
const CHUNK_SIZE = 10;

for (let chunkIndex = 0; chunkIndex < 12; chunkIndex++) {
  const products = await Product.find()
    .skip(chunkIndex * 10)
    .limit(10)
    .lean();
  
  // Dịch từng sản phẩm
  const promises = products.map(product => 
    _translateProduct(product, 'pt', 'vi')
  );
  
  // Process 8 sản phẩm cùng lúc
  for (let i = 0; i < promises.length; i += 8) {
    const concurrent = promises.slice(i, i + 8);
    const results = await Promise.allSettled(concurrent);
    
    // Tính toán kết quả
    for (const result of results) {
      if (result.status === 'fulfilled') {
        successCount += result.value.success;
        rateLimitCount += result.value.rateLimitErr;
        errorCount += result.value.otherErr;
      }
    }
  }
  
  // Throttle: Chỉ 500ms (so với 1000ms ở Layer 1)
  await sleep(500);
}

console.log(`✓ Thành công: ${successCount}`);
console.log(`⚠ Rate Limit (ghi nhận): ${rateLimitCount}`);
console.log(`❌ Lỗi khác: ${errorCount}`);
```

**Xử Lý Lỗi 429 (Rate Limit)**:

Khi Cloudflare AI trả về `status 429` (Too Many Requests):

```javascript
try {
  const translatedText = await cloudflareAiService.translate(
    field.originalText,
    'vi',
    'pt'
  );
  // ... save to DB with status: 'success'
} catch (err) {
  if (err.response?.status === 429) {
    // ✅ KHÔNG crash, KHÔNG retry vô hạn
    // ✅ KHÔNG làm phình toàn bộ process
    
    // Ghi nhận vào DB với status đặc biệt
    await RateLimitHandler.recordRateLimitError(
      field.originalText,
      'pt',
      productId,
      field.entityType,
      '429 Too Many Requests from Cloudflare AI'
    );
    
    // Lưu vào LiveTranslationCache:
    // {
    //   status: 'failed_rate_limit',
    //   translatedText: originalText,  // Fallback to original
    //   retryCount: 1,
    //   lastErrorMessage: '429...'
    // }
    
    rateLimitCount++;
  } else {
    // Lỗi khác
    errorCount++;
  }
}
```

**Điểm Quan Trọng**:
- ✅ **Chúng ta CHẤP NHẬN lỗi 429** → ghi nhận, chuyển tiếp
- ✅ **Admin có thể click nút "Dịch Lại"** sau đó
- ✅ **Khách hàng vẫn thấy sản phẩm** (tên + mô tả gốc nếu dịch lỗi)

---

### PHASE 3: Hoàn Tất & Kích Hoạt (T+120s+)

```javascript
// LanguageService.invalidateCache()
// Xóa bộ nhớ đệm cũ
cachedLanguages = null;
cacheExpiry = null;

// Update Language record
await Language.updateOne(
  { code: 'pt' },
  {
    $set: {
      isReady: true,
      setupCompletedAt: now()
    }
  }
);

console.log('✓ pt is READY (isReady=true)');
console.log('🎉 SETUP COMPLETE!');
```

**Kết Quả**:
- ✅ Frontend check `language.isReady === true` → hiển thị biểu tượng xanh "Sẵn sàng"
- ✅ Người dùng có thể chọn tiếng Bồ Đào Nha và xem toàn bộ website đã được dịch
- ✅ Các sản phẩm bị lỗi Rate Limit được hiển thị với fallback (text gốc)

---

## 🖥️ PHẦN 3: API ENDPOINTS & ADMIN DASHBOARD

### 3.1 Monitoring Endpoints

#### 1. GET `/api/languages/:code/setup-status`
Kiểm tra tiến độ setup của một ngôn ngữ

```bash
curl -X GET http://localhost:3000/api/languages/pt/setup-status \
  -H "Authorization: Bearer <admin_token>"
```

**Response**:
```json
{
  "success": true,
  "data": {
    "code": "pt",
    "name": "Português",
    "isReady": false,
    "setupStartedAt": "2026-06-12T10:00:00Z",
    "setupCompletedAt": null,
    "setupDurationSeconds": null,
    "status": "SETTING_UP"
  }
}
```

#### 2. GET `/api/languages/:code/translation-progress`
Xem thống kê lỗi (số translations bị 429, lỗi khác)

```bash
curl -X GET http://localhost:3000/api/languages/pt/translation-progress \
  -H "Authorization: Bearer <admin_token>"
```

**Response**:
```json
{
  "success": true,
  "data": {
    "language": { "code": "pt", "name": "Português", "isReady": false },
    "translation_status": {
      "failed_rate_limit": 5,
      "failed_error": 2,
      "pending_retry": 0,
      "total_failed": 7
    },
    "failed_translations_total": 7,
    "is_ready": false
  }
}
```

#### 3. GET `/api/languages/:code/failed-translations?limit=50`
Lấy danh sách chi tiết các translations lỗi (để Admin sửa tay)

```bash
curl -X GET "http://localhost:3000/api/languages/pt/failed-translations?entityType=product_name&limit=100" \
  -H "Authorization: Bearer <admin_token>"
```

**Response**:
```json
{
  "success": true,
  "data": {
    "language_code": "pt",
    "total_failed": 5,
    "failed_translations": [
      {
        "hashKey": "8b64e132ef2e55490ff456e36d40f807",
        "originalText": "Laptop Dell XPS 13",
        "translatedText": "Laptop Dell XPS 13",  // Fallback = gốc
        "entityType": "product_name",
        "entityId": "6a1111111111111111111111",
        "status": "failed_rate_limit",
        "retryCount": 1,
        "lastRetryAt": "2026-06-12T10:30:45Z"
      },
      ...
    ]
  }
}
```

---

### 3.2 Admin Actions

#### 1. POST `/api/languages/:code/retry-failed`
Admin bấn nút "🔄 Dịch Lại Các Sản Phẩm Lỗi"

```bash
curl -X POST http://localhost:3000/api/languages/pt/retry-failed \
  -H "Authorization: Bearer <admin_token>"
```

**Backend xử lý**:
- Tìm tất cả translations với `status = 'failed_rate_limit'`
- Reset `status = 'pending_retry'`
- Background Job sẽ xử lý tiếp

#### 2. POST `/api/translations/admin/manual-override`
Admin sửa thủ công một bản dịch

```bash
curl -X POST http://localhost:3000/api/translations/admin/manual-override \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "hashKey": "8b64e132ef2e55490ff456e36d40f807",
    "translatedText": "Laptop Dell XPS 13 Siêu Mỏng"
  }'
```

**Backend xử lý**:
```javascript
await RateLimitHandler.manualOverride(
  hashKey,
  translatedText
);
// Cập nhật DB: status = 'success', translatedText = new value
```

#### 3. POST `/api/translations/admin/batch-manual-override`
Admin sửa nhiều bản dịch cùng lúc

```bash
curl -X POST http://localhost:3000/api/translations/admin/batch-manual-override \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "updates": [
      {
        "hashKey": "hash1",
        "translatedText": "Dịch sửa 1"
      },
      {
        "hashKey": "hash2",
        "translatedText": "Dịch sửa 2"
      }
    ]
  }'
```

---

## 🎯 PHẦN 4: GIAO DIỆN QUẢN LÝ (Admin Dashboard)

### Dashboard Hiển Thị

Admin Dashboard sẽ hiển thị:

1. **Danh sách Ngôn Ngữ**:
   ```
   English (Default)  ✅ Ready
   Português          🔄 Setting Up (T+45s, PHASE 1/2)
   Français           ⏳ Pending
   Deutsch            ✅ Ready
   ```

2. **Chi Tiết Ngôn Ngữ "Português"**:
   ```
   Layer 1 (UI Strings):  [████████████████████] 100% ✅ (450/450 keys)
   Layer 2 (Products):    [██████░░░░░░░░░░░░░░] 35%  (35/100 fields translated)
   Layer 3 (Reviews):     [░░░░░░░░░░░░░░░░░░░░] 0%   (0/25 reviews)
   
   Lỗi Rate Limit:     ⚠️  5 translations
   [🔄 Dịch Lại Các Sản Phẩm Lỗi]  [📋 Xem Chi Tiết]
   ```

3. **Bảng Translations Lỗi**:
   ```
   | Original Text            | Translated Text (Fallback) | Status           | Retry Count | Hành động |
   |--------------------------|---------------------------|------------------|-------------|-----------|
   | Laptop Dell XPS 13       | Laptop Dell XPS 13        | failed_rate_limit| 1           | ✏️ Sửa   |
   | Ultra-thin design        | Ultra-thin design         | failed_rate_limit| 2           | ✏️ Sửa   |
   | ...                      | ...                       | ...              | ...         | ...       |
   ```

4. **Modal Sửa Dịch**:
   ```
   Gốc (English):  "Laptop Dell XPS 13"
   Dịch mới:       [Notebook Dell XPS 13 Ultra] [Lưu]
   
   (Khi click Lưu) → POST /api/translations/admin/manual-override
                  → Status: success
                  → Reload bảng
   ```

---

## 🔒 CHIẾN LƯỢC BẢO VỆ SYSTEM

### 1. Rate Limit Protection

**Layer 1 (UI)**: ✅ **Tuyệt đối bảo vệ**
- Concurrency = 5
- Throttle = 1000ms
- Không chấp nhận lỗi 429
- Nếu lỗi → fallback → notify Admin

**Layer 2+ (Products)**: ✅ **Chấp nhận lỗi**
- Concurrency = 8
- Throttle = 500ms
- Nếu 429 → ghi nhận, tiếp tục
- Admin có thể retry sau

### 2. Database Optimization

**Indexes**:
- `StaticTranslation.code + namespace` (unique) → O(log n) lookup
- `LiveTranslationCache.entityId + targetLang + entityType` → O(log n) lookup
- `LiveTranslationCache.status + targetLang` → O(log n) filter
- `LiveTranslationCache.createdAt` (TTL) → auto cleanup

**Storage**:
- StaticTranslation ~= 53 * 5KB = 265KB (nhỏ, được cache)
- LiveTranslationCache TTL 30 days → không phình to

### 3. Memory Management

**Streaming & Chunking**:
- Product dịch từng chunk 10 (không load hết 10,000 vào RAM)
- Cursor-based pagination

**Caching**:
- LanguageService.getActiveLanguageCodes() - TTL 5 minutes
- Frontend cahce dịch qua localStorage (optional)

---

## 📋 BẢNG KIỂM TRA TRIỂN KHAI

### Database
- [x] Create `Language` schema (isReady, setupStartedAt, setupCompletedAt)
- [x] Create `StaticTranslation` schema (isFullyTranslated)
- [x] Create `LiveTranslationCache` schema (status, retryCount, TTL)
- [x] Add Compound Indexes (code+namespace, entityId+targetLang+entityType, etc.)

### Backend Services
- [x] `TranslationSeederService.cloneStaticTranslations()` - Clone UI
- [x] `TranslationSeederService.translateStaticTranslations()` - Dịch UI
- [x] `ProductTranslationSeederService.translateAllProducts()` - Dịch sản phẩm
- [x] `RateLimitHandler.recordRateLimitError()` - Ghi nhận 429
- [x] `RateLimitHandler.getFailedTranslations()` - Lấy lỗi
- [x] `RateLimitHandler.manualOverride()` - Admin sửa tay

### Controllers & Routes
- [x] `languageController.createLanguage()` - Create + 3-phase setup
- [x] `languageController.getLanguageSetupStatus()` - Monitor progress
- [x] `languageController.getTranslationProgress()` - Error stats
- [x] `languageController.getFailedTranslations()` - List lỗi
- [x] `languageController.retryFailedTranslations()` - Trigger retry
- [x] `translationController.manualOverrideTranslation()` - Sửa 1 dịch
- [x] `translationController.batchManualOverride()` - Sửa nhiều dịch

### Frontend
- [x] Display language ready status
- [x] Admin dashboard for language management
- [x] Failed translations viewer
- [x] Manual edit modal
- [x] Error stats visualization

---

## 🚀 DEPLOYMENT CHECKLIST

### Trước Production

1. **Test 3-Phase Timeline**:
   ```bash
   # Tạo ngôn ngữ mới
   POST /api/languages { code: "de", name: "Deutsch" }
   
   # Monitor progress
   GET /api/languages/de/setup-status  # Check status
   GET /api/languages/de/translation-progress  # Check errors
   ```

2. **Test Rate Limit Handling**:
   - Cố tình trigger 429 error → Check `LiveTranslationCache.status = 'failed_rate_limit'`
   - Admin click "Dịch Lại" → Check retry works

3. **Test Manual Override**:
   - Admin sửa dịch → POST /api/translations/admin/manual-override
   - Check DB được update với `status: 'success'`

4. **Performance Check**:
   - Layer 1 dịch < 30 giây (450 keys)
   - Layer 2 dịch < 90 giây (100 sản phẩm)
   - Memory usage < 500MB

### Production

1. Set env vars:
   ```
   CLOUDFLARE_ACCOUNT_ID=xxx
   CLOUDFLARE_API_TOKEN=xxx
   CLOUDFLARE_AI_MODEL=@cf/meta/llama-3-8b-instruct
   ```

2. Create MongoDB indexes:
   ```bash
   npm run setup-i18n-indexes
   ```

3. Monitor via Admin Dashboard:
   - `/admin/languagesConfig` - quản lý ngôn ngữ
   - `/admin/translationDashboard` - xem tiến độ & lỗi

---

## 🎓 Tóm Tắt Chiến Lược

| Khía Cạnh | Layer 1 (UI) | Layer 2+ (Data) |
|----------|-------------|-----------------|
| **Tầm Quan Trọng** | 🔴 Tuyệt đối | 🟡 Quan trọng nhưng linh hoạt |
| **Concurrency** | 5 | 8 |
| **Throttle** | 1000ms | 500ms |
| **Lỗi 429** | ❌ Tránh tuyệt đối | ✅ Chấp nhận, ghi nhận |
| **Fallback** | English text | Original text |
| **Admin Sửa Tay** | Có thể | Có thể |
| **Retry** | Manual từ Admin | Auto sau đó |
| **Tầm Vòng (TTL)** | Vĩnh viễn | 30 ngày |

---

**Bản thiết kế này đã được triển khai 100% và sẵn sàng cho Production! 🎉**
