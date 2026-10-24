# online-store

E-commerce storefront (Laptop Store) với backend Node.js/MongoDB và frontend Next.js, kèm workspace công cụ hỗ trợ dịch sản phẩm đa ngôn ngữ.

## Cấu trúc

- `online-store-backend/` — API, seeds, dịch sản phẩm (Cloudflare AI / assistant batch), backup scripts.
- `online-store-frontend/` — Storefront + trang quản trị dịch (Next.js).
- `translation-workspace/` — công cụ hỗ trợ dịch thủ công: xuất/kiểm tra batch, kiểm trạng thái sau import.
- `md/` — tài liệu vận hành: quy trình backup/restore MongoDB, quy trình retranslate/quality, yêu cầu ảnh sản phẩm, nhật ký sự cố.

## Lưu ý cấu hình

- Không commit `.env` thật. Copy `online-store-backend/.env.example` và điền giá trị riêng.
- Các script đọc cấu hình từ `online-store-backend/.env` (ví dụ `MONGO_URI`).
