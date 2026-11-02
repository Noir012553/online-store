# scripts/ — bộ công cụ lõi

## Cấu trúc thư mục (tổ chức lại 2026-11-02)

| Thư mục / tệp | Nội dung | Số tệp |
| --- | --- | --- |
| `scripts/*.js` (gốc) | Script lõi dùng cho mọi batch: export, build, preflight, import, check — tham số hoá qua `config.js` | ~12 |
| `scripts/archive/fix-passes/` | Script fix dùng-một-lần theo pass (fix-nov06…fix-nov10, reimport-*, reapprove-*) — lưu lại làm tài liệu tham khảo, **không chạy lại** vì data đã ghi vào DB | ~250 |
| `scripts/archive/diag/` | Script chẩn đoán/audit dùng-một-lần (diag-*, check-*, audit-*, verify-*, db-*-state) | ~60 |
| `scripts/tmp/` | Script thí nghiệm/patch tạm (tmp-*, patch-*, inspect-*) — có thể xoá bất kỳ lúc nào | ~40 |
| `scripts/active/batch-pipeline/` | Copy script pipeline chuẩn hoá theo từng batch (tham khảo) | — |

Quy tắc: script mới dùng-một-lần đặt thẳng vào `tmp/`; khi batch xong, chuyển bản muốn giữ vào `archive/` và xoá phần còn lại.

## 15 script lõi + `config.js` + `promo-templates-next.js`. Tất cả dùng cho **mọi batch**,
không hardcode productId hay đường dẫn tuyệt đối — mọi đường dẫn suy từ `__dirname`
qua `scripts/config.js`, có thể ghi đè bằng env.

## Cấu hình trung tâm — `scripts/config.js`

| Biến                    | Ý nghĩa                                                                   | Env ghi đè              |
| ----------------------- | ------------------------------------------------------------------------- | ----------------------- |
| `WS`, `ROOT`, `BACKEND` | Đường dẫn workspace / repo / backend                                      | `BACKEND_DIR`           |
| `MONGO_URI`, `MONGO_DB` | Kết nối DB (đọc từ backend `.env` nếu không set)                          | `MONGO_URI`, `MONGO_DB` |
| `TAG`                   | Hậu tố batch hiện hành (mặc định `next3`) — quy định tên mọi tệp data/log | `TRANSLATION_TAG`       |
| `DATA.*`                | Tên tệp export/import/translations/state/log theo `TAG`                   | —                       |
| `API_BASE`              | Backend API cho import/approve                                            | `BACKEND_URL`           |
| `MAX_PRODUCTS`          | Số sản phẩm mỗi lần export (mặc định 10)                                  | `MAX_PRODUCTS`          |
| `loadJson(p)`           | Đọc JSON bỏ BOM                                                           | —                       |
| `connectMongoose()`     | Kết nối mongoose chuẩn hoá                                                | —                       |

Bắt đầu batch mới: chỉ cần `TRANSLATION_TAG=batch4 npm run export` — mọi tệp
data/log tự đổi tên theo tag, không phải sửa script.

## Luồng chuẩn mỗi batch

| Bước          | Lệnh                | Script                    | Mô tả                                                                                          |
| ------------- | ------------------- | ------------------------- | ---------------------------------------------------------------------------------------------- |
| 1. Xuất batch | `npm run export`    | `export-next-batch.js`    | Đọc DB, chọn sản phẩm chưa ready → `DATA.exportBatch` + `DATA.sourcesTxt`. Env: `MAX_PRODUCTS` |
| 2. Dịch tay   | —                   | —                         | Điền vào `DATA.translationsFile(<lang>)`                                                       |
| 3. Đóng gói   | `npm run build`     | `build-import-next.js`    | Gộp bản dịch + hash → `DATA.importBatch`. Đọc `promo-templates-next.js` để dịch promotions     |
| 4. Preflight  | `npm run preflight` | `preflight-next3-full.js` | Validator thật + mixed-language + alt/promo → phải **0 blocking** trước upload                 |
| 5. Import     | `npm run import`    | `import-resume.js`        | Gọi API import + duyệt chunk-by-chunk có resume (backend :5000)                                |
| 6. Kiểm chứng | `npm run check`     | `check-batch-next.js`     | Đọc lại DB độc lập sau duyệt, ghi UTF-8 vào `logs/`                                            |

## Kiểm tra / chẩn đoán

| Lệnh                     | Script                       | Mô tả                                                       |
| ------------------------ | ---------------------------- | ----------------------------------------------------------- |
| `npm run check:approved` | `check-approved-count.js`    | Tổng quan số sản phẩm đạt duyệt                             |
| `npm run check:coverage` | `check-approval-coverage.js` | % sản phẩm đủ 8 locale đã duyệt                             |
| `npm run gaps`           | `find-gaps.js`               | Tìm sản phẩm còn thiếu / chưa duyệt                         |
| `npm run sweep`          | `validator-sweep.js`         | Quét token missing/unexpected theo batch hiện hành          |
| `npm run token:scan`     | `token-scan.js`              | Quét token kỹ thuật toàn bộ bản dịch                        |
| `npm run token:ctx`      | `token-context.js`           | In ngữ cảnh quanh token (để patch chính xác)                |
| `npm run leak`           | `leak-scan.js`               | Soát mixed-language                                         |
| `npm run lang`           | `wrong-language-scan.js`     | Soát wrong-language                                         |
| `npm run record`         | `inspect-record.js`          | Xem 1 record trong DB (debug)                               |
| `npm run consistency`    | `consistency-check.js`       | Invariants spec/promo/tech toàn workspace — phải = 0 issues |

## Quy ước

- Script lõi phải tham số hoá (env/CLI); script dùng-một-lần **không commit vào đây** — gõ `node -e` rồi bỏ.
- **Không hardcode đường dẫn tuyệt đối** (`E:/...`) hay productId — mọi đường dẫn đi qua `config.js`.
- Fix bản dịch luôn theo vòng: sửa `data/translations/` → `build` → `preflight` (0 blocking) → `consistency` (0 issues).
- Mọi báo cáo dài ghi UTF-8 ra `logs/`, không in tiếng Việt ra console Windows.
- Batch cũ khi bắt đầu batch mới: chuyển `data/export|import|translations` cũ vào `data/archive/` (đã có sẵn cấu trúc này).

## Ghi chú validator (2026-10-28)

- `preflight-next3-full.js` và `validator-sweep.js` dùng validator thật của backend; từ 2026-10-28 validator backend **skip `checkTechnicalTokens` cho `product_description`** (văn xuôi marketing, chỉ yêu cầu token có mặt). Token check vẫn chạy đầy đủ cho `technicalDescription`, `specs`, `name`, `promotions`, `descriptionImages[].alt`.
- Kết quả thực tế batch next3: 67/78 bản dịch description từng fail token check; sau thay đổi các bản này pass preflight mà không cần patch token thủ công (`auto-fix-preflight.js` với mode desc giờ ít cần thiết — vẫn dùng cho alt/name).
