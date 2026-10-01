# Hướng dẫn dịch bằng Cloudflare AI

## Mục tiêu

Cloudflare AI là provider duy nhất của các luồng dịch trong backend. Khi Cloudflare bị rate limit hoặc hết quota, tác vụ được ghi nhận là chưa hoàn tất để retry sau; backend không tự chuyển sang provider khác.

## Luồng dịch

```text
Nội dung nguồn
      |
      v
Cloudflare AI: retry / thử cấu hình khả dụng
      |
      +--> bản dịch --> validator --> translation cache
      |
      +--> rate limit/quota --> ghi nhận lỗi, giữ tác vụ chưa hoàn tất
```

Các luồng sản phẩm, banner, giao diện động/static, admin, checkout, order, newsletter và namespace hệ thống dùng Cloudflare.

## Cấu hình backend

Đặt trong `online-store-backend/.env`:

```env
CLOUDFLARE_AI_ENABLED=true
CLOUDFLARE_AI_MAX_REQUESTS_PER_DAY=...
CLOUDFLARE_AI_MAX_INPUT_CHARS_PER_DAY=...
CLOUDFLARE_AI_MAX_TOKENS=2048
CLOUDFLARE_AI_INPUT_CHUNK_SIZE=1800
```

- `CLOUDFLARE_AI_MAX_TOKENS`: số token tối đa cho mỗi phản hồi; mặc định `2048`.
- `CLOUDFLARE_AI_INPUT_CHUNK_SIZE`: giới hạn chia đoạn đầu vào; mặc định `1800` ký tự.

Không đặt secret thật trong `.env.example` hoặc Git.

## Rollout concurrency

Seeder sản phẩm đọc các biến `PRODUCT_TRANSLATION_CHUNK_SIZE`, `PRODUCT_TRANSLATION_CONCURRENCY` và `PRODUCT_TRANSLATION_DELAY_MS`. Cấu hình mẫu hiện tại dùng rollout bảo thủ:

```env
PRODUCT_TRANSLATION_CHUNK_SIZE=20
PRODUCT_TRANSLATION_CONCURRENCY=2
PRODUCT_TRANSLATION_LANGUAGE_CONCURRENCY=2
PRODUCT_TRANSLATION_DELAY_MS=300
PRODUCT_TRANSLATION_MEMORY_CACHE_SIZE=5000
PRODUCT_TRANSLATION_LOCK_TTL_SECONDS=120
```

`PRODUCT_TRANSLATION_DELAY_MS` chỉ được dùng sau chunk có rate limit; chunk thành công không sleep cố định. `PRODUCT_TRANSLATION_LANGUAGE_CONCURRENCY` giới hạn số ngôn ngữ chạy cùng lúc; bắt đầu ở `1`, chỉ tăng sau khi đo quota Cloudflare tổng. `PRODUCT_TRANSLATION_MEMORY_CACHE_SIZE` giới hạn số bản dịch giữ trong memory; key gồm nội dung, loại field và cặp ngôn ngữ. Tăng concurrency từng nấc và theo dõi 429, p95, CPU/RAM; không chạy nhiều ngôn ngữ đồng thời khi chưa xác định quota tổng.

## Lỗi ảnh mô tả nguồn trả HTTP 404

Một số `descriptionImages[].url` có thể tồn tại trong JSON nhưng CDN nguồn vẫn trả `404 Not Found` khi pipeline tải thật. Chuỗi JSON có dạng `https:\/\/...` là hợp lệ; sau khi parse sẽ trở thành URL `https://...`.

Pipeline chỉ bỏ qua ảnh mô tả bị lỗi và tiếp tục lưu sản phẩm nếu ảnh chính tải được. Ảnh bị 404 không thể upload lên R2 cho đến khi URL nguồn được thay bằng URL còn hoạt động.

Kiểm tra đúng URL từ máy Windows bằng PowerShell, không tạo file:

```powershell
$url = "https://cdn.hstatic.net/files/200000722513/file/laptop_gaming_acer_aspire_7_a715-59-g-59rd_37.png"

$response = Invoke-WebRequest `
  -Uri $url `
  -Method Get `
  -Headers @{
    Accept = "image/avif,image/webp,image/apng,image/*,*/*;q=0.8"
    "User-Agent" = "LaptopStoreR2AssetService/1.0"
  } `
  -MaximumRedirection 5

$response.StatusCode
$response.Headers["Content-Type"]
$response.RawContentLength
```

Nếu nhận `404`, cần cập nhật URL trong file dữ liệu hoặc cào lại nguồn trước khi chạy lại seed. Sau khi sửa dữ liệu, chạy lại `npm run seed -- --skip-scrape`; không cần xóa R2 vì asset hợp lệ đã có sẽ được nhận diện và dùng lại.

## Vận hành pipeline sản phẩm

1. Bảo đảm Cloudflare AI có credential và quota hợp lệ.
2. Chạy batch thử nhỏ với concurrency thấp; kiểm tra provider, status và validator.
3. Chỉ tăng concurrency sau khi đã đo rate limit và thời gian phản hồi.
4. Khi Cloudflare hết quota, để các bản ghi chưa hoàn tất ở trạng thái cần retry; chạy lại sau khi quota hồi phục.
5. Xác nhận `sourceHash` khớp dữ liệu sản phẩm hiện tại trước khi coi bản dịch là `approved`.
6. Giữ lại cache đã được duyệt; bản dịch mới chỉ cập nhật storefront khi validator thông qua.

Batch product seeder giữ nguyên bản dịch đã có `approved` trong cache và chỉ đồng bộ catalog khi đạt validator và còn khớp source product.

## Các cải thiện đã triển khai

- Ghép chunk giữ lại khoảng trắng tại boundary, tránh lỗi `keyboard.The` hoặc double-space.
- Validator kiểm tra mixed-language có dấu và một số cụm tiếng Việt không dấu.
- Validator kiểm tra token kỹ thuật, số liệu, markup và dấu hiệu output bị cắt.
- Lỗi `mixed_language`, `missing_technical_token`, `markup_mismatch` và `truncated` được xem là lỗi nghiêm trọng, không tự động approve.
- `ProductCatalogTranslationCache` lưu `sourceHash`; cache không khớp source hiện tại không được dùng cho storefront.
- Khi source product thay đổi, cả cache catalog và cache legacy đều được đánh dấu `needs_retranslate`.
- Manual save, import, retranslate và các luồng lưu cache động đều chạy validator trước khi đặt quality status.
- Luồng tự động chỉ dùng Cloudflare; lỗi provider không được biến thành bản dịch từ nguồn dự phòng.

Các kiểm tra code gần nhất:

Kiểm tra cú pháp và unit test cho Cloudflare chunking/provider trước khi chạy batch.

## Lưu ý chi phí và chất lượng

Rate limit/quota của Cloudflare làm tác vụ cần retry; tăng concurrency hoặc tạo thêm key chỉ sau khi xác nhận quota/hạn mức áp dụng cho tài khoản.
