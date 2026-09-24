# Hướng dẫn phối hợp Cloudflare AI và LibreTranslate

## Mục tiêu

Cloudflare AI là provider chính tạo bản dịch đã duyệt. LibreTranslate là provider tùy chọn cho nội dung sản phẩm: tạo draft khi Cloudflare hoạt động bình thường và có thể làm fallback tạm thời khi toàn bộ cấu hình Cloudflare bị rate limit.

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
        | Cloudflare retry + rotate config đều hết quota/rate limit
        v
LibreTranslate fallback tạm thời (qualityStatus=pending)
        |
        v
Validator + LiveTranslationCache
        |
        v
Chỉ bản dịch approved mới vào ProductCatalogTranslationCache
```

Khi LibreTranslate tắt, bị timeout, không kết nối được hoặc trả lỗi trong draft mode, backend bỏ qua bản nháp và Cloudflare AI dịch trực tiếp từ văn bản gốc. Fallback mode chỉ chạy khi được bật riêng và Cloudflare đã hết khả năng xử lý do rate limit/quota.

Cloudflare AI vẫn là provider chính. Các guard `CLOUDFLARE_AI_ENABLED`, quota và credential vẫn áp dụng như trước.

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

LibreTranslate draft không ghi MongoDB. Khi fallback được bật, kết quả được lưu vào `LiveTranslationCache` với `provider=libretranslate`, `status=fallback_libretranslate`, `qualityStatus=pending` và không được dùng cho storefront.

### Cloudflare AI

Cloudflare AI vẫn xử lý bản dịch cuối cho sản phẩm và tiếp tục xử lý các nội dung khác:

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
LIBRETRANSLATE_URL=http://127.0.0.1:5001
LIBRETRANSLATE_TIMEOUT_MS=30000
LIBRETRANSLATE_RETRIES=2
LIBRETRANSLATE_RETRY_DELAY_MS=1000
LIBRETRANSLATE_CONCURRENCY=1
LIBRETRANSLATE_MAX_PARALLEL_REQUESTS=1
LIBRETRANSLATE_DESCRIPTION_CHUNK_SIZE=6000
LIBRETRANSLATE_FALLBACK_ON_CLOUDFLARE_RATE_LIMIT=false
LIBRETRANSLATE_AS_PRIMARY_APPROVED=false
LIBRETRANSLATE_API_KEY=

PRODUCT_TRANSLATION_CHUNK_SIZE=10
PRODUCT_TRANSLATION_CONCURRENCY=1
PRODUCT_TRANSLATION_LANGUAGE_CONCURRENCY=1
PRODUCT_TRANSLATION_DELAY_MS=1000
PRODUCT_TRANSLATION_LOCK_TTL_SECONDS=300
```

- `CLOUDFLARE_AI_MAX_TOKENS`: số token tối đa cho mỗi phản hồi dịch; mặc định `2048` để tránh model cắt ngắn nội dung.
- `LIBRETRANSLATE_ENABLED=false`: Cloudflare dịch trực tiếp sản phẩm.
- `LIBRETRANSLATE_ENABLED=true`: LibreTranslate tạo draft cho sản phẩm.
- `LIBRETRANSLATE_FALLBACK_ON_CLOUDFLARE_RATE_LIMIT=true`: cho phép LibreTranslate dịch tạm sau khi Cloudflare retry và rotate toàn bộ config thất bại do rate limit/quota.
- `LIBRETRANSLATE_AS_PRIMARY_APPROVED=false`: mặc định fallback luôn pending; biến này chưa bật cơ chế approve toàn bộ vì chất lượng technical translation cần review.
- `LIBRETRANSLATE_MAX_PARALLEL_REQUESTS`: giới hạn request đồng thời vào service local.
- `PRODUCT_TRANSLATION_CONCURRENCY`: số sản phẩm xử lý đồng thời.
- `PRODUCT_TRANSLATION_LANGUAGE_CONCURRENCY`: số ngôn ngữ xử lý đồng thời; nên bắt đầu từ `1` rồi benchmark.
- `PRODUCT_TRANSLATION_DELAY_MS`: backoff giữa chunk khi vừa gặp rate limit; chunk thành công không sleep.
- `LIBRETRANSLATE_URL`: URL API local hoặc remote đã được bảo vệ.
- `LIBRETRANSLATE_API_KEY`: chỉ cần khi instance yêu cầu API key.

Không đặt secret thật trong `.env.example` hoặc Git.

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
3. Đặt `LIBRETRANSLATE_ENABLED=true` nếu muốn dùng draft.
4. Chỉ bật `LIBRETRANSLATE_FALLBACK_ON_CLOUDFLARE_RATE_LIMIT=true` sau khi đã benchmark local service.
5. Bắt đầu với `PRODUCT_TRANSLATION_CONCURRENCY=2` và `PRODUCT_TRANSLATION_LANGUAGE_CONCURRENCY=1`.
6. Chạy dry-run một batch nhỏ, theo dõi số `429`, fallback, thời gian và CPU/RAM.
7. Kiểm tra quality status; chỉ bản dịch Cloudflare đã `approved` mới vào catalog cache.
8. Khi Cloudflare có quota lại, chạy `node src/scripts/retranslate.js --include-libretranslate-fallback --lang=<lang>` theo từng batch.
9. Xác nhận cache có `sourceHash` khớp source product hiện tại trước khi coi là `approved`.

Batch product seeder giữ nguyên bản dịch đã có `approved` trong cache. Nếu muốn áp dụng draft cho sản phẩm đã có cache, cần dùng luồng retranslate sản phẩm hoặc xử lý lại cache theo quy trình quản trị.

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
- Cloudflare là provider tạo bản dịch approved; LibreTranslate có draft mode và fallback mode riêng.
- Fallback được lưu với provider/status riêng để có thể retranslate sau khi quota Cloudflare hồi phục.
- Seeder chỉ throttle giữa chunk khi chunk trước có rate limit; concurrency giữa sản phẩm/ngôn ngữ vẫn có giới hạn cấu hình.

Các kiểm tra code gần nhất:

```text
node --check: pass
LibreTranslate/chunk tests: 4/4 pass
git diff --check: pass
```

## Lưu ý chi phí và chất lượng

Khi bật LibreTranslate, sản phẩm có thể tạo thêm request local. Ở draft mode, Cloudflare vẫn nhận văn bản gốc cùng draft để hiệu chỉnh. Ở fallback mode, LibreTranslate giúp pipeline không đứng yên khi Cloudflare bị rate limit nhưng chất lượng thấp hơn nên kết quả luôn pending và phải retranslate/review trước khi approved.
