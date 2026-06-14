# 📘 KẾ HOẠCH TRIỂN KHAI I18N ENTERPRISE (ZERO-DOWNTIME)

**Cập nhật:** June 2026  
**Phiên bản:** v1.0  
**Trạng thái:** Planning Phase  
**Mục tiêu:** Tối ưu hệ thống i18n lên ngưỡng Enterprise (Scale >1 triệu sản phẩm, 8-9 ngôn ngữ)

---

## 📌 TÓM TẮT HIỆN TRẠNG & VẤN ĐỀ

### 1. Tầng Database: Ôm đồm & Phình to dữ liệu

**Vấn đề chính:**
- `LiveTranslationCache` lưu chung: dữ liệu sản phẩm (Hot, ít thay), text ad-hoc (Short-lived), đánh giá (Volatile)
- **N+1 Query**: Mỗi spec = 1 dòng riêng → khi load sản phẩm 100 specs = 100+ queries
- **TTL đồng nhất (30 ngày):** Áp dụng cho mọi loại dữ liệu không hợp lý
  - Sản phẩm cần TTL 90 ngày (tiết kiệm dịch lại)
  - Reviews cần TTL 30-60 ngày (giải phóng bộ nhớ nhanh)

**Ảnh hưởng:**
- Response time tăng 500ms-2s trên sản phẩm nhiều specs
- Memory bloat: collection có 10M+ documents → slow queries
- Không thể scale lên 8-9 ngôn ngữ

---

### 2. Tầng Backend Flow: Thiếu cơ chế tự vệ & Giám sát

**Vấn đề chính:**
- **Không có Rate Limiting:** Khi gọi Cloudflare AI API, không kiểm soát tốc độ
- **Khi dính 429 (Too Many Requests):** Hệ thống crash, không tự hồi phục
- **Lỗ hổng Audit:** Admin sửa dịch thủ công nhưng không log vết (ai sửa, lúc nào, giá trị cũ gì)

**Ảnh hưởng:**
- Mất dữ liệu khi API limit
- Không thể debug nếu có sai sót
- Không comply với yêu cầu audit của enterprise

---

### 3. Tầng Frontend: Vết xước & Layout Shift

**Vấn đề chính:**
- `setLocale()` xóa toàn bộ cache → màn hình bị trống text hoặc lộ raw keys (`footer.description`)
- **Monolithic Load:** Tải cả file translation (50KB+) chứa text không cần thiết
- **Không offline support:** Mất kết nối → UI vỡ

**Ảnh hưởng:**
- UX xấu khi chuyển ngôn ngữ (blinky screen)
- Slow initial load (LCP/FCP bị phạt)
- Không hoạt động offline

---

## 🏗️ GIẢI PHÁP TOÀN DIỆN

### Mô hình Kiến trúc 3 Lớp Biệt lập

```
┌─────────────────────────────────────────────────────────┐
│  TẦNG 1: Frontend (LanguageContext + SWR)               │
│  - Giữ old locale khi chuyển (Stale data)              │
│  - Load new ngầm (Revalidate)                          │
│  - Fallback IndexedDB nếu offline                      │
└─────────────────────────────────────────────────────────┘
                        ↓ (API call)
┌─────────────────────────────────────────────────────────┐
│  TẦNG 2: Backend (Rate Limiting + Audit)                │
│  - Queue + Throttling (max N request/sec)              │
│  - Exponential Backoff (2^n seconds)                   │
│  - TranslationAuditLog (log mỗi override)              │
└─────────────────────────────────────────────────────────┘
                        ↓ (DB query)
┌─────────────────────────────────────────────────────────┐
│  TẦNG 3: Database (Hybrid Schema)                       │
│  - ProductCatalogTranslationCache (TTL 90 ngày)        │
│    - Specs & Features gom 1 document                   │
│    - O(1) query thay vì O(N)                           │
│  - UserContentTranslationCache (TTL 30-60 ngày)        │
│    - Reviews & Comments riêng biệt                    │
│  - TranslationAuditLog (Audit trail)                   │
└─────────────────────────────────────────────────────────┘
```

---

## 📅 GIAI ĐOẠN TRIỂN KHAI (4 PHASE)

### **GIAI ĐOẠN 1: Shadow Writes** (Tuần 1)
**Mục tiêu:** Ghi song song vào 2 schema mà không ảnh hưởng production

**Công việc:**
1. Tạo 2 models mới:
   - `ProductCatalogTranslationCache.js`
   - `UserContentTranslationCache.js`
   - `TranslationAuditLog.js`

2. Cập nhật `translationSeeder.js` & `translationController.js`:
   - Khi insert/update bảng cũ → cũng insert/update bảng mới
   - Thêm feature flag `USE_SHADOW_WRITES=true` để kiểm soát

3. Test:
   - Verify cả 2 bảng có dữ liệu
   - Không ảnh hưởng endpoint hiện tại

**Rollback:** Chỉ cần disable feature flag

---

### **GIAI ĐOẠN 2: Data Migration** (Tuần 2)
**Mục tiêu:** Gom dữ liệu từ bảng cũ sang bảng mới (Aggregation)

**Công việc:**
1. Viết script migration `scripts/migrate-translations.js`:
   ```javascript
   // Pseudocode
   const oldDocs = await LiveTranslationCache.find({});
   
   for (const doc of oldDocs) {
     if (doc.entityType === 'product_spec') {
       // Gom tất cả spec của 1 sản phẩm → 1 document
       // {
       //   entityId: "prod_123",
       //   targetLang: "en",
       //   specs: {
       //     "RAM": "16GB",
       //     "SSD": "512GB"
       //   }
       // }
     } else if (doc.entityType === 'product_feature') {
       // Gom features thành array
       // {
       //   entityId: "prod_123",
       //   targetLang: "en",
       //   features: ["Fast", "Reliable"]
       // }
     }
     
     // Insert vào bảng mới tương ứng
   }
   ```

2. Chạy migration trên staging trước
3. Verify integrity:
   - Total record count
   - No duplicates
   - All specs/features preserved

**Rollback:** Xóa dữ liệu từ bảng mới

---

### **GIAI ĐOẠN 3: Switch Reading** (Tuần 3)
**Mục tiêu:** Chuyển backend & frontend từ bảng cũ sang bảng mới

**Công việc Backend:**

1. Cập nhật `translationController.js`:
   - `getProductTranslations()` → query từ `ProductCatalogTranslationCache`
   - `getCategoryTranslations()` → query từ `ProductCatalogTranslationCache`
   - `getReviewTranslations()` → query từ `UserContentTranslationCache`

2. Cập nhật cloudflareAiService:
   - Thêm Rate Limiting + Queue
   - Thêm Exponential Backoff
   - Idempotency lock (pending status)

**Công việc Frontend:**

1. Sửa `LanguageContext.tsx` - SWR Pattern:
   ```typescript
   const setLocale = async (newLocale: Locale) => {
     // ❌ OLD: setLoadedTranslations({}) → layout shift
     
     // ✅ NEW:
     // 1. Giữ nguyên old translations (Stale data)
     // 2. Hiển thị spinner trên nút chuyển ngôn ngữ
     // 3. Load new translations async
     // 4. Khi xong → "flip" toàn bộ giao diện cùng 1 lúc
   }
   ```

2. Thêm offline support:
   - Lưu translations vào IndexedDB
   - Load từ IndexedDB nếu offline

**Rollback:** Chỉ cần disable switch flag

---

### **GIAI ĐOẠN 4: Cleanup & Monitoring** (Tuần 4)
**Mục tiêu:** Finalize, backup cũ, setup monitoring

**Công việc:**

1. **Backup:**
   - Dump `LiveTranslationCache` ra file `.bak.json`
   - Lưu trữ ngoài

2. **Drop old table:**
   - Xóa `LiveTranslationCache` (sau khi chắc chắn không cần)
   - Xóa feature flag từ code

3. **Setup Monitoring:**
   - Health check script: kiểm tra error stats
   - Alert Slack/Telegram nếu:
     - Error rate > 5%
     - Cache hit rate < 90%
     - API latency > 2s

4. **Documentation:**
   - Update API docs
   - Write migration guide cho team

---

## 📊 TIMELINE & DEPENDENCIES

### Task Dependency Graph

```
┌─ #1: Phân tích & thiết kế (2h)
│
├─ #2: Schema mới (3h) ──┐
│                        │
├─ #3: AuditLog (1h) ────┼─── #4: Shadow Writes (4h) ──────┐
│                        │                                   │
│                        └────────────────────────────────┐  │
│                                                         │  │
├─ #6: Rate Limiting (2h) ──────────────────────────┐    │  │
│                                                    │    │  │
└────────────────────────────────────────────────────┼───┼── #5: Migration (3h)
                                                     │    │
                                                     └─── #7: Switch Reading (4h) ──┐
                                                           │                        │
                                                           ├─ #8: SWR (3h) ─────┤
                                                           │                        │
                                                           ├─ #9: Namespace (2h) ┤
                                                           │                        │
                                                           └─ #10: IndexedDB (2h) ┤
                                                                                    │
                                                                     #11: Cleanup (2h)
```

---

## 📋 DANH SÁCH TASK CHI TIẾT

### Phase 0: Analysis & Design

| # | Task | Thời gian | Status | Ghi chú |
|---|------|----------|--------|---------|
| 1 | Phân tích hiện trạng & vẽ sơ đồ | 2h | ✅ DONE | PHASE_0_ANALYSIS_REPORT.md (665 lines) |
| 2 | Thiết kế ProductCatalogTranslationCache schema | 2h | ✅ DONE | PHASE_0_SCHEMA_DESIGN.md (813 lines) |
| 2b | Thiết kế UserContentTranslationCache schema | 1h | ✅ DONE | Trong PHASE_0_SCHEMA_DESIGN.md |
| 3 | Thiết kế TranslationAuditLog model | 1h | ✅ DONE | Trong PHASE_0_SCHEMA_DESIGN.md |

**Subtotal Phase 0:** 6 giờ ✅ COMPLETE

---

### Phase 1: Shadow Writes

| # | Task | Thời gian | Status | Dependencies |
|---|------|----------|--------|--------------|
| 4 | Tạo 3 models mới (ProductCatalog, UserContent, AuditLog) | 1h | ⏳ Pending | #2, #3 |
| 4b | Sửa translationSeeder để ghi 2 bảng cùng lúc | 1.5h | ⏳ Pending | #4 |
| 4c | Sửa translationController endpoints | 1.5h | ⏳ Pending | #4 |
| 4d | Test shadow writes, verify consistency | 1h | ⏳ Pending | #4c |

**Subtotal Phase 1:** 5 giờ

---

### Phase 2: Data Migration

| # | Task | Thời gian | Status | Dependencies |
|---|------|----------|--------|--------------|
| 5 | Viết script migration (aggregation) | 2h | ⏳ Pending | #4 |
| 5b | Test migration trên staging | 1h | ⏳ Pending | #5 |
| 5c | Verify data integrity & count | 0.5h | ⏳ Pending | #5b |

**Subtotal Phase 2:** 3.5 giờ

---

### Phase 3: Switch Reading & Backend Optimization

| # | Task | Thời gian | Status | Dependencies |
|---|------|----------|--------|--------------|
| 6 | Thêm Rate Limiting + Exponential Backoff (cloudflareAiService) | 2h | ⏳ Pending | - (parallel OK) |
| 6b | Thêm Queue & Throttling | 1h | ⏳ Pending | #6 |
| 7 | Cập nhật translationController để query bảng mới | 1.5h | ⏳ Pending | #5 |
| 7b | Cập nhật cloudflareAiService logging | 0.5h | ⏳ Pending | #6b |
| 7c | Test backend endpoints | 1h | ⏳ Pending | #7 |

**Subtotal Phase 3 (Backend):** 6 giờ

---

### Phase 3: Frontend Optimization (SWR, Offline)

| # | Task | Thời gian | Status | Dependencies |
|---|------|----------|--------|--------------|
| 8 | Triển khai SWR pattern (LanguageContext) | 2h | ⏳ Pending | #7c |
| 8b | Thêm spinner/loading indicator | 1h | ⏳ Pending | #8 |
| 9 | Phân mảnh Namespace (route-based) | 2h | ⏳ Pending | #8 |
| 10 | Thêm IndexedDB offline support | 2h | ⏳ Pending | #9 |
| 10b | Test offline scenarios | 1h | ⏳ Pending | #10 |

**Subtotal Phase 3 (Frontend):** 8 giờ

---

### Phase 4: Cleanup & Monitoring

| # | Task | Thời gian | Status | Dependencies |
|---|------|----------|--------|--------------|
| 11 | Backup LiveTranslationCache | 0.5h | ⏳ Pending | #10b |
| 11b | Drop old table từ DB | 0.5h | ⏳ Pending | #11 |
| 11c | Setup monitoring & alerts (Slack/Telegram) | 1h | ⏳ Pending | #11b |
| 11d | Write documentation & migration guide | 1h | ⏳ Pending | #11c |

**Subtotal Phase 4:** 3 giờ

---

### Testing & QA

| # | Task | Thời gian | Status | Dependencies |
|---|------|----------|--------|--------------|
| 12 | End-to-end testing (production simulation) | 2h | ⏳ Pending | #11d |
| 12b | Performance benchmarking (before/after) | 1h | ⏳ Pending | #12 |
| 12c | Rollback testing (xác định procedure) | 1h | ⏳ Pending | #12b |

**Subtotal Testing:** 4 giờ

---

## ⏱️ TỔNG TIMELINE

| Phase | Thời gian | Giai đoạn | Status |
|-------|----------|----------|--------|
| 0: Analysis | 6h | Tuần 1 (T2-T3) | ✅ DONE |
| 1: Shadow Writes | 5h | Tuần 1 (T4-T5) | ⏳ Next |
| 2: Migration | 3.5h | Tuần 2 (T1-T2) | ⏳ Pending |
| 3: Switch Reading | 14h | Tuần 2-3 (T3-T5) | ⏳ Pending |
| 4: Cleanup | 3h | Tuần 4 (T1) | ⏳ Pending |
| Testing | 4h | Tuần 4 (T2-T3) | ⏳ Pending |
| **TỔNG CỘNG** | **~35.5 giờ** | **~4-5 ngày làm việc (8h/day)** | 6/35.5h ✅ |

---

## 📌 PHASE 0 STATUS UPDATE

**✅ COMPLETED - All 3 Design Tasks Done**

### Deliverables Created:
1. **PHASE_0_ANALYSIS_REPORT.md** (665 lines)
   - Complete codebase architecture mapping
   - 8 critical bottlenecks identified with data
   - 4 detailed flow diagrams (Load → Product → Seeding → Override)
   - Before/after data size analysis

2. **PHASE_0_SCHEMA_DESIGN.md** (813 lines)
   - Complete schema for ProductCatalogTranslationCache (with specs aggregation)
   - Complete schema for UserContentTranslationCache
   - Complete schema for TranslationAuditLog (compliance-ready)
   - Index strategies, helper methods, query examples

3. **PHASE_0_SUMMARY.md** (285 lines)
   - Executive summary of Phase 0
   - Performance projections (10-20x faster queries expected)
   - Key design decisions documented
   - Ready for Phase 1 implementation

**Ready for:** Phase 1 (Shadow Writes - Creating 3 new models)

---

## 🔧 KIẾN TRÚC CHI TIẾT

### Database Schema (Bảng mới)

#### ProductCatalogTranslationCache
```javascript
{
  _id: ObjectId,
  entityId: String,           // Product ID
  targetLang: String,         // "en", "fr", etc.
  name: String,              // Translated product name
  description: String,       // Translated description
  brand: String,            // Translated brand
  specs: {                   // ✨ GOM CỤUM (gom tất cả specs thành object)
    "RAM": "16GB DDR5",
    "Storage": "512GB NVMe",
    "CPU": "Intel Core i7"
  },
  features: [String],        // ✨ GOM CỤUM (array features)
  categoryName: String,
  status: String,            // "success", "failed_rate_limit", "pending_retry"
  retryCount: Number,
  lastErrorMessage: String,
  createdAt: Date,
  updatedAt: Date,
  // TTL Index: Tự động xóa sau 90 ngày
}

// Compound Index
db.ProductCatalogTranslationCache.createIndex({
  entityId: 1,
  targetLang: 1
})

// TTL Index
db.ProductCatalogTranslationCache.createIndex({
  createdAt: 1
}, { expireAfterSeconds: 7776000 })  // 90 ngày
```

#### UserContentTranslationCache
```javascript
{
  _id: ObjectId,
  entityId: String,           // Review ID
  entityType: String,        // "review", "comment"
  targetLang: String,
  originalText: String,
  translatedText: String,
  status: String,
  retryCount: Number,
  createdAt: Date,
  // TTL Index: Tự động xóa sau 30-60 ngày (tuỳ config)
}

// TTL Index
db.UserContentTranslationCache.createIndex({
  createdAt: 1
}, { expireAfterSeconds: 2592000 })  // 30 ngày (tuỳ adjust)
```

#### TranslationAuditLog
```javascript
{
  _id: ObjectId,
  hashKey: String,           // Hash của original text + lang
  userId: String,            // Admin user ID
  userName: String,
  action: String,            // "manual_override", "batch_update"
  oldValue: String,          // Giá trị cũ
  newValue: String,          // Giá trị mới
  entityId: String,          // Product/Review ID nếu áp dụng
  entityType: String,
  targetLang: String,
  timestamp: Date,
  reason: String,            // Why admin made this change (tuỳ chọn)
}

// Index để query logs
db.TranslationAuditLog.createIndex({
  userId: 1,
  timestamp: -1
})

db.TranslationAuditLog.createIndex({
  entityId: 1,
  targetLang: 1
})
```

---

### Backend Flow

#### cloudflareAiService.js - Rate Limiting & Backoff
```javascript
class CloudflareAiService {
  constructor() {
    this.queue = new Queue({ concurrency: 3 }); // Max 3 concurrent requests
    this.requestsPerSecond = 5;  // Max 5 req/sec
    this.lastRequestTime = 0;
  }

  async translate(text, sourceLang, targetLang, retries = 3) {
    // Idempotency lock: Mark as pending trước
    const hashKey = md5(`${text}:${targetLang}`);
    const existing = await LiveTranslationCache.findOne({ hashKey });
    
    if (existing?.status === 'pending_retry') {
      throw new Error('Already translating, please wait...');
    }

    // Add to queue
    return await this.queue.add(async () => {
      // Rate limit: Throttle requests
      await this.throttle();

      // Exponential backoff on 429
      for (let attempt = 0; attempt < retries; attempt++) {
        try {
          const response = await axios.post(this.baseUrl, {
            messages: [...]
          });

          return response.data.result.response;
        } catch (error) {
          if (error.response?.status === 429) {
            const delay = Math.pow(2, attempt) * 1000;  // 2^n seconds
            console.log(`Rate limited, retrying after ${delay}ms...`);
            await sleep(delay);
          } else {
            throw error;
          }
        }
      }
    });
  }

  async throttle() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    const minInterval = 1000 / this.requestsPerSecond;

    if (timeSinceLastRequest < minInterval) {
      await sleep(minInterval - timeSinceLastRequest);
    }

    this.lastRequestTime = Date.now();
  }
}
```

#### translationController.js - Updated endpoints
```javascript
// OLD: Query từ bảng cũ, N+1 queries
exports.getProductTranslations = async (req, res) => {
  const translations = await LiveTranslationCache.find({
    entityId: productId,
    targetLang: lang,
  });
  // ... Mapping logic ...
}

// NEW: Query bảng mới (1 query)
exports.getProductTranslations = async (req, res) => {
  const translation = await ProductCatalogTranslationCache.findOne({
    entityId: productId,
    targetLang: lang,
  });
  
  // Already aggregated: specs is object, features is array
  return {
    name: translation.name,
    description: translation.description,
    specs: translation.specs,        // ✨ 1 query instead of N
    features: translation.features,  // ✨ Already array
  };
}
```

---

### Frontend Implementation

#### LanguageContext.tsx - SWR Pattern
```typescript
// OLD: Xóa cache → layout shift
const setLocale = async (newLocale) => {
  setLocaleState(newLocale);
  setLoadedTranslations({});  // ❌ VỠ GIAO DIỆN!
  // Load new translations ...
}

// NEW: Stale-While-Revalidate
const setLocale = async (newLocale) => {
  // 1. Mark locale as changing (show spinner on button)
  setIsChangingLocale(true);

  // 2. KEEP old translations (Stale data)
  setLocaleState(newLocale);
  
  // 3. Load new translations async
  const newTranslations = await translationService.getStaticTranslations(
    newLocale,
    'common'
  );
  
  // 4. When done, update at once (Flip entire UI)
  setLoadedTranslations(prev => ({
    ...prev,
    [`${newLocale}_common`]: newTranslations
  }));
  
  setIsChangingLocale(false);  // Hide spinner
}
```

#### IndexedDB Storage
```typescript
class TranslationDB {
  async saveTranslation(lang: string, namespace: string, data: Record<string, string>) {
    const db = await this.openDB();
    const tx = db.transaction('translations', 'readwrite');
    const store = tx.objectStore('translations');
    
    await store.put({
      key: `${lang}_${namespace}`,
      data,
      timestamp: Date.now()
    });
  }

  async getTranslation(lang: string, namespace: string) {
    const db = await this.openDB();
    const tx = db.transaction('translations', 'readonly');
    const store = tx.objectStore('translations');
    
    const result = await store.get(`${lang}_${namespace}`);
    return result?.data || null;
  }
}

// Usage in LanguageContext
const loadNamespace = async (ns) => {
  // Try API first
  try {
    const translations = await translationService.getStaticTranslations(locale, ns);
    // Cache to IndexedDB
    await translationDB.saveTranslation(locale, ns, translations);
    return translations;
  } catch (error) {
    // Fallback to IndexedDB
    const cached = await translationDB.getTranslation(locale, ns);
    if (cached) return cached;
    throw error;
  }
}
```

---

## 🚨 ROLLBACK STRATEGY

### Scenario 1: Shadow Writes có lỗi (Phase 1)
```bash
# Disable feature flag
SHADOW_WRITES_ENABLED=false

# Rollback: Không cần làm gì, old logic still works
```

### Scenario 2: Migration data sai (Phase 2)
```bash
# Delete data from new tables
db.ProductCatalogTranslationCache.deleteMany({})
db.UserContentTranslationCache.deleteMany({})

# Re-run migration (hoặc đợi shadow writes phát sinh lại)
```

### Scenario 3: Switch reading có vấn đề (Phase 3)
```bash
# Revert endpoints để query bảng cũ
# Feature flag: USE_NEW_SCHEMA=false

# Frontend: Revert LanguageContext changes
# git revert <commit-hash>
```

### Scenario 4: Cleanup có vấn đề (Phase 4)
```bash
# Restore từ backup
mongorestore --uri "mongodb+srv://..." --archive=livetranslationcache.bak

# Restart service
```

---

## 📊 SUCCESS METRICS

Sau khi hoàn tất, đo lường các metrics:

| Metric | Before | Target | Công cụ đo |
|--------|--------|--------|-----------|
| **DB Query Time** | 500-2000ms | <100ms | MongoDB logs |
| **Product Load Time** | 3-5s | <1s | Lighthouse |
| **Language Switch Time** | 2-3s blinky | <500ms smooth | Frontend profiling |
| **Cache Hit Rate** | ~70% | >95% | Backend logs |
| **Error Rate (429s)** | 5-10% | <1% | Monitoring alerts |
| **Memory Usage** | 2GB+ | <1GB | MongoDB stats |
| **Offline Support** | ❌ None | ✅ Full | Manual testing |

---

## 📝 NOTES & ASSUMPTIONS

1. **Mongo TTL Index:** Tự động chạy background job mỗi 60 giây để xóa expired documents
2. **Feature Flags:** Sử dụng ENV variables để kiểm soát từng giai đoạn (không cần redeploy)
3. **Backward Compatibility:** Không drop cột/field từ schema cũ cho đến Phase 4
4. **Testing:** Luôn test trên staging trước production
5. **Communication:** Notify team trước mỗi phase switch

---

## 🎯 NEXT STEPS

1. **Review document này** với team
2. **Approve Phase 0** (analysis & design)
3. **Assign tasks** cho developers
4. **Setup feature flags** trong CI/CD
5. **Start Phase 1** (Shadow Writes)

---

**Document được tạo:** June 2026
**Phiên bản:** v1.0
**Trạng thái:** ✅ Phase 0 COMPLETE - Ready for Phase 1 Execution

---

## 📚 DOCUMENTATION CREATED

**Phase 0 Deliverables (2,688 lines, ~17,100 words):**

1. ✅ **I18N_ENTERPRISE_PLAN.md** - Master plan with phase tracking
2. ✅ **PHASE_0_ANALYSIS_REPORT.md** - Detailed architecture analysis (665 lines)
3. ✅ **PHASE_0_SCHEMA_DESIGN.md** - Schema specifications (813 lines)
4. ✅ **PHASE_0_SUMMARY.md** - Executive summary (285 lines)
5. ✅ **PHASE_0_COMPLETION_CHECKLIST.md** - Verification checklist (232 lines)
6. ✅ **I18N_DOCUMENTATION_INDEX.md** - Navigation guide (347 lines)

**How to navigate:**
→ Start: `I18N_DOCUMENTATION_INDEX.md` (navigation guide)
→ Quick overview: `PHASE_0_SUMMARY.md` (5 min)
→ Full context: `I18N_ENTERPRISE_PLAN.md` (20 min)
→ Technical details: `PHASE_0_SCHEMA_DESIGN.md` (when coding)
