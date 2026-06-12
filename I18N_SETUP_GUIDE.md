# 🌍 i18n 3-Phase Production Setup Guide

## Nhanh Chóng Bắt Đầu (Quick Start)

### 1️⃣ Khởi Tạo MongoDB Indexes

```bash
cd online-store-backend
npm run setup-i18n-indexes
```

**Output**:
```
✅ All indexes created successfully!
📊 Index Summary:
  StaticTranslation:       3 indexes
  LiveTranslationCache:    4 indexes (including TTL)
  Language:                2 indexes
  Total:                   9 indexes
```

---

### 2️⃣ Tạo Ngôn Ngữ Mới

Admin tạo ngôn ngữ mới bằng API hoặc Admin Dashboard:

```bash
curl -X POST http://localhost:3000/api/languages \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "pt",
    "name": "Português"
  }'
```

**Backend xử lý tự động**:
- T=0s: Trả HTTP 201 cho Admin ngay lập tức
- T+1s: Clone UI strings từ English (300ms)
- T+1-30s: Dịch 450 UI keys (CONCURRENCY=5, THROTTLE=1000ms)
- T+30-120s: Dịch sản phẩm (CONCURRENCY=8, THROTTLE=500ms)
- T+120s+: Finalize & mark isReady=true

---

### 3️⃣ Monitor Tiến Độ

```bash
# Kiểm tra status
curl -X GET http://localhost:3000/api/languages/pt/setup-status \
  -H "Authorization: Bearer <admin_token>"
```

**Response** (khi đang setting up):
```json
{
  "success": true,
  "data": {
    "code": "pt",
    "name": "Português",
    "isReady": false,
    "status": "SETTING_UP",
    "setupStartedAt": "2026-06-12T10:00:00Z",
    "setupDurationSeconds": 45
  }
}
```

---

### 4️⃣ Xem Lỗi & Sửa Tay

Nếu có lỗi 429 Rate Limit:

```bash
# Xem danh sách lỗi
curl -X GET http://localhost:3000/api/languages/pt/failed-translations \
  -H "Authorization: Bearer <admin_token>"

# Admin sửa tay 1 dịch
curl -X POST http://localhost:3000/api/translations/admin/manual-override \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "hashKey": "8b64e132ef2e55490ff456e36d40f807",
    "translatedText": "Notebook Dell XPS 13"
  }'

# Retry tất cả lỗi (trigger background job)
curl -X POST http://localhost:3000/api/languages/pt/retry-failed \
  -H "Authorization: Bearer <admin_token>"
```

---

## 📊 API Endpoint Reference

### Languages Management

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/api/languages` | GET | Lấy tất cả ngôn ngữ | Public |
| `/api/languages/supported` | GET | Lấy danh sách supported langs | Public |
| `/api/languages` | POST | Tạo ngôn ngữ mới (3-phase) | Admin |
| `/api/languages/:id` | PUT | Update ngôn ngữ | Admin |
| `/api/languages/:id` | DELETE | Xóa ngôn ngữ | Admin |
| `/api/languages/:code/setup-status` | GET | Kiểm tra tiến độ setup | Admin |
| `/api/languages/:code/translation-progress` | GET | Xem thống kê lỗi | Admin |
| `/api/languages/:code/failed-translations` | GET | Danh sách dịch lỗi | Admin |
| `/api/languages/:code/retry-failed` | POST | Trigger retry (PHASE 2 lại) | Admin |

### Translations Management

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/api/translations` | GET | Lấy static translations | Public |
| `/api/translations/translate` | POST | Dịch text (on-demand) | Public |
| `/api/translations/admin/manual-override` | POST | Sửa 1 dịch | Admin |
| `/api/translations/admin/batch-manual-override` | POST | Sửa nhiều dịch | Admin |

---

## 🔍 Monitoring & Troubleshooting

### Kiểm Tra Database

```javascript
// Check StaticTranslation
db.statictranslations.find({ code: 'pt' }).count()
// Output: 53 (number of namespaces)

db.statictranslations.find({ 
  code: 'pt',
  'translations': { $exists: true }
}).forEach(doc => {
  console.log(`${doc.namespace}: ${Object.keys(doc.translations).length} keys`);
});

// Check LiveTranslationCache
db.livetranslationcaches.find({ targetLang: 'pt', status: { $ne: 'success' } }).count()
// Output: number of failed translations

// Check indexes
db.statictranslations.getIndexes()
db.livetranslationcaches.getIndexes()
db.languages.getIndexes()
```

### Xem Logs

```bash
# Backend logs
npm run dev
# Look for: [Language] 🚀, [Language] ⏱️, [ProductSeeder], etc.

# Check specific phase
# T=0: [Language] 🚀 T=0: Language record created
# T+1: [Language] 📍 PHASE 1: Clone UI strings
# T+30: [Language] 📍 PHASE 2: Dịch sản phẩm
# T+120: [Language] 📍 PHASE 3: Hoàn tất
```

### Common Issues

#### ❌ "429 Too Many Requests"
- **Layer 1** (UI): Giảm CONCURRENCY từ 5 xuống 3, tăng THROTTLE từ 1000ms lên 2000ms
- **Layer 2** (Products): Ghi nhận error, Admin click retry sau đó

**Fix** (edit `translationSeederService.js`):
```javascript
const CONCURRENCY_LIMIT = 3;  // ↓ from 5
const THROTTLE_MS = 2000;     // ↑ from 1000
```

#### ❌ "Cloudflare API timeout"
- Increase timeout in `cloudflareAiService.js`:
```javascript
const response = await axios.post(baseUrl, {...}, {
  timeout: 120000  // ↑ from 60000
});
```

#### ❌ "Memory running out"
- Reduce CHUNK_SIZE in `productTranslationSeederService.js`:
```javascript
const CHUNK_SIZE = 5;  // ↓ from 10
```

#### ❌ "TTL Index not deleting old records"
- MongoDB TTL indexes run every 60 seconds
- Manual cleanup:
```javascript
const thirtyDaysAgo = new Date(Date.now() - 30*24*60*60*1000);
db.livetranslationcaches.deleteMany({ createdAt: { $lt: thirtyDaysAgo } })
```

---

## 🎯 Admin Dashboard Usage

### Access Points

```
Frontend:
  /admin/languagesConfig           → Language management
  /admin/translationDashboard      → Monitor progress & errors
  /admin/productsTranslationsAdmin → Edit product translations
```

### Dashboard Features

1. **Language List**:
   - Show all languages with ready status
   - Create new language button
   - Edit/Delete options

2. **Setup Status Monitor**:
   - Progress bar for each phase
   - Real-time logs
   - Time estimate

3. **Error Dashboard**:
   - Failed translations count by type
   - Retry button
   - Filter by entity type

4. **Manual Edit**:
   - Search failed translations
   - Inline edit modal
   - Batch edit support
   - Save changes

---

## 📈 Performance Metrics

### Expected Timelines

| Phase | Duration | Operations | Status |
|-------|----------|-----------|--------|
| **T=0** | < 100ms | Create Language record | HTTP 201 returned |
| **PHASE 1** | 1-30s | Clone + translate 450 UI keys | Layer 1 ready |
| **PHASE 2** | 30-90s | Translate ~120 products | Layer 2 processed |
| **PHASE 3** | ~10s | Finalize & activate | isReady = true |
| **Total** | ~2 minutes | Full setup | Language available |

### Database Performance

| Query | Index | Expected Time |
|-------|-------|----------------|
| Fetch UI translations | code+namespace | < 50ms |
| Find product translations | entityId+targetLang+entityType | < 50ms |
| List failed translations | status+targetLang | < 100ms |
| Check language ready | isReady | < 50ms |

### API Response Times

| Endpoint | Typical Time |
|----------|--------------|
| POST /api/languages | < 100ms |
| GET /languages/:code/setup-status | < 50ms |
| GET /languages/:code/translation-progress | < 100ms |
| GET /languages/:code/failed-translations | < 500ms (100+ records) |
| POST /translations/admin/manual-override | < 50ms |

---

## 🔐 Security Considerations

### Authentication

All admin endpoints require JWT token:
```bash
Authorization: Bearer <jwt_token>
```

Only users with `admin` role can:
- Create/delete languages
- Trigger retries
- Edit translations manually

### Rate Limiting

- UI translations (PHASE 1): 1 request / 200ms
- Product translations (PHASE 2): 1 request / 62.5ms
- Manual overrides: No limit (per-Admin)

### Data Validation

- Input: `code` must match pattern `[a-z]{2}`, `name` required
- Output: All responses validated via Zod schemas
- Error messages: Non-sensitive info only

---

## 🚀 Production Deployment

### Pre-Deployment

1. **Setup indexes**:
   ```bash
   npm run setup-i18n-indexes
   ```

2. **Verify Cloudflare credentials**:
   ```bash
   echo $CLOUDFLARE_ACCOUNT_ID
   echo $CLOUDFLARE_API_TOKEN
   echo $CLOUDFLARE_AI_MODEL
   ```

3. **Test setup with 1 language**:
   ```bash
   POST /api/languages { "code": "de", "name": "Deutsch" }
   # Monitor for 2 minutes
   GET /api/languages/de/setup-status
   ```

### Production Checklist

- [ ] MongoDB indexes created
- [ ] Cloudflare AI credentials configured
- [ ] Email notifications setup (optional)
- [ ] Monitoring/alerting setup
- [ ] Backup strategy for translations
- [ ] Admin training on dashboard
- [ ] Documentation updated
- [ ] Rollback plan prepared

### Monitoring in Production

**Key Metrics to Track**:
- Language setup duration (target: < 2 minutes)
- 429 error rate (target: < 2% of all translations)
- Manual override frequency (indicator of AI quality)
- TTL cleanup effectiveness
- Database size growth

**Alerting**:
- Setup duration > 5 minutes → investigate
- 429 errors > 10% → adjust concurrency
- Memory usage > 800MB → reduce chunk size
- Failed translations > 100 → notify Admin

---

## 📚 References

- Full Implementation Blueprint: [IMPLEMENTATION_BLUEPRINT.md](./IMPLEMENTATION_BLUEPRINT.md)
- Database Schema: `online-store-backend/src/models/`
- Services: `online-store-backend/src/services/`
- Controllers: `online-store-backend/src/controllers/languageController.js`
- Routes: `online-store-backend/src/routes/languageRoutes.js`

---

## 💬 FAQ

**Q: Nếu Admin tạo ngôn ngữ, điều gì xảy ra nếu setup bị interrupt?**
A: Language record được tạo với `isReady: false`. Admin có thể trigger retry thủ công qua dashboard.

**Q: Có thể custom CONCURRENCY/THROTTLE không?**
A: Có! Edit environment variables hoặc hằng số trong services. Layer 1 bắt buộc phải conservative.

**Q: Frontend sẽ cố gắng fetch từ ngôn ngữ chưa ready không?**
A: Frontend nên check `language.isReady === true` trước khi sử dụng. Fallback vẫn work (hiển thị English).

**Q: TTL Index xóa đúng lúc không?**
A: MongoDB chạy TTL cleanup mỗi 60 giây. Có delay 1-2 phút là bình thường.

**Q: Có cache bên Frontend không?**
A: Có! Frontend có thể cache translations qua localStorage với TTL 5 phút.

---

**Mô tả: Bản hướng dẫn chi tiết để setup, monitor, troubleshoot hệ thống i18n 3-Phase Production 🚀**
