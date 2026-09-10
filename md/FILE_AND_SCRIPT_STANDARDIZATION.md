# Chuẩn hoá tên file và script backend

## Phạm vi

Các thay đổi áp dụng cho `online-store-backend/scripts`, `online-store-backend/src/scripts`, `online-store-backend/src/test` và các entrypoint liên quan trong `package.json`.

## Quy ước tên mới

- Script dùng `kebab-case`, mô tả theo chức năng.
- Test dùng `kebab-case` và hậu tố `.test.js`.
- Không đưa số phase, số issue hoặc tên tạm thời vào tên file.
- Các số cần thiết vẫn được giữ trong nội dung test, test suite hoặc tham số lệnh.

## Các test đã chuẩn hoá

| Tên cũ | Tên mới |
| --- | --- |
| `check-brands.test.js` | `brands.test.js` |
| `check-db-brands.test.js` | `db-brands.test.js` |
| `check-db-state.test.js` | `db-state.test.js` |
| `check-products.test.js` | `products.test.js` |
| `appReadiness.test.js` | `app-readiness.test.js` |
| `backend-endpoints-phase3.test.js` | `backend-endpoints.test.js` |
| `blueprint-3phase.test.js` | `language-setup-blueprint.test.js` |
| `phase4-e2e-simplified.test.js` | `translation-migration-smoke.test.js` |
| `phase4-e2e.test.js` | `translation-integration.test.js` |
| `cloudinaryService.test.js` | `cloudinary-service.test.js` |
| `currencyFormatter.test.js` | `currency-formatter.test.js` |
| `exportJobService.test.js` | `export-job-service.test.js` |
| `ghnService.test.js` | `ghn-service.test.js` |
| `importFileValidator.test.js` | `import-file-validator.test.js` |
| `plainTextSanitizer.test.js` | `plain-text-sanitizer.test.js` |
| `specKeyTranslationCache.test.js` | `spec-key-translation-cache.test.js` |
| `translationHelper.test.js` | `translation-helper.test.js` |
| `translationProductCache.test.js` | `translation-product-cache.test.js` |
| `testConfig.js` | `test-config.js` |
| `testRegistry.js` | `test-registry.js` |

Các import, test registry và danh sách kiểm tra ký hiệu đã được cập nhật theo tên mới.

## Các script đã chuẩn hoá

Các script camelCase trong `src/scripts` đã chuyển sang `kebab-case`, gồm nhóm seed, migration, translation, category và upload. `package.json`, tài liệu và `check-cli-symbols.js` đã được cập nhật theo đường dẫn mới.

## Chuyển file sang JavaScript

Các entrypoint không phải JavaScript trong phạm vi scripts/test đã được thay thế:

- `test-export-production.ps1` → `src/test/export-production.test.js`
- `test-import-export.ps1` → `src/test/import-export.test.js`
- `test-ghn-ward.ps1` → `scripts/test-ghn-ward.js`
- `deploy-seed.sh` → `src/scripts/deploy-seed.js`
- `tunnel.bat` → `scripts/tunnel.js`

Hai test Python sau được đưa vào `src/test` dưới dạng wrapper Node.js và bản Python cũ đã xoá:

- `python/test_export_production.py` → `src/test/export-production.test.js`
- `python/test_import_export.py` → `src/test/import-export.test.js`

Các scraper Python khác trong `python` vẫn giữ nguyên vì chúng là nhóm công cụ Python riêng, không thuộc thư mục scripts/test.

## Cloudflare Tunnel

Lệnh tunnel trong `package.json` hiện dùng:

```bash
npm run tunnel
```

`scripts/tunnel.js` đã hỗ trợ:

- Windows: dùng `cloudflared.exe` và `.cloudflared/config.windows.yml`.
- Linux/macOS: dùng lệnh `cloudflared` trong `PATH` và `.cloudflared/config.yaml`.
- Giữ nguyên protocol tự động, hai HA connections và ingress frontend/backend.

`config.windows.yml` vẫn cần trỏ tới credential file Cloudflare đúng với tài khoản Windows đang chạy.

## Scraper đã xoá

Đã xoá scraper lỗi:

```text
online-store-backend/python/iKBC_Durgod_Keyboard_Scraper.py
```

Đồng thời xoá script `scrape:ikbc-keyboard` khỏi `online-store-backend/python/package.json`.

## Kiểm tra đã thực hiện

- Kiểm tra syntax các script/test JavaScript đã đổi tên và các file test vừa cập nhật.
- Kiểm tra cấu trúc script trong `package.json`.
- Đã sửa `check-ui-emoji.js` để import `fs` và chỉ quét các thư mục frontend hiện có.
- `npm run check:emoji` chưa chạy runtime thành công trong workspace hiện tại vì thiếu dependency `typescript`; không ghi nhận là PASS.
- Chạy `--help` cho các wrapper export/import thành công theo bằng chứng lịch sử.
- Xác nhận không còn đường dẫn cũ đến các file đã xoá/đổi tên.
- Không chạy `npm run build` theo quy ước dự án.
