# translation-workspace

Workspace hỗ trợ dịch thủ công qua **assistant batch** cho Laptop Store (GearVN clone). Luồng quy trình nằm ở `md/MANUAL_TRANSLATION_ASSISTANT_BATCH_RUNBOOK.md`.

## Cấu trúc

```
translation-workspace/
├── scripts/           ← bộ công cụ lõi (15 script + config.js, dùng cho mọi batch)
├── data/
│   ├── export/        ← JSON batch hiện hành (sourceHash + source)
│   ├── import/        ← JSON batch đã điền bản dịch (sẵn sàng upload)
│   ├── translations/  ← bản dịch per-language per-product (batch hiện hành)
│   └── archive/       ← batch cũ + download canary/sources (đã .gitignore)
├── logs/              ← báo cáo UTF-8 của batch hiện hành (archive-* là batch cũ)
└── package.json       ← lệnh npm chuẩn
```

## Quy trình chuẩn (mỗi batch ~10 sản phẩm)

```powershell
Set-Location translation-workspace

# 1. Xuất batch (lấy 10 sản phẩm kế tiếp chưa ready)
$env:MAX_PRODUCTS = "10"
npm run export

# 2. Dịch ngoài pipeline (từ data/sources-for-translation-next.txt)
#    → điền vào data/translations/translations-next3-{lang}.json

# 3. Đóng gói bản dịch vào import JSON
npm run build

# 4. Kiểm tra trước upload (validator thật + mixed-language + alts + promos)
npm run preflight
#    → 0 blocking = OK; có lỗi thì fix rồi chạy lại

# 5. Import thật + duyệt qua API (backend đang chạy trên :5000)
npm run import

# 6. Kiểm chứng sau duyệt (đọc lại DB độc lập)
npm run check
npm run check:approved
```

## Lệnh npm chuẩn

| Lệnh                            | Mục đích                                                           |
| ------------------------------- | ------------------------------------------------------------------ |
| `npm run export`                | Xuất batch + source text (chỉ đọc DB)                              |
| `npm run build`                 | Đóng gói bản dịch → `data/import/assistant-batch-import-next.json` |
| `npm run preflight`             | Quét validator thật trước upload (bắt buộc phải 0 lỗi blocking)    |
| `npm run sweep`                 | Quét token chỉ batch 5 (c5f3-fb)                                   |
| `npm run import`                | Import + duyệt chunk-by-chunk với resume (backend :5000)           |
| `npm run check`                 | Kiểm chứng sau duyệt (sweep DB độc lập)                            |
| `npm run check:approved`        | Tổng quan: bao nhiêu sản phẩm đạt duyệt                            |
| `npm run check:coverage`        | Bao nhiêu % sản phẩm đủ 8 locale đã duyệt                        |
| `npm run gaps`                  | Tìm sản phẩm còn thiếu / chưa duyệt                                |
| `npm run leak` / `npm run lang` | Soát mixed-language / wrong-language                               |
| `npm run token:scan`            | Quét token kỹ thuật missing/unexpected toàn batch                  |
| `npm run token:ctx`             | Hiển thị ngữ cảnh quanh token để patch chính xác                   |
| `npm run record`                | Xem 1 record cụ thể trong DB (debug)                               |
| `npm run consistency`           | Check spec/promo/tech-invariants toàn workspace (phải = 0 issues)   |

## Quy ước script mới (cơ chế tái sử dụng)

1. Script lõi đặt ở `scripts/`, tham số hoá qua env/CLI (ví dụ `MAX_PRODUCTS=10`),
   **không hardcode productId/lang cụ thể** — chỉ dùng cho 1 batch rồi bỏ.
2. Mọi fix bản dịch phải:
   - sửa file trong `data/translations/`,
   - chạy lại `npm run build` → `npm run preflight` → 0 lỗi blocking,
   - chạy `npm run consistency` (phải = 0 issues).
3. Không tạo script `fix-*-final3.js`, `debug-roundN.js` kiểu dùng-một-lần nữa;
   nếu cần thao tác một lần, gõ thẳng `node -e "..."` hoặc dùng script chung rồi xoá.
4. Chi tiết từng script lõi: xem `scripts/README.md`.

## Lưu ý quan trọng

- **Import ≠ duyệt**: Import chỉ đưa bản dịch vào `pending`; duyệt là thao tác riêng qua API `assistant-approve-batch`.
- **Validator là gác cổng**: chỉ lỗi `inconsistent` được override (kèm note ≥10 ký tự), mọi lỗi khác đều chặn.
- **Không bulk-approve**: không sửa `qualityStatus` trực tiếp trong DB.
- **Không secret**: không nhét credential vào JSON/log.
- **UTF-8**: luôn ghi báo cáo ra file `logs/*.txt` bằng `fs.writeFileSync(..., "utf8")` để tránh lỗi font tiếng Việt trong console Windows.
- **Backend :5000**: phải chạy backend trước khi import qua API.
- **Hash đúng trước**: hash sai là nguyên nhân hàng đầu của import fail / `source_content_changed`.

## Thay đổi validator (2026-10-28)

- Backend validator **không còn check `missing_technical_token` / `unexpected_technical_token` cho `description`** (`entityType: product_description`): description là văn xuôi marketing, chỉ yêu cầu token "có mặt", không đếm đủ/bịa thêm. Trước thay đổi, 67/78 bản dịch description trong batch next3 fail token check và sinh retry Cloudflare không cần thiết.
- Các field còn lại — `name`, `brand`, `technicalDescription`, `specs`, `descriptionImages[].alt`, `promotions` — **vẫn** được check token kỹ thuật đầy đủ. Các check khác của description (brand, length, markup, truncated, mixed_language, wrong_language...) giữ nguyên.
- Preflight (`npm run preflight`) dùng validator thật của backend nên tự hưởng lợi: không còn blocking lỗi token ở description.
