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

Khi LibreTranslate tắt, bị timeout, không kết nối được hoặc trả lỗi, backend bỏ qua bản nháp và Cloudflare AI dịch trực tiếp từ văn bản gốc.

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

LIBRETRANSLATE_ENABLED=false
LIBRETRANSLATE_URL=http://127.0.0.1:5001
LIBRETRANSLATE_TIMEOUT_MS=30000
LIBRETRANSLATE_RETRIES=2
LIBRETRANSLATE_RETRY_DELAY_MS=1000
LIBRETRANSLATE_DESCRIPTION_CHUNK_SIZE=6000
LIBRETRANSLATE_API_KEY=
```

- `LIBRETRANSLATE_ENABLED=false`: Cloudflare dịch trực tiếp sản phẩm.
- `LIBRETRANSLATE_ENABLED=true`: LibreTranslate tạo draft cho sản phẩm, Cloudflare vẫn bắt buộc tạo bản cuối.
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
4. Chạy luồng dịch sản phẩm hiện có.
5. Kiểm tra chất lượng bản dịch Cloudflare trong cache và validator.
6. Nếu LibreTranslate lỗi, không cần dừng pipeline; backend sẽ tiếp tục bằng Cloudflare.

Batch product seeder giữ nguyên bản dịch đã có `approved` trong cache. Nếu muốn áp dụng draft cho sản phẩm đã có cache, cần dùng luồng retranslate sản phẩm hoặc xử lý lại cache theo quy trình quản trị.

Không chạy LibreTranslate cho banner, static namespace, admin hoặc nội dung checkout. Không ghi bản dịch LibreTranslate trực tiếp vào cache chính thức.

## Lưu ý chi phí và chất lượng

Khi bật LibreTranslate, sản phẩm có thể tạo thêm request local và tăng thời gian xử lý. Cloudflare vẫn nhận văn bản gốc cùng draft để hiệu chỉnh, nên quota Cloudflare vẫn được sử dụng. Cách này giữ Cloudflare là nguồn bản dịch cuối và tránh biến bản dịch nháp thành dữ liệu chính thức.
