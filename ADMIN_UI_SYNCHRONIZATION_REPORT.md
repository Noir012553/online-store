# 📋 Admin UI vs I18N Enterprise Plan - Synchronization Report

**Ngày:** June 2026  
**Người lập:** Lê Ngọc Mẫn (Admin)  
**Trạng thái:** ⚠️ PARTIAL SYNC - 70% Đồng bộ, 30% Cần Cập nhật

---

## 📊 Tóm Tắt Nhanh

| Yêu cầu từ I18N Plan | Hiện có UI | Trạng thái | Ghi chú |
|---|---|---|---|
| **Layer 1: System Text Management** | ✅ TranslationsAdminTier1 | ✅ Đầy đủ | Edit/Delete/Add keys, Bulk translate |
| **Layer 2: Cache Management** | ✅ TranslationsAdminTier2 | ✅ Đầy đủ | View cache stats, Clear old cache, Search |
| **Layer 3: Audit Log Viewer** | ❌ KHÔNG CÓ | ❌ Missing | Cần tạo mới |
| **Manual Override UI** | ⚠️ Không rõ ràng | ⚠️ Partial | Có endpoint nhưng chưa có UI riêng |
| **Batch Manual Override** | ❌ KHÔNG CÓ | ❌ Missing | Có endpoint nhưng chưa có UI |
| **Production Monitoring Dashboard** | ❌ KHÔNG CÓ | ❌ Missing | Cần tạo |

---

## ✅ ĐÃ ĐỒNG BỘ (70%)

### 1. **TranslationsAdminTier1** ✅ 100% Match
**File:** `online-store-frontend/src/pages/admin/translationsAdminTier1.tsx`

#### Chức năng hiện có:
- ✅ Quản lý **Layer 1: System Text** (common, checkout, products, admin namespaces)
- ✅ Add/Edit/Delete translation keys
- ✅ Bulk translate cho ngôn ngữ non-Vietnamese
- ✅ Search translations
- ✅ Pagination (10 items/page)
- ✅ Message notifications (success/error/info)

#### So sánh với kế hoạch:
```
Kế hoạch yêu cầu:
├── Layer 1: System text CRUD ✅ CÓ
├── Bulk translate static UI ✅ CÓ
├── Namespace selection ✅ CÓ
└── Language selection ✅ CÓ
```

#### Endpoint sử dụng:
- `POST /api/translations` - Update/Add key
- `GET /api/translations?lang=X&ns=Y` - Get translations
- `POST /api/translations/bulk-translate-static` - Bulk translate
- `GET /api/translations/namespaces` - Get list namespaces

**Mức độ Sync:** ✅ **100% - EXCELLENT**

---

### 2. **TranslationsAdminTier2** ✅ 95% Match
**File:** `online-store-frontend/src/pages/admin/translationsAdminTier2.tsx`

#### Chức năng hiện có:
- ✅ Quản lý **Layer 2: Cache** (ProductCatalogTranslationCache, UserContentTranslationCache)
- ✅ View cache statistics (total + by language breakdown)
- ✅ Search cache records (originalText, translatedText, hashKey)
- ✅ View detailed record (expandable rows)
- ✅ Delete individual cache record
- ✅ Clear old cache (TTL-based)
- ✅ Pagination (20 items/page)
- ✅ Refresh button

#### So sánh với kế hoạch:
```
Kế hoạch yêu cầu:
├── Cache stats dashboard ✅ CÓ
├── View cache records ✅ CÓ
├── Delete record ✅ CÓ
├── Clear old cache ✅ CÓ
├── Search by original/translated text ✅ CÓ
└── TTL info (implied) ⚠️ PARTIAL (không show TTL expiry date)
```

#### Endpoint sử dụng:
- `POST /api/translations/admin/cache-stats` - Get stats
- `GET /api/translations/admin/cache-records?lang=X&skip=Y&limit=Z` - Get records
- `DELETE /api/translations/admin/cache/{id}` - Delete record
- `POST /api/translations/admin/clear-cache` - Clear old

#### Thiếu:
- ⚠️ Không hiển thị TTL expiry date cho mỗi record
- ⚠️ Không support multiple languages trong SUPPORTED_LANGUAGES (chỉ 'en')
- ⚠️ Không có "batch delete" option

**Mức độ Sync:** ✅ **95% - VERY GOOD**

---

### 3. **TranslationManagementPage** ✅ 60% Match
**File:** `online-store-frontend/src/components/admin/TranslationManagementPage.tsx`

#### Chức năng hiện có:
- ✅ Cache statistics overview
- ✅ Bulk translate with language/namespace selection
- ✅ Clear cache button
- ✅ Simple summary text về 3 tiers
- ⚠️ Component-based (không page route)

#### So sánh với kế hoạch:
```
Kế hoạch yêu cầu:
├── Cache stats overview ✅ CÓ
├── Bulk translate interface ✅ CÓ
├── Clear cache ✅ CÓ
├── How it works explanation ✅ CÓ (basic)
└── Quick actions ✅ CÓ
```

#### Thiếu:
- ❌ Không có link tới Tier 1 (system text) management
- ❌ Không có link tới Tier 2 (cache) management chi tiết
- ❌ Không có audit log viewer
- ❌ Không có manual override interface

**Mức độ Sync:** ⚠️ **60% - PARTIAL (Hub page chứ không phải full management)**

---

## ❌ CHƯA ĐỒNG BỘ (30%)

### 1. **Audit Log Viewer** ❌ KHÔNG CÓ
**Kế hoạch yêu cầu:** Page admin để xem TranslationAuditLog

#### Backend có sẵn:
- ✅ Model: `TranslationAuditLog.js`
- ✅ Helper methods:
  - `getEntityAuditLogs(entityId, targetLang)`
  - `getUserAuditLogs(userId)`
  - `getAuditStats()`
  - `getAnomalies()` - Phát hiện hoạt động đáng ngờ

#### Frontend cần:
```typescript
// Page: /admin/translationAuditLog.tsx
// Chức năng:
├── View audit log entries (who changed what when)
├── Filter by:
│  ├── User/Admin
│  ├── Action type (manual_override, batch_update, etc.)
│  ├── Entity ID (product/review ID)
│  ├── Date range
│  └── Language
├── Search by:
│  ├── Original text
│  ├── New value
│  └── Reason
├── Show anomalies (threshold: 50 changes in 60 min)
└── Export audit trail (CSV/JSON)
```

#### Endpoint có sẵn:
- ❌ Không tìm thấy endpoint để GET audit logs (chỉ có write)

**Priority:** 🔴 **HIGH** - Enterprise compliance yêu cầu audit trail

---

### 2. **Manual Override UI** ⚠️ KHÔNG RÕ RÀNG
**Kế hoạch yêu cầu:** Interface để admin ghi đè manual translation

#### Backend có sẵn:
- ✅ Endpoint:
  - `POST /api/translations/admin/manual-override` - Single override
  - `POST /api/translations/admin/batch-manual-override` - Batch override
- ✅ Logging: `logAuditTrail()` tự động ghi log khi override

#### Frontend cần:
```typescript
// Component: ManualOverrideDialog hoặc Page
// Chức năng:
├── Modal/Form với:
│  ├── Select: Entity type (product spec, review, etc.)
│  ├── Input: Entity ID
│  ├── Select: Target language
│  ├── TextArea: Original text (read-only)
│  ├── TextArea: Translated text (editable)
│  ├── TextArea: Reason for override (optional)
│  └── Button: Submit
├── Confirmation dialog
└── Audit log automatic (backend handles)
```

#### Hiện tại:
- ❌ Không thấy UI/page riêng cho manual override
- ⚠️ Có thể được implement trong Tier2 editor (mở rộng)

**Priority:** 🟡 **MEDIUM** - Cần để admin fix sai translation nhanh

---

### 3. **Batch Manual Override UI** ❌ KHÔNG CÓ
**Kế hoạch yêu cầu:** Interface bulk update translations manually

#### Backend có sẵn:
- ✅ `POST /api/translations/admin/batch-manual-override`
- ✅ Support CSV upload hoặc JSON

#### Frontend cần:
```typescript
// Component: BatchManualOverrideUpload
// Chức năng:
├── File upload (CSV/JSON):
│  └── Format: [
│      {
│        "entityId": "prod_123",
│        "targetLang": "en",
│        "translatedText": "New translation",
│        "reason": "Fixed typo"
│      }
│    ]
├── Preview uploaded data (table)
├── Validation check
├── Progress bar during submission
├── Result summary (success/failed count)
└── Undo/Rollback option (if failed)
```

**Priority:** 🟡 **MEDIUM** - Useful for bulk corrections

---

### 4. **Production Monitoring Dashboard** ❌ KHÔNG CÓ
**Kế hoạch yêu cầu:** Real-time monitoring của translation health

#### Backend có sẵn:
- ✅ Scripts: `health-check-i18n.js`
- ✅ Models have: `getErrorStats()`, `getFailedTranslations()`

#### Frontend cần:
```typescript
// Page: /admin/translationMonitoring
// Chức năng:
├── Real-time metrics:
│  ├── Error rate by language (should be <1%)
│  ├── Cache hit rate by language (should be >95%)
│  ├── Failed translations count
│  ├── API latency (should be <2s)
│  └── TTL usage (% of cache expired)
├── Charts:
│  ├── Error trend (last 24h)
│  ├── Translation latency graph
│  └── Cache usage pie chart
├── Alerts:
│  ├── Show current alerts
│  ├── Alert history
│  └── Configure thresholds
└── Export report (PDF)
```

#### Endpoint cần:
- ❌ Không tìm thấy endpoint `/api/translations/admin/monitoring` hoặc `/health-check`

**Priority:** 🔴 **HIGH** - Phase 4 yêu cầu monitoring setup

---

## 📈 Bảng So Sánh Chi Tiết

### Tầng Layer 1: System Text
| Chức năng | Kế hoạch | Hiện tại | UI Page | Endpoint | Status |
|---|---|---|---|---|---|
| View/Edit/Delete keys | ✅ Required | ✅ Full | TranslationsAdminTier1 | POST /api/translations | ✅ DONE |
| Bulk translate | ✅ Required | ✅ Full | TranslationsAdminTier1 | POST /api/translations/bulk-translate-static | ✅ DONE |
| Namespace management | ✅ Required | ✅ Full | TranslationsAdminTier1 | GET /api/translations/namespaces | ✅ DONE |
| Search/Filter | ✅ Required | ✅ Full | TranslationsAdminTier1 | (Client-side) | ✅ DONE |

**Tier 1 Sync:** ✅ **100%**

---

### Tầng Layer 2: Cache Management
| Chức năng | Kế hoạch | Hiện tại | UI Page | Endpoint | Status |
|---|---|---|---|---|---|
| Cache stats | ✅ Required | ✅ Full | TranslationsAdminTier2 | POST /api/translations/admin/cache-stats | ✅ DONE |
| View cache records | ✅ Required | ✅ Full | TranslationsAdminTier2 | GET /api/translations/admin/cache-records | ✅ DONE |
| Delete record | ✅ Required | ✅ Full | TranslationsAdminTier2 | DELETE /api/translations/admin/cache/{id} | ✅ DONE |
| Clear old cache | ✅ Required | ✅ Full | TranslationsAdminTier2 | POST /api/translations/admin/clear-cache | ✅ DONE |
| TTL display | ✅ Required | ⚠️ Partial | TranslationsAdminTier2 | (Not fetched) | ⚠️ MISSING |
| Batch delete | ✅ Nice-to-have | ❌ None | TranslationsAdminTier2 | (No endpoint) | ❌ MISSING |

**Tier 2 Sync:** ✅ **95%**

---

### Tầng Layer 3: Monitoring & Audit
| Chức năng | Kế hoạch | Hiện tại | UI Page | Endpoint | Status |
|---|---|---|---|---|---|
| Audit log viewer | ✅ Required | ❌ None | (None) | (No read endpoint) | ❌ MISSING |
| Manual override UI | ✅ Required | ❌ None | (None) | POST /api/translations/admin/manual-override | ❌ MISSING UI |
| Batch override UI | ⚠️ Nice-to-have | ❌ None | (None) | POST /api/translations/admin/batch-manual-override | ❌ MISSING UI |
| Monitoring dashboard | ✅ Required | ❌ None | (None) | (No endpoint) | ❌ MISSING |
| Error tracking | ✅ Required | ⚠️ Backend only | (None) | (Models have methods) | ⚠️ NO UI |

**Tier 3 Sync:** ❌ **0%**

---

## 🎯 Action Items (Ưu tiên)

### 🔴 Priority 1 - CRITICAL (Must have)

#### #1: Tạo Audit Log Viewer Page
```
File: online-store-frontend/src/pages/admin/translationAuditLog.tsx
Thời gian: 2-3 giờ
Chức năng:
  ✓ View audit trail entries
  ✓ Filter by user, action type, entity
  ✓ Detect anomalies (auto-highlight suspicious activity)
  ✓ Export to CSV/JSON
Endpoint cần: GET /api/translations/admin/audit-logs (cần tạo)
```

#### #2: Tạo Production Monitoring Dashboard
```
File: online-store-frontend/src/pages/admin/translationMonitoring.tsx
Thời gian: 3-4 giờ
Chức năng:
  ✓ Real-time error rate
  ✓ Cache hit rate metrics
  ✓ Charts (error trend, latency)
  ✓ Alert management
Endpoint cần: GET /api/translations/admin/monitoring-stats (cần tạo)
```

### 🟡 Priority 2 - MEDIUM (Should have)

#### #3: Thêm Manual Override UI
```
File: online-store-frontend/src/components/admin/ManualOverrideDialog.tsx
Thời gian: 1.5-2 giờ
Chức năng:
  ✓ Modal form để override translation
  ✓ Validation & confirmation
  ✓ Auto-log to audit trail
Endpoint: POST /api/translations/admin/manual-override (đã có)
```

#### #4: Cập nhật Tier2 để support TTL display
```
File: online-store-frontend/src/pages/admin/translationsAdminTier2.tsx
Thời gian: 30 min - 1 giờ
Thay đổi:
  ✓ Fetch + display TTL expiry date
  ✓ Show visual TTL countdown (%)
Endpoint: Modify cache-records response to include TTL
```

### 🟢 Priority 3 - NICE-TO-HAVE

#### #5: Batch Manual Override UI
```
File: online-store-frontend/src/components/admin/BatchOverrideUpload.tsx
Thời gian: 2-3 giờ
Chức năng:
  ✓ CSV/JSON upload
  ✓ Preview + validate
  ✓ Batch submit
Endpoint: POST /api/translations/admin/batch-manual-override (đã có)
```

#### #6: Add more languages support
```
File: online-store-frontend/src/pages/admin/translationsAdminTier2.tsx
Thời gian: 30 min
Thay đổi:
  ✓ Update SUPPORTED_LANGUAGES array (hiện chỉ có 'en')
```

---

## 📝 Kiến Nghị & Kết Luận

### ✅ Điểm Tốt:
1. **Tier 1 & 2 UI hoàn chỉnh** - Người dùng có thể quản lý system text và cache
2. **Backend đã sẵn sàng** - Tất cả endpoint & logic phía backend đã implement
3. **Cấu trúc clean** - 3 page riêng biệt, dễ mở rộng

### ⚠️ Điểm Cần Cải Thiện:
1. **Tier 3 hoàn toàn thiếu** - Audit log, monitoring không có UI
2. **Monitoring endpoints thiếu** - Backend có model nhưng không có API endpoint
3. **TTL visualization** - Tier2 không hiển thị TTL expiry

### 🎯 Khuyến Nghị:
```
Tuần 1 (Priority 1 - Critical):
  □ #1: Tạo Audit Log Viewer (2-3h)
  □ #2: Tạo Monitoring Dashboard (3-4h)
  + #3: Manual Override UI (1.5-2h)

Tuần 2 (Priority 2 - Should have):
  □ #4: TTL display trong Tier2 (30m-1h)
  □ #5: Batch Override upload (2-3h)
  □ #6: Support thêm languages (30m)

Tổng cộng: ~14-16 giờ để đạt 100% đồng bộ
```

---

## 📎 File References

### Frontend Admin Pages:
- `online-store-frontend/src/pages/admin/translationsAdminTier1.tsx` (890 lines) ✅
- `online-store-frontend/src/pages/admin/translationsAdminTier2.tsx` (640 lines) ✅
- `online-store-frontend/src/components/admin/TranslationManagementPage.tsx` (320 lines) ⚠️
- `online-store-frontend/src/pages/admin/translationsManagement.tsx` (?)
- `online-store-frontend/src/pages/admin/productsTranslationsAdmin.tsx` (?)
- `online-store-frontend/src/pages/admin/languagesConfig.tsx` (?)

### Backend Models & Services:
- `online-store-backend/src/models/TranslationAuditLog.js` ✅
- `online-store-backend/src/models/ProductCatalogTranslationCache.js` ✅
- `online-store-backend/src/models/UserContentTranslationCache.js` ✅
- `online-store-backend/src/controllers/translationController.js` ✅
- `online-store-backend/src/services/translationShadowWriteService.js` ✅
- `online-store-backend/src/scripts/health-check-i18n.js` ✅

### Backend Routes:
- `online-store-backend/src/routes/translationRoutes.js` ✅

---

**Báo cáo lập:** June 2026  
**Người lập báo cáo:** Automation Tool  
**Phê duyệt bởi:** Lê Ngọc Mẫn (Admin)

---

## 🔔 Next Steps

1. **Đọc báo cáo này** → Hiểu rõ tình hình hiện tại
2. **Chọn Priority** → Chọn những gì cần làm trước
3. **Tạo backend endpoints** → Nếu cần (monitoring stats, audit logs read)
4. **Tạo/Update UI pages** → Theo danh sách Action Items
5. **Test tất cả flows** → Đảm bảo hoạt động đúng
6. **Update documentation** → Cập nhật I18N_ENTERPRISE_PLAN.md

