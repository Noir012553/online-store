# Hướng dẫn phối hợp Cloudflare AI và LibreTranslate

## Mục tiêu

Cloudflare AI là provider bắt buộc và tạo bản dịch cuối cùng. LibreTranslate chỉ là provider tùy chọn cho nội dung sản phẩm, dùng để tạo bản dịch nháp trước khi Cloudflare AI hiệu chỉnh.

Các nội dung không phải sản phẩm không đi qua LibreTranslate.

## Luồng dịch

```text
Sản phẩm tiếng Việt
        |
        | LIBRETRANSLATE_ENABLED=true
        v
LibreTranslate tạo bản nháp tùy chọn
        |
        v
Cloudflare AI dịch văn bản gốc và tham khảo bản nháp
        |
        v
Validator + LiveTranslationCache/ProductCatalogTranslationCache
```

Khi LibreTranslate tắt, bị timeout, không kết nối được hoặc trả lỗi trong chế độ draft, backend bỏ qua bản nháp và Cloudflare AI dịch trực tiếp từ văn bản gốc.

### Fallback khi Cloudflare bị rate limit

Khi `LIBRETRANSLATE_FALLBACK_ON_CLOUDFLARE_RATE_LIMIT=true`, backend chỉ chuyển sang LibreTranslate sau khi Cloudflare đã retry và thử hết các config khả dụng nhưng vẫn gặp lỗi rate limit/quota. Fallback không áp dụng cho lỗi input hoặc lỗi mạng thông thường.

Bản dịch fallback được lưu với:

- `provider: libretranslate`
- `status: fallback_libretranslate`
- `qualityStatus: pending` mặc định
- `qualityScore` bị giới hạn dưới ngưỡng auto-approve
- `retranslateReason: cloudflare_rate_limit`

Các bản ghi này không được dùng như bản dịch `approved` cho storefront và cần được retranslate bằng Cloudflare sau khi quota hồi phục. Chỉ bật `LIBRETRANSLATE_AS_PRIMARY_APPROVED=true` khi đã chấp nhận LibreTranslate là provider chính cho môi trường hoặc field phù hợp.

Cloudflare AI không được tắt trong pipeline. Các guard `CLOUDFLARE_AI_ENABLED`, quota và credential vẫn áp dụng như trước.

## Phạm vi provider

### LibreTranslate

Chỉ được gọi từ luồng dịch sản phẩm và chỉ tạo bản nháp cho các field:

- `name`
- `description`
- `specs[*]`
- `technicalDescription`
- `descriptionImages[].alt`
- `promotions[].title`
- `promotions[].giftProductName`
- `promotions[].scope`
- `promotions[].discountText`

LibreTranslate không ghi MongoDB và không thay thế cache chính thức.

### Cloudflare AI

Cloudflare AI vẫn là provider chính cho sản phẩm và tiếp tục xử lý các nội dung khác. LibreTranslate chỉ thay thế tạm thời trong fallback rate-limit khi được bật rõ ràng:

- Banner: title, subtitle, description, CTA.
- Nội dung giao diện động và static translation cache.
- Tên/spec key động.
- Nội dung admin, checkout, order, newsletter, footer và các namespace hệ thống.
- Tất cả các luồng không phải sản phẩm.

## Cấu hình backend

Đặt trong `online-store-backend/.env`:

```env
CLOUDFLARE_AI_ENABLED=true
CLOUDFLARE_AI_MAX_REQUESTS_PER_DAY=...
CLOUDFLARE_AI_MAX_INPUT_CHARS_PER_DAY=...
CLOUDFLARE_AI_MAX_TOKENS=2048

LIBRETRANSLATE_ENABLED=false
LIBRETRANSLATE_FALLBACK_ON_CLOUDFLARE_RATE_LIMIT=false
LIBRETRANSLATE_AS_PRIMARY_APPROVED=false
LIBRETRANSLATE_URL=http://127.0.0.1:5001
LIBRETRANSLATE_TIMEOUT_MS=30000
LIBRETRANSLATE_RETRIES=2
LIBRETRANSLATE_RETRY_DELAY_MS=1000
LIBRETRANSLATE_MAX_PARALLEL_REQUESTS=4
LIBRETRANSLATE_DESCRIPTION_CHUNK_SIZE=6000
LIBRETRANSLATE_API_KEY=
```

- `CLOUDFLARE_AI_MAX_TOKENS`: số token tối đa cho mỗi phản hồi dịch; mặc định `2048` để tránh model cắt ngắn nội dung.
- `LIBRETRANSLATE_ENABLED=false`: không gọi LibreTranslate.
- `LIBRETRANSLATE_ENABLED=true`: LibreTranslate tạo draft cho sản phẩm.
- `LIBRETRANSLATE_FALLBACK_ON_CLOUDFLARE_RATE_LIMIT=false`: mặc định không thay thế Cloudflare khi hết quota.
- `LIBRETRANSLATE_FALLBACK_ON_CLOUDFLARE_RATE_LIMIT=true`: cho phép fallback sau khi Cloudflare retry và rotate config thất bại vì rate limit/quota.
- `LIBRETRANSLATE_AS_PRIMARY_APPROVED=false`: fallback vẫn ở trạng thái chờ review; không auto-approve.
- `LIBRETRANSLATE_URL`: URL API local hoặc remote đã được bảo vệ.
- `LIBRETRANSLATE_MAX_PARALLEL_REQUESTS`: giới hạn request đồng thời tới LibreTranslate trong mỗi backend process; mặc định `4`.
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
```

`PRODUCT_TRANSLATION_DELAY_MS` chỉ được dùng sau chunk có rate-limit; chunk thành công không sleep cố định. `PRODUCT_TRANSLATION_LANGUAGE_CONCURRENCY` giới hạn số ngôn ngữ chạy cùng lúc; bắt đầu ở `1`, chỉ tăng lên `2` sau khi đã đo quota Cloudflare tổng. `PRODUCT_TRANSLATION_MEMORY_CACHE_SIZE` giới hạn số bản dịch giữ trong memory của process; key bao gồm nội dung, loại field và cặp ngôn ngữ. Tăng concurrency từng nấc `1 → 2 → 3 → 4`, đo 429, p95, CPU/RAM và fallback rate sau mỗi nấc. Chưa chạy 9 ngôn ngữ song song khi chưa xác định quota Cloudflare tổng.

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

1. Bảo đảm Cloudflare AI đã có credential và quota hợp lệ.
2. Bảo đảm LibreTranslate có đủ model nếu muốn bật draft.
3. Đặt `LIBRETRANSLATE_ENABLED=true` nếu muốn dùng draft hoặc fallback.
4. Chỉ đặt `LIBRETRANSLATE_FALLBACK_ON_CLOUDFLARE_RATE_LIMIT=true` sau khi đã test batch nhỏ.
5. Chạy luồng dịch sản phẩm hiện có.
6. Kiểm tra provider, status fallback và chất lượng trong cache/validator.
7. Xác nhận cache có `sourceHash` khớp source product hiện tại trước khi coi là `approved`.
8. Khi quota hồi phục, chạy luồng retranslate có giới hạn cho các bản ghi `fallback_libretranslate`.
9. Sau khi bản dịch Cloudflare đạt `approved`, backend đồng bộ lại `ProductCatalogTranslationCache`.
10. Nếu LibreTranslate lỗi, không cần dừng pipeline; backend sẽ tiếp tục bằng Cloudflare hoặc ghi nhận retry.

Batch product seeder giữ nguyên bản dịch đã có `approved` trong cache. Bản fallback được chọn lại bởi retranslate seeder; bản dịch mới chỉ cập nhật catalog khi đã đạt `approved` và còn khớp source product.

Không chạy LibreTranslate cho banner, static namespace, admin hoặc nội dung checkout. Không ghi bản dịch LibreTranslate trực tiếp vào cache chính thức.

## Các cải thiện đã triển khai

- LibreTranslate local hỗ trợ cả URL `http://` và `https://`.
- Ghép chunk giữ lại khoảng trắng tại boundary, tránh lỗi `keyboard.The` hoặc double-space.
- Validator kiểm tra mixed-language có dấu và một số cụm tiếng Việt không dấu.
- Validator kiểm tra token kỹ thuật, số liệu, markup và dấu hiệu output bị cắt.
- Lỗi `mixed_language`, `missing_technical_token`, `markup_mismatch` và `truncated` được xem là lỗi nghiêm trọng, không tự động approve.
- `ProductCatalogTranslationCache` lưu `sourceHash`; cache không khớp source hiện tại không được dùng cho storefront.
- Khi source product thay đổi, cả cache catalog và cache legacy đều được đánh dấu `needs_retranslate`.
- Manual save, import, retranslate và các luồng lưu cache động đều chạy validator trước khi đặt quality status.
- Cloudflare là provider chính; LibreTranslate có thể làm draft hoặc fallback rate-limit tùy env.

Các kiểm tra code gần nhất:

```text
node --check: pass
LibreTranslate/chunk tests: 4/4 pass
git diff --check: pass
```

## Lưu ý chi phí và chất lượng

Khi bật LibreTranslate, sản phẩm có thể tạo thêm request local. Ở chế độ draft, Cloudflare vẫn nhận văn bản gốc cùng draft để hiệu chỉnh. Ở chế độ fallback, LibreTranslate có thể tạo bản tạm khi Cloudflare hết quota; bản tạm vẫn bị giữ ở trạng thái review và phải retranslate trước khi coi là dữ liệu chính thức.
