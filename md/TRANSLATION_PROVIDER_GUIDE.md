# Hướng dẫn dịch bằng Cloudflare AI

## Mục tiêu

Cloudflare AI là provider duy nhất của các luồng dịch tự động trong backend. LibreTranslate không được dùng làm draft hoặc tự động thay thế Cloudflare khi bị rate limit/quota.

## Luồng dịch tự động

```text
Nội dung nguồn
      |
      v
Cloudflare AI: retry / thử cấu hình khả dụng
      |
      +--> bản dịch --> validator --> translation cache
      |
      +--> rate limit/quota --> ghi nhận lỗi, giữ bản dịch ở trạng thái chưa hoàn tất
```

Khi Cloudflare hết quota, tác vụ không được đánh dấu là bản dịch thành công và không chuyển sang provider chất lượng thấp hơn. Có thể retry sau khi quota hồi phục.

## LibreTranslate có chủ đích

LibreTranslate chỉ còn dùng khi người vận hành gọi rõ ràng `npm run retranslate -- --libretranslate-only`. Chế độ này bỏ qua Cloudflare và kết quả vẫn phải qua validator; không dùng làm failover cho batch dịch tự động.

Các luồng dịch sản phẩm, banner, giao diện động/static, admin, checkout, order, newsletter và namespace hệ thống đều dùng Cloudflare trong chế độ tự động.

## Cấu hình backend

Đặt trong `online-store-backend/.env`:

```env
CLOUDFLARE_AI_ENABLED=true
CLOUDFLARE_AI_MAX_REQUESTS_PER_DAY=...
CLOUDFLARE_AI_MAX_INPUT_CHARS_PER_DAY=...
CLOUDFLARE_AI_MAX_TOKENS=2048

LIBRETRANSLATE_URL=http://127.0.0.1:5001
LIBRETRANSLATE_TIMEOUT_MS=30000
LIBRETRANSLATE_RETRIES=2
LIBRETRANSLATE_RETRY_DELAY_MS=1000
LIBRETRANSLATE_MAX_PARALLEL_REQUESTS=3
LIBRETRANSLATE_DESCRIPTION_CHUNK_SIZE=6000
LIBRETRANSLATE_API_KEY=
```

- `CLOUDFLARE_AI_MAX_TOKENS`: số token tối đa cho mỗi phản hồi dịch; mặc định `2048` để tránh model cắt ngắn nội dung.
- `LIBRETRANSLATE_URL`: endpoint riêng chỉ cần cho chế độ `--libretranslate-only` hoặc công cụ độc lập.
- `LIBRETRANSLATE_MAX_PARALLEL_REQUESTS`: giới hạn request đồng thời tới LibreTranslate trong mỗi backend process; mặc định `3`.
- `LIBRETRANSLATE_DESCRIPTION_CHUNK_SIZE`: kích thước chia đoạn trong chế độ LibreTranslate-only.
- Standalone CLI `libretranslate-tool` dùng cấu hình endpoint/API key riêng và không phải provider failover của backend.
- `LIBRETRANSLATE_API_KEY`: chỉ cần khi instance yêu cầu API key.

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

`PRODUCT_TRANSLATION_DELAY_MS` chỉ được dùng sau chunk có rate-limit; chunk thành công không sleep cố định. `PRODUCT_TRANSLATION_LANGUAGE_CONCURRENCY` giới hạn số ngôn ngữ chạy cùng lúc; bắt đầu ở `1`, chỉ tăng lên `2` sau khi đã đo quota Cloudflare tổng. `PRODUCT_TRANSLATION_MEMORY_CACHE_SIZE` giới hạn số bản dịch giữ trong memory của process; key bao gồm nội dung, loại field và cặp ngôn ngữ. `PRODUCT_TRANSLATION_LOCK_TTL_SECONDS` mặc định được tính theo product và language concurrency với tối thiểu 120 giây. Seeder trả về và log provider counts, memory cache hits và translation p95 để benchmark. Tăng concurrency từng nấc `1 → 2 → 3 → 4`, đo 429, p95, CPU/RAM và failover rate sau mỗi nấc. Chưa chạy 9 ngôn ngữ song song khi chưa xác định quota Cloudflare tổng. hạn số bản dịch giữ trong memory của process; key bao gồm nội dung, loại field và cặp ngôn ngữ. `PRODUCT_TRANSLATION_LOCK_TTL_SECONDS` mặc định 120 giây, hoặc tự nâng lên 300 giây khi product concurrency lớn hơn 2. Seeder trả về và log provider counts, memory cache hits và translation p95 để benchmark. Tăng concurrency từng nấc `1 → 2 → 3 → 4`, đo 429, p95, CPU/RAM và failover rate sau mỗi nấc. Chưa chạy 9 ngôn ngữ song song khi chưa xác định quota Cloudflare tổng.

## Khởi động LibreTranslate local

LibreTranslate chạy độc lập tại `libretranslate-tool/`:

```powershell
cd libretranslate-tool
docker compose up -d
```

Compose dùng volume `libretranslate_models` và mount vào thư mục Argos Translate. Lần đầu có thể mất thời gian tải model. Cần xác nhận API có đủ 9 ngôn ngữ trước khi bật backend:

```powershell
Invoke-RestMethod `
  -Uri "http://127.0.0.1:5001/languages" `
  -Method Get
```

Các mã ngôn ngữ cần có:

```text
vi, en, pt, fr, de, it, es, nl, sv
```

## Kiểm tra API dịch

```powershell
$body = @{
  q = "Xin chào, đây là sản phẩm mới."
  source = "vi"
  target = "en"
  format = "text"
} | ConvertTo-Json

Invoke-RestMethod `
  -Uri "http://127.0.0.1:5001/translate" `
  -Method Post `
  -ContentType "application/json; charset=utf-8" `
  -Body $body
```

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
7. Chỉ dùng `--libretranslate-only` cho tác vụ thủ công có chủ đích, không dùng để lấp quota Cloudflare.

Batch product seeder giữ nguyên bản dịch đã có `approved` trong cache và chỉ đồng bộ catalog khi đạt validator và còn khớp source product.

## Các cải thiện đã triển khai

- LibreTranslate local hỗ trợ cả URL `http://` và `https://`.
- Ghép chunk giữ lại khoảng trắng tại boundary, tránh lỗi `keyboard.The` hoặc double-space.
- Validator kiểm tra mixed-language có dấu và một số cụm tiếng Việt không dấu.
- Validator kiểm tra token kỹ thuật, số liệu, markup và dấu hiệu output bị cắt.
- Lỗi `mixed_language`, `missing_technical_token`, `markup_mismatch` và `truncated` được xem là lỗi nghiêm trọng, không tự động approve.
- `ProductCatalogTranslationCache` lưu `sourceHash`; cache không khớp source hiện tại không được dùng cho storefront.
- Khi source product thay đổi, cả cache catalog và cache legacy đều được đánh dấu `needs_retranslate`.
- Manual save, import, retranslate và các luồng lưu cache động đều chạy validator trước khi đặt quality status.
- Cloudflare là provider chính; LibreTranslate có thể làm draft hoặc failover khi Cloudflare quá tải tùy env.

Các kiểm tra code gần nhất:

```text
node --check: pass
LibreTranslate/chunk tests: 4/4 pass
git diff --check: pass
```

## Lưu ý chi phí và chất lượng

Khi bật LibreTranslate, sản phẩm có thể tạo thêm request local. Ở chế độ draft, Cloudflare vẫn nhận văn bản gốc cùng draft để hiệu chỉnh. Ở chế độ failover, LibreTranslate có thể tạo bản dịch khi Cloudflare hết quota; bản dịch chỉ được dùng khi validator xác nhận đạt chuẩn, còn bản chưa đạt sẽ được retranslate.
