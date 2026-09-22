# Chuẩn lưu trữ và phân phối ảnh

## Mục tiêu

Ảnh public của hệ thống được lưu trên Cloudflare R2 và frontend tải trực tiếp từ `publicUrl`. Backend chỉ quản lý quyền upload, xác thực asset reference và trả metadata qua API.

Không lưu binary vào MongoDB và không dùng backend làm proxy cho ảnh public.

## Phân loại asset

| Nhóm | Prefix R2 | Metadata chính | Nguồn URL ở frontend |
| --- | --- | --- | --- |
| Product main/gallery/description | `products/` | `Product.imageAsset`, `Product.imageAssets` | Product API |
| Banner | `banners/` hoặc asset đã upload trong `incoming/banners/` | `Banner.imageAsset` | Banner API |
| Brand logo | `brands/` | `Brand.logoAsset` và `Brand.logo` | Brand API |
| About/team/reviewer | `about/` | `AboutMedia.asset` hoặc avatar asset | About/review API |
| Upload chờ gắn vào entity | `incoming/` | Client giữ asset reference | Commit API |
| Asset legacy | `legacy/` | URL cũ hoặc metadata migration | Chỉ dùng trong thời gian chuyển đổi |

Logo website, favicon và icon giao diện có thể giữ trong frontend `public/` nếu không cần quản trị động. Các file cố định đó không thuộc asset entity trong database.

## Asset reference chuẩn

Mỗi asset R2 được gắn với entity bằng metadata tương tự:

```json
{
  "sourceUrl": "brand:Acer",
  "storageProvider": "r2",
  "storageAccount": "1",
  "bucket": "store-assets",
  "storageKey": "brands/<sha256>.png",
  "publicUrl": "https://cdn.example.com/brands/<sha256>.png",
  "publicId": "brands/<sha256>.png",
  "contentHash": "<sha256>",
  "mimeType": "image/png",
  "bytes": 12345
}
```

`publicUrl` được dùng để hiển thị. `storageKey`, `storageAccount`, `bucket` và `contentHash` được dùng để xác thực, deduplicate và cleanup. Không lưu đường dẫn máy local vào `sourceUrl`.

## Brand logo

Đặt logo nguồn theo tên brand tại:

```text
online-store-frontend/public/assets/brands/
```

Ví dụ:

```text
Acer.png
DareU.png
FLEsports.png
Gigabyte.png
HP.png
HyperX.png
MSI.png
```

Để migrate logo vào R2:

```bash
npm run migrate:brand-logos
```

Chạy kiểm tra trước, không ghi database:

```bash
DRY_RUN=true npm run migrate:brand-logos
```

Script đọc thư mục mặc định `online-store-frontend/public/assets/brands`. Có thể dùng thư mục khác bằng `BRAND_LOGO_DIR`. Script yêu cầu `MONGO_URI`, R2 account đầy đủ, `R2_UPLOAD_ENABLED=true`, giới hạn upload và public base URL.

Brand đã có `logoAsset` sẽ được bỏ qua, trừ khi đặt:

```bash
FORCE_BRAND_LOGO_MIGRATION=true npm run migrate:brand-logos
```

Sau khi migrate, API trả cả `logo` (public URL tương thích) và `logoAsset` (metadata chuẩn). Frontend ưu tiên `logoAsset.publicUrl` rồi fallback về `logo`.

## Upload flow

1. Frontend gửi file tới `POST /api/assets/upload` với folder phù hợp.
2. Backend kiểm tra quyền, MIME, magic bytes, kích thước và quota.
3. R2 trả asset reference đã có `publicUrl`.
4. Frontend gửi asset reference cùng request tạo/cập nhật entity.
5. Backend gọi `validateR2AssetReference` trước khi lưu MongoDB.
6. Frontend dùng URL từ API để tải ảnh trực tiếp từ R2.

Folder `brands` chỉ dành cho admin/super-admin. Asset private không được trả public URL; trường hợp đó phải dùng signed URL do backend cấp.

## Tương thích dữ liệu cũ

URL absolute cũ vẫn được frontend hiển thị trong giai đoạn migration. Không tạo thêm URL ngoài R2 cho dữ liệu mới khi đã có thể upload R2. Khi migrate từng nhóm asset:

- xác định entity đang tham chiếu;
- upload và kiểm tra content hash;
- lưu asset reference vào database;
- xác minh `publicUrl` trả HTTP thành công;
- chỉ cleanup object cũ sau khi reference mới đã được lưu thành công.

## Quy tắc frontend

- Dùng `getImageUrl()` để chuẩn hóa chuỗi URL hoặc asset reference.
- Dùng `ImageWithFallback` cho ảnh động từ API.
- Không nối thủ công URL R2 ở component.
- Không đưa secret R2 vào frontend.
- `next.config.ts` phải nhận public R2 domain tại thời điểm build nếu component dùng `next/image` với kích thước cố định.

## Quy tắc bảo mật và vận hành

- Không nhận `storageKey` tùy ý mà không gọi `validateR2AssetReference`.
- Không cho client chỉ định R2 account hoặc bucket.
- Không ghi source path local vào database.
- Không xóa asset cũ trước khi entity mới lưu thành công.
- Dùng `DRY_RUN=true` trước các migration.
- Theo dõi quota R2 và giữ prefix entity riêng để dễ inventory/cleanup.
