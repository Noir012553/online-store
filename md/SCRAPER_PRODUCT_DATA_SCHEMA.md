# Chuẩn schema dữ liệu sản phẩm từ scraper

## 1. Phạm vi

Tài liệu này ghi nhận bộ key sản phẩm đã chốt sau khi bổ sung:

- Mô tả sản phẩm dạng bài viết.
- Ảnh nằm bên trong mô tả sản phẩm.
- Khuyến mãi và quà tặng đi kèm.

Tài liệu này đồng thời ghi nhận phần triển khai schema đã thực hiện ở scraper Python, adapter import, validator, Product model, API và frontend. Luồng upload asset cho ảnh chính, gallery và ảnh trong mô tả dùng Cloudflare R2 ở backend; frontend chỉ nhận asset reference đã được kiểm tra.

## 2. Trạng thái hiện tại

Trước thay đổi, scraper xuất 13 key cũ. Hiện record mới đã chuyển sang bộ 16 key canonical; adapter vẫn giữ khả năng đọc file legacy để không làm hỏng dữ liệu cũ.

Các file scraper chính:

- `online-store-backend/python/scraper_paths.py`
- `online-store-backend/python/scraper_runner.py`

Adapter Node tại đây hỗ trợ cả bộ key canonical mới và các key legacy như `Name`, `Brand`, `ID`, `Description`, `MainImage` và `GalleryImages`:

- `online-store-backend/src/utils/importAdapters/BaseImportAdapter.js`

Vì vậy, chỉ đổi tên key trong Python mà không cập nhật adapter sẽ làm dữ liệu không được normalize đúng khi import.

### 2.1. Tiến độ triển khai

| Hạng mục | Trạng thái | Ghi chú |
|---|---|---|
| Chốt 16 key canonical độc nhất | Hoàn tất | Dùng tiền tố `Product` |
| Extract mô tả sản phẩm | Hoàn tất | Đọc `.news-html-content` |
| Extract ảnh trong mô tả | Hoàn tất | Chuẩn hóa URL và dedupe |
| Extract quà tặng/khuyến mãi | Hoàn tất | Hỗ trợ `Gift` và `Discount` |
| Output JSON | Hoàn tất | Giữ array/object đúng kiểu |
| Output CSV | Hoàn tất | Array/object được serialize thành JSON |
| Adapter key mới và legacy | Hoàn tất | Normalize tập trung tại `BaseImportAdapter` |
| Validate field mới | Hoàn tất | URL, giới hạn, kiểu dữ liệu và sanitize |
| Lưu field vào `Product` model | Hoàn tất | `technicalDescription`, `descriptionImages`, `promotions` |
| Cập nhật import guide | Hoàn tất | Bổ sung field details |
| Test fixture/extractor Python | Đã thêm | Cần chạy trong môi trường có dependency Python |
| Runtime test Node | Chưa hoàn tất | Cần chạy suite liên quan trong môi trường có dependency backend |
| Staging metadata cho từng batch | Hoàn tất | `scraper_runner.py` tạo `ScrapeRunID`, `ScrapeCapturedAt`, `ScrapeParserVersion` và `ProductData` |
| Upload ảnh chính/gallery | Hoàn tất | Seed pipeline upload hai nhóm này lên Cloudflare R2 và lưu asset reference |
| Upload ảnh mô tả lên Cloudflare R2 | Hoàn tất | Seed/import hỗ trợ role `description`, content hash và manifest R2 |
| Lưu metadata asset | Hoàn tất một phần | Runtime đã lưu provider/account/bucket/key cho main, gallery và description; manifest/backup/ZIP role description chưa đầy đủ |
| Backend CRUD trực tiếp | Hoàn tất | `createProduct`/`updateProduct` nhận, validate và lưu ba field mới |
| API response camelCase | Hoàn tất một phần | Formatter trả field mới; cần hoàn thiện contract/integration test |
| JSON/CSV import | Hoàn tất một phần | Adapter và validator nhận field mới; cần hoàn tất round-trip test |
| ZIP import/export | Hoàn tất một phần | Data entry và ảnh chính/gallery có hỗ trợ; ảnh mô tả chưa có role/manifest riêng |
| Product/translation backup | Chưa đầy đủ | Chưa có snapshot Product/cache mới và manifest asset đầy đủ |
| Frontend type/adapter | Hoàn tất | `Laptop`, `BackendProduct` và adapter giữ ba field mới |
| Frontend UI | Hoàn tất | Hiển thị technical description, description images và promotions |
| Translation field mới | Hoàn tất một phần | Cache/seeder/API đã hỗ trợ; cần hoàn thiện quality/integration test |
| Cloudflare AI multi-config | Hoàn tất một phần | Có hậu tố và nhận diện rate-limit/quota; cần giới hạn retry/rotation và test đầy đủ |
| R2 multi-account adapter | Hoàn tất một phần | Runtime đã chọn/upload/xóa theo account; còn blocker import crypto, chưa có quota/rotation/failover và chưa test staging |
| Dry-run batch thật | Chưa chạy | Cần môi trường có dependency và dữ liệu nguồn |

Các kiểm tra đã đạt:

- `node --check` cho các file JavaScript đã sửa.
- `git diff --check` cho toàn bộ thay đổi.

### 2.2. Luồng seed mặc định và chia phase

Lệnh seed mặc định chạy toàn bộ pipeline theo thứ tự dependency:

```text
pre-products
  -> product pipeline: scraper tùy điều kiện -> normalize/validate -> import -> translation
  -> post-products
```

Seed thuộc workspace backend. Chạy các lệnh sau từ thư mục `online-store-backend`:

```bash
cd online-store-backend
npm run seed
npm run seed:dry-run
npm run seed:pre-products
npm run seed:post-products
npm run seed:list
npm run seed:modules
```

`npm run seed` không crawl lại nếu thư mục `data/scraped-products` đã có output hợp lệ. Muốn chạy lại toàn bộ scraper trước khi import dùng:

```bash
npm run seed -- --force-scrape
```

`--dry-run` vẫn chạy phần chuẩn bị và preview import nhưng không ghi Product, không dịch thật và không chạy post-products. Các phase riêng dùng để retry hoặc cô lập lỗi; không được hiểu là thay thế cho full pipeline mặc định.

## 3. Bộ key chuẩn độc nhất

Bộ key canonical gồm 16 key. Tất cả đều có tiền tố `Product` để tránh tên chung và tránh va chạm nghĩa:

```text
ProductBrand
ProductID
ProductName
ProductSKU
ProductPriceVND
ProductRegularPriceVND
ProductStockStatus
ProductCategory
ProductSpecifications
ProductTechnicalDescription
ProductDescription
ProductDescriptionImages
ProductPromotions
ProductMainImage
ProductGalleryImages
ProductURL
```

### 3.1. Thông tin nhận diện

| Key | Dữ liệu |
|---|---|
| `ProductBrand` | Thương hiệu sản phẩm |
| `ProductID` | ID lấy từ URL sản phẩm |
| `ProductName` | Tên sản phẩm |
| `ProductSKU` | Mã SKU |
| `ProductCategory` | Danh mục của batch scraper |
| `ProductURL` | URL canonical của sản phẩm |

### 3.2. Giá và tồn kho

| Key | Dữ liệu |
|---|---|
| `ProductPriceVND` | Giá bán hiện tại, đơn vị VND |
| `ProductRegularPriceVND` | Giá niêm yết hoặc giá trước khuyến mãi |
| `ProductStockStatus` | Trạng thái tồn kho từ JSON-LD |

### 3.3. Thông số và mô tả

| Key | Dữ liệu |
|---|---|
| `ProductSpecifications` | Thông số kỹ thuật dạng object hoặc JSON string |
| `ProductTechnicalDescription` | Mô tả text sinh từ thông số kỹ thuật |
| `ProductDescription` | Nội dung bài viết trong `.news-html-content` |
| `ProductDescriptionImages` | Ảnh nằm bên trong bài viết mô tả |

`ProductTechnicalDescription` và `ProductDescription` không được gộp vì có nguồn và mục đích khác nhau:

- `ProductTechnicalDescription`: dữ liệu mô tả thông số kỹ thuật.
- `ProductDescription`: nội dung biên tập gồm các tiêu đề, đoạn văn và liên kết trong bài viết.

### 3.4. Hình ảnh chính

| Key | Dữ liệu |
|---|---|
| `ProductMainImage` | Ảnh chính của sản phẩm |
| `ProductGalleryImages` | Các ảnh gallery của sản phẩm |

`ProductDescriptionImages` không được gộp vào `ProductGalleryImages`, vì ảnh mô tả là ảnh trong bài viết, còn gallery là ảnh bộ sản phẩm.

## 4. Mapping phần mô tả sản phẩm

Nguồn HTML chính:

```css
.news-html-content
```

Các nội dung cần lấy:

- `h1`, `h2`, `h3`: tiêu đề bài viết hoặc các mục.
- `p`: nội dung đoạn văn.
- `a`: liên kết trong nội dung.
- `img`: ảnh trong bài mô tả.

Dữ liệu tối thiểu:

```json
{
  "ProductDescription": "Khám phá laptop Acer Aspire Lite 15 AL15 53P 56QH...",
  "ProductDescriptionImages": [
    {
      "ProductDescriptionImageURL": "https://cdn.hstatic.net/...",
      "ProductDescriptionImageAlt": "Laptop Acer Aspire Lite 15..."
    }
  ]
}
```

Các key con cũng dùng tiền tố rõ nghĩa để không tạo ra `URL`, `Alt` hoặc `Images` chung chung.

Không lưu thành key sản phẩm riêng các thành phần chỉ phục vụ giao diện:

- `Thông tin sản phẩm`.
- `Mục lục`.
- `Xem thêm`.
- `Thu gọn`.
- `id="section-0"` đến `id="section-6"`.

Nếu cần giữ cấu trúc từng mục `h2` trong tương lai, có thể bổ sung riêng `ProductDescriptionSections`; hiện chưa đưa key này vào schema để tránh dư dữ liệu.

## 5. Mapping phần khuyến mãi

Nguồn HTML là section có tiêu đề hiển thị `Ưu đãi đi kèm`. Dữ liệu thực tế cần lưu vào:

```text
ProductPromotions
```

Ví dụ với quà tặng:

```json
{
  "ProductPromotions": [
    {
      "ProductPromotionType": "Gift",
      "ProductPromotionTitle": "Tặng ngay 1 x Chuột không dây Logitech M331 Silent Black",
      "ProductPromotionGiftQuantity": 1,
      "ProductPromotionGiftProductName": "Chuột không dây Logitech M331 Silent Black",
      "ProductPromotionGiftProductURL": "https://gearvn.com/products/chuot-khong-day-logitech-m331-silent",
      "ProductPromotionGiftValueVND": 360000
    }
  ]
}
```

Các key con:

| Key | Dữ liệu |
|---|---|
| `ProductPromotionType` | Loại ưu đãi, ví dụ `Gift` hoặc `Discount` |
| `ProductPromotionTitle` | Nội dung hiển thị đầy đủ |
| `ProductPromotionGiftQuantity` | Số lượng quà tặng |
| `ProductPromotionGiftProductName` | Tên sản phẩm được tặng |
| `ProductPromotionGiftProductURL` | URL sản phẩm được tặng |
| `ProductPromotionGiftValueVND` | Giá trị quà tặng |

Với ưu đãi giảm giá theo phạm vi, có thể dùng thêm các key có tiền tố riêng:

```text
ProductPromotionScope
ProductPromotionDiscountText
```

Không lấy các thành phần sau làm khuyến mãi:

- Icon SVG.
- `aria-expanded`.
- Text `Xem thêm 1 ưu đãi`.
- Text `Thu gọn`.

Nếu HTML chỉ hiển thị 2 item nhưng nút ghi còn 1 ưu đãi, không được tự tạo item thứ ba khi nội dung chi tiết chưa xuất hiện trong DOM.

## 6. Các lỗi có thể phát sinh

### 6.1. Đổi key nhưng chưa cập nhật adapter

Nếu scraper chuyển sang `ProductName` nhưng `BaseImportAdapter` vẫn đọc `product.Name`, product có thể bị thiếu tên, giá, ảnh hoặc URL khi import.

Khi triển khai phải cập nhật đồng bộ:

- `PRODUCT_OUTPUT_FIELDS`.
- Hàm tạo record trong `scraper_runner.py`.
- `BaseImportAdapter`.
- Validator import.
- Seed pipeline.
- CSV/JSON tests.

### 6.2. CSV không phù hợp với array/object lồng nhau

JSON nên là source of truth cho:

- `ProductSpecifications`.
- `ProductDescriptionImages`.
- `ProductPromotions`.

Nếu vẫn xuất CSV, các giá trị array/object phải được serialize thành JSON UTF-8 hợp lệ, không dùng delimiter dễ nhầm như `||` cho dữ liệu có cấu trúc mới.

### 6.3. Ảnh trong mô tả có thể dùng lazy loading

Ảnh có thể nằm trong `src`, `data-src`, `data-original`, `srcset` hoặc `data-srcset`. URL dạng `//cdn.hstatic.net/...` phải được chuẩn hóa thành HTTPS.

Không nên phụ thuộc vào toàn bộ class Tailwind dài; nên chọn `.news-html-content img` và các thuộc tính URL ảnh.

### 6.4. Nội dung mô tả có thể chứa HTML không an toàn

Không nên đưa nguyên HTML chưa làm sạch vào frontend bằng `dangerouslySetInnerHTML`. Scraper nên ưu tiên text có cấu trúc và metadata ảnh; nếu giữ HTML, cần sanitize trước khi lưu hoặc trước khi render.

### 6.5. Nội dung bị ẩn bởi giao diện

`max-height`, gradient và nút `Xem thêm` chỉ là CSS/UI. Nếu nội dung đã có trong DOM thì scraper lấy được; nếu website chỉ tải phần còn lại sau thao tác hoặc gọi API riêng thì cần tìm endpoint/luồng tải thêm, không được suy đoán từ text nút.

### 6.6. Giá và nội dung khuyến mãi thay đổi theo thời điểm

`ProductPromotionGiftValueVND` có thể thay đổi hoặc không xuất hiện. Đây là field tùy chọn; không được coi việc thiếu giá trị quà tặng là lỗi toàn bộ sản phẩm.

## 7. Kế hoạch triển khai an toàn

1. Viết extractor riêng cho mô tả sản phẩm và khuyến mãi.
2. Bổ sung fixture HTML tương ứng với hai section đã cung cấp.
3. Cập nhật output fields và record builder.
4. Cập nhật adapter normalize từ bộ key mới sang schema nội bộ.
5. Cập nhật validator cho object/array mới.
6. Kiểm tra JSON trước, sau đó mới xử lý cách biểu diễn trong CSV.
7. Chạy test unit scraper/import; không chạy `npm run build` tự động.

## 8. Kiến trúc triển khai theo tầng

Không dùng schema crawler trực tiếp làm schema MongoDB hoặc API. Mỗi tầng có một trách nhiệm riêng:

```text
GearVN HTML
  -> Crawler/extractor
  -> Staging record
  -> Normalize adapter
  -> Validation/data quality
  -> Asset processing
  -> Import/upsert MongoDB
  -> API response
  -> Frontend
```

### 8.1. Crawler/extractor

Chỉ đọc HTML/JSON-LD và tạo record theo bộ key `Product...`.

Không được thực hiện trong tầng này:

- Kết nối MongoDB.
- Gọi Cloudinary hoặc R2.
- Tự xóa asset cũ.
- Quyết định tồn kho thực tế của hệ thống.
- Render hoặc thực thi HTML lấy từ nguồn.

Extractor phải ghi cảnh báo cho dữ liệu thiếu nhưng chỉ từ chối cả record khi thiếu trường định danh hoặc dữ liệu tối thiểu theo policy.

### 8.2. Staging

**Trạng thái hiện tại: đã triển khai.** Output scraper vẫn giữ record 16 key canonical cho import tương thích, đồng thời ghi staging envelope có `ScrapeRunID`, `ScrapeCapturedAt`, `ScrapeParserVersion` và `ProductData` trong file `.staging.json`.

Khi triển khai staging, mỗi batch nên có metadata riêng:

```json
{
  "ScrapeSource": "gearvn",
  "ScrapeURL": "https://gearvn.com/products/example",
  "ScrapeRunID": "20260315T101530Z",
  "ScrapeCapturedAt": "2026-03-15T10:15:30Z",
  "ScrapeParserVersion": "product-v1",
  "ProductData": {}
}
```

Staging giúp retry, audit và so sánh parser mới với parser cũ mà không phải cào lại ngay.

### 8.3. Normalize adapter

`BaseImportAdapter` là nơi duy nhất map từ key crawler sang schema nội bộ:

```text
ProductName                 -> name
ProductBrand                -> brand
ProductSKU                  -> sku
ProductPriceVND             -> price
ProductRegularPriceVND      -> originalPrice
ProductCategory             -> category
ProductSpecifications       -> specs
ProductTechnicalDescription -> technicalDescription
ProductDescription          -> description
ProductDescriptionImages    -> descriptionImages
ProductPromotions           -> promotions
ProductMainImage            -> image
ProductGalleryImages        -> images
ProductURL                  -> sourceUrl
```

Không rải mapping này vào controller, seed pipeline và frontend cùng lúc.

### 8.4. Validation/data quality

Validation phải chạy sau normalize và trước upload/import. Cần kiểm tra:

- Tên, brand và identity không rỗng.
- Giá là số VND hợp lệ.
- URL sản phẩm và URL ảnh hợp lệ.
- Không trùng SKU hoặc source URL trong cùng batch.
- `ProductPromotions` là array đúng cấu trúc.
- `ProductDescriptionImages` không vượt giới hạn số lượng/kích thước.
- HTML mô tả không được render nguyên trạng nếu chưa sanitize.
- Thiếu mô tả hoặc khuyến mãi không làm hỏng toàn bộ sản phẩm.

### 8.5. Asset processing

**Trạng thái hiện tại: triển khai một phần.** Seed/import và upload API đã xử lý các role `main`, `gallery` và `description` trên Cloudflare R2; CRUD mới lưu metadata account/bucket/key. Migration dữ liệu Cloudinary cũ và manifest backup đầy đủ vẫn chưa chạy. Không coi việc có URL nguồn là đã upload thành công.

Xử lý riêng ba nhóm asset:

```text
ProductMainImage
ProductGalleryImages
ProductDescriptionImages
```

Sau khi upload, reference asset cần giữ tối thiểu. Cấu trúc này phải được áp dụng nhất quán cho ảnh chính, gallery và ảnh trong mô tả; không chỉ lưu `url`/`alt` nếu asset đã được đưa vào storage:

```json
{
  "sourceUrl": "https://...",
  "storageProvider": "r2",
  "storageAccount": "1",
  "storageKey": "...",
  "publicUrl": "https://...",
  "alt": "..."
}
```

`storageProvider`, `storageAccount` và `storageKey` phải được lưu cùng metadata sản phẩm để tạo URL, kiểm tra và xóa đúng tài khoản. Không tự động di chuyển hoặc xóa asset cũ chỉ vì thêm provider mới.

Cloudflare R2 được chọn account theo backend bằng role hoặc stable hash. Frontend không biết credential, account secret hoặc bucket credential; chỉ nhận public asset reference sau khi backend upload và kiểm tra.

### 8.6. Import/upsert

Import dùng identity đã thống nhất, theo thứ tự phù hợp với dữ liệu hiện tại:

1. `ProductID` nếu là ID nội bộ hợp lệ.
2. `ProductSKU`.
3. `ProductURL` hoặc source identity ổn định.

Khi upsert:

- Không tự ghi đè tồn kho hiện tại nếu policy đang giữ tồn kho.
- Chỉ cập nhật mô tả, specs, promotions và asset khi bản mới hợp lệ.
- Không queue xóa asset cũ nếu asset mới chưa upload thành công.
- Ghi lại số record insert, update, skip và fail.

### 8.7. API/frontend

API chỉ trả schema nội bộ camelCase. Frontend không được biết selector GearVN, key `Product...`, R2 account credential hay R2 secret.

Trạng thái triển khai hiện tại:

| Tầng | Đã có | Còn phải làm |
|---|---|---|
| Product model | `technicalDescription`, `descriptionImages`, `promotions` | Mở rộng asset reference nếu upload ảnh mô tả |
| Import API | Normalize, validate và lưu được ba field mới | Bảo đảm policy upsert và báo cáo insert/update/skip/fail |
| API đọc sản phẩm | Formatter trả dữ liệu model theo camelCase | Kiểm tra contract response và tài liệu API |
| API CRUD trực tiếp | Nhận, validate và lưu ba field mới trong `POST`/`PUT` | Bổ sung test contract create/update |
| Frontend types/adapter | Giữ `technicalDescription`, `descriptionImages`, `promotions` cùng field cũ | Bổ sung test adapter cho legacy/missing fields |
| Frontend product detail | Render mô tả kỹ thuật, ảnh trong bài viết và từng khuyến mãi | Browser smoke test source/target locale |
| Frontend admin import | Preview/import tổng quát | Preview rõ ba field mới và cảnh báo dữ liệu không hợp lệ |
| Frontend admin import | Preview/import tổng quát | Preview rõ ba field mới và cảnh báo dữ liệu không hợp lệ |

Frontend chỉ nhận URL public/reference R2 đã được backend kiểm tra. Frontend không tự chọn R2 account, không nhận access key/secret và không tự tạo URL theo storage account.

## 9. Contract dữ liệu giữa các tầng

### 9.1. Contract crawler

Crawler xuất JSON là nguồn dữ liệu chính. Các field có cấu trúc phải giữ kiểu JSON, không ép thành chuỗi khi chưa cần:

```json
{
  "ProductName": "Acer Aspire Lite 15",
  "ProductSpecifications": {
    "CPU": "Intel Core 5 120U"
  },
  "ProductDescription": "Nội dung bài viết...",
  "ProductDescriptionImages": [
    {
      "ProductDescriptionImageURL": "https://cdn.hstatic.net/...",
      "ProductDescriptionImageAlt": "..."
    }
  ],
  "ProductPromotions": [
    {
      "ProductPromotionType": "Gift",
      "ProductPromotionTitle": "Tặng ngay 1 x ...",
      "ProductPromotionGiftQuantity": 1,
      "ProductPromotionGiftProductName": "...",
      "ProductPromotionGiftProductURL": "https://gearvn.com/products/...",
      "ProductPromotionGiftValueVND": 360000
    }
  ]
}
```

Nếu CSV bắt buộc phải xuất, array/object phải được serialize thành JSON UTF-8 hợp lệ. JSON mới là source of truth.

### 9.2. Contract nội bộ

Sau normalize, dùng camelCase và không lặp tiền tố `Product` bên trong document `Product`:

```json
{
  "name": "...",
  "brand": "...",
  "sku": "...",
  "price": 0,
  "originalPrice": 0,
  "technicalDescription": "...",
  "description": "...",
  "specs": {},
  "promotions": [],
  "image": {},
  "images": [],
  "descriptionImages": []
}
```

## 10. Lỗi dự đoán và cách phòng tránh

| Mức | Lỗi dự đoán | Nguyên nhân | Cách phòng tránh |
|---|---|---|---|
| P0 | Cào được nhưng import mất tên/giá/ảnh | Adapter vẫn đọc key cũ | Cập nhật adapter và test mapping trước khi đổi output |
| P0 | Ghi đè dữ liệu tốt bằng record thiếu | Upsert không kiểm tra completeness | Validate trước upsert, bỏ qua field mới khi dữ liệu mới không hợp lệ |
| P0 | Xóa nhầm ảnh | Thiếu provider/account/key hoặc cleanup quá sớm | Chỉ cleanup sau khi asset mới thành công và reference đã cập nhật |
| P1 | Mô tả bị mất ảnh | Chỉ lấy text trong `news-html-content` | Tách `.news-html-content img`, lấy `src`, lazy-load và `srcset` |
| P1 | Lưu nhầm ảnh giao diện | Quét toàn bộ `img` trong trang | Giới hạn selector trong `.news-html-content` |
| P1 | Khuyến mãi bị tạo giả | Dựa vào text `Xem thêm 1 ưu đãi` | Chỉ lưu item thực tế có trong DOM hoặc API response |
| P1 | Trùng khuyến mãi/ảnh | Nhiều selector trả cùng URL/item | Dedupe theo URL ảnh và fingerprint nội dung khuyến mãi |
| P1 | Sai giá quà tặng | Nội dung không có giá hoặc có định dạng khác | Field giá tùy chọn; parse tiền VND riêng và giữ raw title |
| P1 | HTML gây XSS khi hiển thị | Lưu/render nguyên HTML nguồn | Ưu tiên text/structured data, sanitize nếu cần giữ HTML |
| P1 | CSV hỏng cột | Dùng delimiter cho array/object | Serialize JSON và luôn quote CSV field |
| P1 | Sản phẩm sai brand/category | Collection chứa item liên quan hoặc selector rộng | Kiểm tra collection sau khi sửa contract URL đúng |
| P1 | Dừng cào sớm | Trang pagination không có link mới tạm thời | Ghi page diagnostics và kiểm tra empty-page policy |
| P2 | Thiếu ảnh lazy-load | Chỉ đọc `src` | Hỗ trợ `data-src`, `data-original`, `srcset`, `data-srcset` |
| P2 | URL ảnh không dùng được | URL dạng `//cdn...` hoặc redirect | Chuẩn hóa HTTPS và kiểm tra URL an toàn |
| P2 | Lệch CSV/JSON | Replace hai file không cùng transaction | Xem JSON là nguồn chính, ghi manifest trạng thái batch |
| P2 | Nhầm sản phẩm khi upsert | SKU thiếu hoặc thay đổi | Dùng identity ổn định từ SKU/URL và ghi cảnh báo |
| P2 | Bị rate limit nguồn | Worker cao, retry đồng thời | Giới hạn worker, backoff có jitter và không tăng tự động vô hạn |

## 11. Hướng dẫn triển khai cụ thể

### Bước 0: Chốt contract

- Giữ nguyên bộ 16 key trong mục 3.
- Không thêm key giao diện như `XemMore`, `IsExpanded` hoặc `TableOfContents` nếu chưa có yêu cầu dữ liệu.
- Chốt kiểu dữ liệu cho array/object trước khi sửa code.
- Không đổi trực tiếp schema MongoDB trong bước crawler.

### Bước 1: Tạo fixture HTML

Tạo fixture tối thiểu cho:

- Section mô tả có nhiều `h2`, `p`, `a`, `img`.
- Ảnh dùng `src`, `data-src`, URL `//cdn...`.
- Section có hai quà tặng và một ưu đãi giảm giá.
- Section không có mô tả hoặc không có khuyến mãi.
- Nút `Xem thêm` nhưng item còn lại không có trong DOM.

Test phải kiểm tra số lượng, nội dung, URL chuẩn hóa và dedupe.

### Bước 2: Viết extractor thuần Python

Thêm helper riêng trong `scraper_paths.py` hoặc module extractor chuyên biệt. Helper chỉ nhận BeautifulSoup và trả dữ liệu, không gọi network, database hoặc storage.

Các selector phải ưu tiên semantic:

```css
.news-html-content
.news-html-content img
```

Không copy toàn bộ class Tailwind dài vào selector.

### Bước 3: Cập nhật record builder

Sau khi helper đã có test:

1. Bổ sung 16 field vào output schema.
2. Tạo `ProductDescription` từ nội dung bài viết.
3. Tạo `ProductDescriptionImages` từ ảnh trong bài viết.
4. Tạo `ProductPromotions` từ từng item ưu đãi thực tế.
5. Không ghi record nếu thiếu identity tối thiểu.
6. Không fail toàn batch chỉ vì một promotion hoặc ảnh mô tả tùy chọn bị lỗi.

### Bước 4: Cập nhật adapter và validator

Cập nhật đồng bộ:

- `BaseImportAdapter`.
- `productImportValidator.js`.
- `productSeedPipeline.js`.
- Các test adapter/import.

Adapter phải map key mới một lần duy nhất. Validator phải xử lý array/object và giới hạn kích thước trước khi import.

### Bước 4.1: Cập nhật API CRUD

Sau khi import pipeline ổn định, cập nhật riêng các endpoint tạo/sửa sản phẩm:

1. Nhận `technicalDescription`, `descriptionImages` và `promotions` từ request body.
2. Dùng cùng rule normalize/validation với import, không tạo mapping khác trong controller.
3. Không cho phép client gửi thông tin chọn R2 account hoặc secret.
4. Giữ policy identity, tồn kho và asset cũ của luồng upsert.
5. Bổ sung test cho create, update và response sau khi lưu.

### Bước 4.2: Cập nhật API contract và frontend

Chỉ sau khi API response ổn định:

1. Thêm ba field mới vào `BackendProduct` và `Laptop` với kiểu dữ liệu phù hợp.
2. Cập nhật adapter frontend để giữ `descriptionImages` là danh sách ảnh và `promotions` là danh sách ưu đãi.
3. Render `technicalDescription`, ảnh mô tả và khuyến mãi ở trang chi tiết sản phẩm.
4. Dùng component ảnh hiện có để mở ảnh mô tả; không render HTML nguồn chưa sanitize.
5. Cập nhật preview admin import để người dùng thấy dữ liệu sau normalize.
6. Thêm test adapter và test UI cho dữ liệu có đủ, thiếu hoặc rỗng các field tùy chọn.

### Bước 5: Cập nhật asset pipeline

- Chuẩn hóa URL ảnh.
- Kiểm tra MIME, magic bytes, kích thước và URL an toàn.
- Tách main, gallery và description images.
- Ghi provider/account/key sau upload.
- Không xóa asset cũ khi upload mới hoặc validation mới chưa hoàn tất.

R2 account/bucket chỉ được chọn ở backend. Frontend không nhận access key hoặc secret; frontend chỉ nhận asset reference public do backend upload và kiểm tra.

### Bước 6: Chạy kiểm thử theo phạm vi

Từ thư mục `online-store-backend/python` có thể chạy unit test scraper bằng unittest discovery:

```bash
python -m unittest discover -p 'test_*.py'
```

Sau đó chạy test Node liên quan adapter/import theo script hiện có. Chỉ chạy test cần thiết cho thay đổi; không tự chạy `npm run build`.

### Bước 7: Dry-run batch

Trước khi import thật:

- Cào một brand/category nhỏ.
- Kiểm tra số record và số record bị cảnh báo.
- Kiểm tra tỷ lệ thiếu mô tả, ảnh mô tả và khuyến mãi.
- Kiểm tra duplicate SKU/URL.
- Kiểm tra JSON và CSV có cùng số record.
- Chạy normalize/validate ở chế độ không ghi MongoDB.
- So sánh trước/sau với một số sản phẩm mẫu.

### Bước 8: Rollout

- Chạy một batch nhỏ trước.
- Giữ output cũ và manifest, không xóa hoặc di chuyển tự động.
- Chỉ mở rộng toàn bộ brand/category sau khi batch nhỏ đạt ngưỡng chất lượng.
- Theo dõi lỗi network, rate limit, parser warnings, upload failures và import skips.
- Rollback bằng cách dừng batch mới và dùng output/manifest trước đó; không rollback bằng cách xóa hàng loạt asset.

## 12. Kế hoạch translation, multi-account và R2

Phần này là kế hoạch triển khai tiếp theo cho khoảng 1.000 sản phẩm. Chưa được coi là đã triển khai code cho đến khi từng tiêu chí nghiệm thu ở mục 12.11 đạt.

### 12.1. Quyết định đã chốt

- Dịch các text hiển thị của `technicalDescription`, `descriptionImages[].alt` và các text trong `promotions`.
- Giữ `technicalDescription` là plain text; không dịch HTML raw.
- Giữ nguyên URL, số lượng, giá trị tiền, SKU, ID và dữ liệu nghiệp vụ bất biến.
- `descriptionImages.url` giữ nguyên; chỉ dịch `alt`.
- `promotions.title`, `giftProductName`, `scope` và `discountText` được dịch.
- `promotions.type` dùng label/enum có kiểm soát; không để model tự đổi giá trị nghiệp vụ.
- Khi thiếu bản dịch, hiển thị source language; không ẩn sản phẩm và không chặn storefront chỉ vì field mới thiếu bản dịch.
- Ảnh sản phẩm, gallery và ảnh trong mô tả lưu trên Cloudflare R2 Standard.
- R2 access key/secret và Cloudflare AI token chỉ được backend đọc.

### 12.2. Trạng thái code hiện tại cần giữ đúng trong kế hoạch

- Cloudflare AI đã đọc được nhiều nhóm `CLOUDFLARE_ACCOUNT_ID_n`, `CLOUDFLARE_API_TOKEN_n`, `CLOUDFLARE_AI_MODEL_n` tại `online-store-backend/src/services/cloudflareAiService.js`.
- Cloudflare AI hiện mới xoay config khi nhận HTTP 429; chưa hoàn chỉnh cho HTTP 420, lỗi quota theo message, giới hạn vòng xoay và thống kê bền vững.
- R2 có biến môi trường nhiều account trong `online-store-backend/.env.example`; runtime chọn account theo role hoặc stable hash cho product asset.
- Translation cache, seeder và API đã có ba field mới; cần hoàn tất quality/integration test.
- Frontend adapter/type/UI đã giữ và hiển thị ba field mới; cần browser smoke test theo locale.
- Không chạy batch dịch hoặc upload R2 thật trước khi hoàn tất inventory/dry-run.

### 12.3. Giai đoạn 0 — Inventory và dry-run không gọi dịch

Tạo một báo cáo chỉ đọc từ MongoDB và filesystem/object source, không gọi Cloudflare AI và không upload R2:

1. Đếm product `isDeleted: false`.
2. Đếm product có từng field cần dịch.
3. Đếm tổng text `specs`, promotion và `descriptionImages[].alt`.
4. Đo độ dài description/technicalDescription để tính số chunk.
5. Đếm translation cache theo `targetLang` và trạng thái `approved`, `pending`, `failed`, `needs_retranslate`.
6. Đếm số ảnh chính, gallery, ảnh mô tả và tổng dung lượng dự kiến.
7. Kiểm tra trùng URL/hash ảnh.
8. Ghi số target language thực tế; không mặc định chạy toàn bộ language inventory nếu chưa được chọn.
9. Đọc usage/quota tổng hợp từ Cloudflare Dashboard/API; không ghi token vào report.

Báo cáo phải có `runId`, thời điểm, số liệu theo account/model và manifest input để có thể so sánh lần chạy sau.

### 12.4. Giai đoạn 1 — Chuẩn hóa pool Cloudflare AI

#### Env contract

Dùng nhóm biến đồng bộ theo hậu tố:

```text
CLOUDFLARE_ACCOUNT_ID_1
CLOUDFLARE_API_TOKEN_1
CLOUDFLARE_AI_MODEL_1

CLOUDFLARE_ACCOUNT_ID_2
CLOUDFLARE_API_TOKEN_2
CLOUDFLARE_AI_MODEL_2
```

Có thể dùng đến `_9` hoặc hơn nếu cần. Mỗi nhóm phải có đủ account ID và token; thiếu một thành phần thì config bị loại và phải ghi cảnh báo không chứa secret.

#### Quy tắc chọn và xoay

- Chọn account chính theo cấu hình rõ ràng, không chọn ngẫu nhiên.
- Chỉ xoay khi provider trả HTTP 420, HTTP 429 hoặc thông báo rate limit/quota đã được nhận diện chắc chắn.
- Lỗi 400 do payload, 401/403 do xác thực, 404 do model/account và lỗi dữ liệu phải dừng ngay, không xoay account.
- Mỗi request có tối đa số lần retry và số vòng xoay hữu hạn; nếu tất cả config thất bại thì đưa job về trạng thái retryable và dừng batch có kiểm soát.
- Không tự động phân tán request giữa nhiều account chỉ để né quota.
- Không tự động di chuyển dữ liệu hoặc asset cũ khi đổi account.

#### Tối ưu request

- Cache theo `sourceTextHash + sourceLang + targetLang + field + schemaVersion + model`.
- Dedupe text giống nhau giữa các sản phẩm trước khi gọi model.
- Dịch theo field có cấu trúc; không gửi URL, số tiền hoặc ID vào phần cần dịch.
- Giữ chunk description dưới giới hạn context của model và thêm kiểm tra độ dài sau khi dịch.
- Concurrency thấp ở giai đoạn đầu; chỉ tăng sau khi theo dõi 429, latency và usage.
- Lưu attempt, config index, model, target language, thời lượng và kết quả; không lưu token.

### 12.5. Giai đoạn 2 — Translation schema và quality

Mở rộng `ProductCatalogTranslationCache` với:

```json
{
  "technicalDescription": "...",
  "descriptionImages": [
    { "url": "https://...", "alt": "..." }
  ],
  "promotions": [
    {
      "type": "Gift",
      "title": "...",
      "giftQuantity": 1,
      "giftProductName": "...",
      "giftProductUrl": "https://...",
      "giftValueVND": 0,
      "scope": "...",
      "discountText": "..."
    }
  ]
}
```

- `url`, `giftProductUrl`, số lượng và giá trị phải được kiểm tra invariant với source.
- Plain text phải được sanitize trước khi gửi và sau khi nhận.
- Numeric token, phần trăm, đơn vị tiền và thông số kỹ thuật phải được kiểm tra không bị thay đổi.
- Bổ sung các field mới vào seeder, retranslate, completeness check, quality report và invalidation khi source thay đổi.
- Thiếu bản dịch field tùy chọn không làm product mất `storefrontReady`; phải ghi metric thiếu bản dịch để theo dõi.
- Không lưu HTML chưa sanitize vào translation cache.

### 12.6. Giai đoạn 3 — R2 adapter và metadata asset

Dùng R2 Standard cho ảnh truy cập thường xuyên. Mỗi asset sau upload phải giữ tối thiểu:

```json
{
  "sourceUrl": "https://...",
  "storageProvider": "r2",
  "storageAccount": "1",
  "bucket": "product-assets",
  "storageKey": "products/{identityHash}/{role}/{contentHash}.webp",
  "publicUrl": "https://...",
  "alt": "..."
}
```

Quy tắc upload:

Ảnh sản phẩm được tổ chức theo prefix logic để dễ quản lý:

```text
products/{identityHash}/main/{contentHash}.ext
products/{identityHash}/gallery/{contentHash}.ext
products/{identityHash}/description/{contentHash}.ext
```

Upload chưa gắn product dùng prefix `incoming/{role}/{ownerId}`; banner/about dùng prefix riêng theo entity. R2 không có thư mục vật lý, các prefix trên chỉ là object key.

1. Backend chọn account/bucket; frontend không được chọn storage account.
2. Tách role `main`, `gallery` và `description`.
3. Kiểm tra URL nguồn, MIME, magic bytes, kích thước và content type.
4. Dedupe theo content hash; retry không tạo object khác nếu nội dung giống nhau.
5. Upload thành công rồi mới cập nhật Product reference.
6. Ghi `storageProvider`, `storageAccount`, `bucket`, `storageKey`, `publicUrl` cùng metadata.
7. Không xóa asset cũ khi asset mới chưa upload và verify thành công.
8. Không tự động di chuyển asset cũ từ provider/account cũ.
9. Có manifest object theo batch để retry và audit.
10. Signed URL chỉ có thời hạn phù hợp nếu asset không public; secret không bao giờ đi qua frontend.

Với khoảng 1.000 sản phẩm, cần dự trù khoảng 3–30 GB tùy số lượng/kích thước ảnh. R2 Standard phù hợp hơn Infrequent Access vì ảnh storefront được đọc thường xuyên.

### 12.7. Giai đoạn 4 — API và frontend

#### Backend/API

- Mở rộng API product translation để trả ba field mới.
- Đồng bộ backend overlay với endpoint `/products/:id/translations`.
- Cập nhật `createProduct`/`updateProduct` nếu CRUD trực tiếp cần nhận field mới.
- Trả schema camelCase ổn định; không trả selector nguồn, token hoặc thông tin bí mật.
- Fallback từng field về source, không thay thế toàn bộ product bằng một bản dịch không đầy đủ.

#### Frontend

- Bổ sung field vào `BackendProduct`, `Laptop`, Zod schema và `ProductAdapter`.
- Render technical description dạng plain text.
- Render ảnh mô tả với `alt` theo locale và URL do backend cung cấp.
- Render promotion theo structured data; format số/tiền ở frontend nhưng không sửa giá trị source.
- Không dùng `dangerouslySetInnerHTML` cho dữ liệu scraper.
- Thêm test cho source locale, target locale, missing translation và dữ liệu legacy.

### 12.8. Giai đoạn 4.5 — Đồng bộ import, export và backup

#### Trạng thái hiện tại

- `JSONAdapter`, `CSVAdapter` và `BaseImportAdapter` đã normalize các field `technicalDescription`, `descriptionImages` và `promotions`.
- JSON/CSV validator đã xử lý array/object và có giới hạn dữ liệu mới.
- ZIP import yêu cầu đúng một `products.json` hoặc `products.csv`, kiểm tra path, kích thước, compression ratio và asset entry.
- Export CSV đã có header cho ba field mới và serialize array/object thành JSON; export JSON giữ structured data.
- Luồng export asset hiện chủ yếu gom `product.images`; cần bổ sung role và asset manifest riêng cho `descriptionImages`.
- Backup hiện có script cho `LiveTranslationCache`, chưa phải backup đầy đủ cho Product, `ProductCatalogTranslationCache`, R2 metadata và object manifest.
- Import/export ZIP dùng provider R2; manifest cần giữ role, provider, account, bucket và storage key trước rollout.

#### Import contract

Mọi đường import phải đi qua cùng một normalize/validate contract:

1. Scraper JSON canonical dùng làm source of truth.
2. JSON import giữ nguyên array/object.
3. CSV serialize/parse JSON hợp lệ cho `descriptionImages` và `promotions`; không dùng delimiter `||` để biểu diễn structured data.
4. ZIP chỉ có một data entry ở root: `products.json` hoặc `products.csv`.
5. Asset ZIP chỉ nằm dưới `assets/images/`; cần mở rộng manifest để phân biệt `main`, `gallery`, `description`.
6. Không cho frontend bypass validator hoặc gửi storage account/secret.
7. Import dry-run phải kiểm tra cả field mới, asset reference, duplicate SKU/source URL và translation metadata nếu có.

#### Export contract

JSON, CSV và ZIP phải round-trip được các field mới:

```text
technicalDescription
 descriptionImages[]: url, alt, sourceUrl/publicUrl/storage metadata nếu có
promotions[]: type, title, gift fields, scope, discountText
```

Quy tắc:

- JSON giữ object/array đúng kiểu.
- CSV quote và serialize JSON UTF-8 hợp lệ.
- URL public không được thay thế source URL nếu chưa ghi rõ metadata.
- Export ZIP phải tạo manifest gồm product ID, role, source URL, asset path, content hash, storage account/provider và trạng thái tải asset.
- Nếu một ảnh lỗi, không làm sai toàn bộ row; phải ghi warning và thống kê asset thiếu.
- Import lại ZIP phải map asset path về đúng field/role, upload lên R2 theo policy và chỉ commit Product reference sau khi upload thành công.
- Export có translation phải ghi rõ locale, source locale, translation status và snapshot/version; không trộn bản dịch vào source field một cách không truy vết được.

#### Backup trước migration/seed/import commit

Trước khi mở rộng schema hoặc chạy batch thật, tạo backup độc lập:

1. Snapshot Product source, gồm ba field mới và các field identity.
2. Snapshot `ProductCatalogTranslationCache`.
3. Backup `LiveTranslationCache` trước khi migrate hoặc thay đổi policy.
4. Backup manifest asset của main/gallery/description, gồm provider/account/bucket/key/public URL/hash.
5. Lưu export ZIP/JSON có checksum và `runId`.
6. Lưu cấu hình model/target languages/schema version; không lưu API token/secret.
7. Kiểm tra restore thử trên database/bucket staging trước khi commit production.
8. Giữ backup cũ theo retention; không ghi đè backup bằng tên cố định.

Backup phải có manifest dạng tối thiểu:

```json
{
  "runId": "...",
  "createdAt": "...",
  "schemaVersion": "product-schema-v2",
  "sourceLanguage": "vi",
  "targetLanguages": ["en"],
  "collections": ["Product", "ProductCatalogTranslationCache"],
  "assetManifest": "assets.manifest.json",
  "checksums": {}
}
```

Không xóa `LiveTranslationCache` hoặc asset cũ sau khi backup; chỉ cleanup sau khi restore test và đối soát checksum thành công.

#### Kiểm thử import/export/backup

- Import JSON/CSV có đủ ba field mới.
- CSV export rồi import lại không làm mất array/object, số tiền, URL hoặc enum.
- ZIP export → validate → import dry-run giữ đúng field/role asset.
- ZIP có ảnh mô tả lỗi vẫn tạo report rõ ràng và không ghi reference hỏng.
- Backup → restore Product source, translation cache và manifest trên staging.
- Restore không đưa secret vào database, report hoặc file export.
- Kiểm tra checksum trước/sau cho data file và asset manifest.
- Kiểm tra rollback sau import commit thất bại giữa chừng.

### 12.9. Giai đoạn 5 — Chạy batch, giám sát và rollback

Chạy theo thứ tự:

1. Inventory không gọi provider.
2. Test một vài sản phẩm với một target language.
3. Batch thử 10–20 sản phẩm.
4. Batch theo brand/category nhỏ.
5. Chỉ mở rộng lên khoảng 1.000 sản phẩm sau khi đạt ngưỡng chất lượng.

#### Quy trình seed an toàn

Không chạy full seed trực tiếp cho batch 1.000 sản phẩm. Dùng thứ tự sau:

1. Xem danh sách module và phase trước khi chạy:

   ```bash
   npm run seed:list
   npm run seed:modules
   ```

2. Chạy dry-run để kiểm tra luồng seed, không ghi Product và không gọi AI:

   ```bash
   npm run seed:dry-run
   ```

   Dry-run vẫn cần `MONGO_URI` và cấu hình runtime hợp lệ; không được hiểu là test offline hoàn toàn.

3. Kiểm tra riêng tầng i18n trước khi đụng product:

   ```bash
   npm run seed -- --i18n-only --dry-run
   npm run check:language-inventory
   npm run check:translation-keys
   npm run check:translation-consistency
   npm run check:translation-fallback
   ```

4. Chạy incremental cho phần còn thiếu, giới hạn rõ target language:

   ```bash
   npm run seed -- --incremental --languages=en --batch-size=10
   ```

   `--incremental` chỉ xử lý phần thiếu theo policy hiện tại. `--batch-size` điều khiển batch pipeline sản phẩm, không phải số request AI; throughput AI vẫn do queue, concurrency, throttle và cache quyết định.

5. Chạy theo phase khi dữ liệu product đã sẵn sàng:

   ```bash
   npm run seed:pre-products
   npm run seed:post-products
   ```

   `post-products` chỉ chạy khi Product đã import thành công và cần tạo dữ liệu phụ thuộc như reviews, orders, coupons hoặc spec translations.

6. Chỉ sau khi batch nhỏ đạt tiêu chí mới chạy các target language tiếp theo và mở rộng brand/category. Mỗi lần chạy phải ghi `runId`, config/model, target language, số insert/update/skip/fail và trạng thái translation/R2.

7. Không chạy `npm run seed` full trên production nếu chưa có backup, manifest, quota baseline, thời gian rollback và giới hạn batch rõ ràng.

#### Ma trận test bắt buộc

| Nhóm | Phạm vi | Cách chạy/kiểm tra | Điều kiện |
|---|---|---|---|
| Python scraper | Selector, lazy-load image, dedupe, promotion, canonical 16 fields | `python -m unittest discover -p 'test_*.py'` từ `online-store-backend/python` | Không gọi network thật; dùng fixture/mock |
| JavaScript syntax | Service, seeder, adapter, controller đã chỉnh | `node --check <file>` | Không cần Mongo hoặc AI |
| Import/normalize | JSON, CSV, legacy key, array/object mới, validator | Test adapter/import hiện có và bổ sung case field mới | Không ghi production DB |
| Translation unit | Cache key, field mapping, fallback, completeness, quality | `npm run test:all -- --list`, sau đó chạy suite translation phù hợp | Có fixture source/target, không gọi provider thật |
| Cloudflare pool | 420/429/quota xoay; 400/401/403/404 không xoay; hết config dừng | Mock Axios/provider response | Không dùng token thật trong test |
| Translation seed | Incremental, retry, chunk 6.000 ký tự, cache hit/miss, multi-language | Chạy trên Mongo test/staging với batch 10–20 | Có quota baseline và report |
| R2 adapter | Chọn account, object key/hash, metadata, retry/idempotency, rollback | Mock S3/R2 hoặc bucket staging riêng | Không xóa object production |
| API contract | Product list/detail/translation trả camelCase và field mới | Test API backend + fixture response | Kiểm tra source locale và target locale |
| Frontend adapter | Zod giữ đủ field mới, legacy không lỗi | Type-check/test adapter theo tooling frontend | Frontend hiện chưa có test script tự động |
| Frontend UI | Plain text, alt, promotions, fallback source, không raw HTML | Browser smoke test sau khi code triển khai | Kiểm tra locale vi và locale đích |
| Regression | Import/export, storefrontReady, currency, gallery cũ | `npm run test:import:export:dynamic` và suite liên quan | Chạy dry-run trước commit import |

Các test integration phải dùng database/staging riêng. Không dùng `npm run build`; test UI cần chạy dev server và kiểm tra golden path sau khi frontend được triển khai.

#### Thứ tự test trước mỗi rollout

```text
1. node --check các file thay đổi
2. Python scraper fixture tests
3. Adapter/validator/import unit tests
4. Translation unit + Cloudflare pool mock tests
5. R2 adapter mock/staging tests
6. API integration source/target locale
7. Import/export regression dry-run
8. Browser smoke test frontend
9. Batch 10–20 sản phẩm trên staging
10. Review report rồi mới mở rộng batch
```

#### Tiêu chí dừng seed

Dừng ngay và không xoay vòng vô hạn khi:

- Có lỗi 400, 401, 403, 404 hoặc payload/schema không hợp lệ.
- Tất cả Cloudflare config đều trả 420/429/quota sau giới hạn retry.
- Tỷ lệ translation fail hoặc asset upload fail vượt ngưỡng đã chốt trong report.
- Có product bị ghi thiếu identity, ghi đè dữ liệu tốt hoặc mất field source.
- Có mismatch giữa manifest R2 và reference trong Product.
- Test contract API/frontend làm mất field mới.

Theo dõi tối thiểu:

- Request/attempt theo Cloudflare config và model.
- 420/429/quota, 401/403, 404, 5xx và timeout.
- Neurons/token usage và chi phí theo kỳ.
- Cache hit/miss.
- Số translation thiếu hoặc cần dịch lại.
- Số ảnh upload thành công/thất bại/trùng.
- Dung lượng và số object R2.
- Insert/update/skip/fail của import.

Rollback phải là rollback manifest/reference của batch, không xóa hàng loạt asset. Dừng batch mới, giữ output cũ và chỉ khôi phục reference đã xác định chắc chắn.

### 12.10. Dự đoán lỗi và cách xử lý

| Mức | Lỗi | Nguyên nhân | Cách xử lý |
|---|---|---|---|
| P0 | Xoay config vô hạn | Tất cả account cùng trả 429 | Giới hạn vòng xoay, chuyển job sang retryable và dừng |
| P0 | Dùng sai account/token | Nhóm env thiếu hoặc lệch hậu tố | Validate nhóm trước khi chạy, không fallback chéo token |
| P0 | Lộ secret | Gửi token vào frontend/log/report | Backend-only, redact log, chỉ báo `hasToken` |
| P0 | Mất asset mới | Cập nhật Product trước khi upload/verify | Upload atomic, cập nhật reference sau cùng |
| P0 | Xóa nhầm asset cũ | Cleanup trước khi batch thành công | Không cleanup tự động, dùng manifest |
| P0 | Ghi đè bản dịch tốt | Source thay đổi một phần hoặc batch lỗi | Invalidation theo field, upsert có kiểm tra completeness |
| P1 | 429 liên tục | Batch quá nhanh hoặc quota thấp | Giảm concurrency, backoff có jitter, kiểm tra Dashboard |
| P1 | 401/403 bị xoay sai | Token hết hạn hoặc permission thiếu | Dừng ngay config đó, không coi là rate limit |
| P1 | Model 404/deprecated | Model không còn khả dụng | Dừng batch, kiểm tra model mapping và migration có chủ đích |
| P1 | Dịch sai số/URL | Gửi structured data như text tự do | Tách text khỏi numeric/URL, invariant validation |
| P1 | Mô tả gây XSS | Giữ HTML raw từ scraper | Plain text hoặc AST sanitize nghiêm ngặt |
| P1 | Ảnh trùng nhiều lần | Retry không có content hash | Key theo hash, idempotency và manifest |
| P1 | R2 403/404 | Sai bucket/account hoặc permission | Kiểm tra config theo account, fail ngay và giữ source reference |
| P1 | Frontend mất field mới | Zod schema chưa khai báo | Contract test API-to-adapter trước rollout |
| P1 | Product biến mất khỏi storefront | Completeness coi field tùy chọn là bắt buộc | Fallback theo field, không chặn vì field mới thiếu |
| P2 | Cache phình lớn | Dịch lại cùng text nhiều lần | Cache theo hash/model/schema version và báo cáo hit rate |
| P2 | Stats sai sau restart | Counter chỉ lưu memory | Ghi usage/attempt vào persistent log hoặc metrics store |
| P2 | Lệch locale | List và detail dùng hai flow overlay | Dùng chung response contract và regression test hai endpoint |
| P2 | R2 tốn hơn dự kiến | Ảnh gốc quá lớn hoặc nhiều bản resize | Giới hạn kích thước, nén hợp lý, đo dung lượng trước batch |

### 12.11. Tiêu chí hoàn tất

Chỉ coi kế hoạch đã triển khai khi:

- Có inventory report và quota baseline.
- Multi-config Cloudflare xử lý đúng 420/429/quota, không xoay với lỗi xác thực/dữ liệu và không loop vô hạn.
- Translation cache/API/frontend giữ đủ ba field mới.
- R2 upload được ba role asset và lưu đúng metadata account/key.
- Retry không tạo object trùng hoặc mất reference.
- Batch nhỏ đạt kiểm tra chất lượng và không làm mất product khỏi storefront ngoài policy.
- Có báo cáo usage, translation, asset và import theo `runId`.
- Có manifest/rollback và test cho các lỗi P0/P1.
- Chỉ chạy test cần thiết; không tự chạy `npm run build`.

## 12.12. Rà soát blocker trước seed và upload R2

Các vấn đề đã xác nhận hoặc cần xử lý trước rollout được tổng hợp tại `md/ASSET_STORAGE_CLOUDINARY_R2_RISK_REGISTER.md`.

| Mức | Vấn đề | Trạng thái |
|---|---|---|
| P0 | `r2AssetService.js` dùng `crypto.createHash()` nhưng cần xác nhận import `crypto` trước stable-hash selection | Chưa sửa |
| P0 | Full seed chạy `aboutMedia` trước crawler; cần `MONGO_URI`, R2 group đầy đủ và hero source | Chưa runtime verify |
| P1 | R2 có account selection theo role/hash nhưng chưa có quota tracking hoặc failover theo rate limit | Chưa hoàn tất |
| P1 | Upload, Product commit, cleanup và manifest chưa được chứng minh atomic toàn batch | Chưa hoàn tất |
| P1 | ZIP/export manifest cho `description` chưa đồng nhất với main/gallery | Chưa hoàn tất |
| P2 | Không có output scraper trong workspace; full seed sẽ cào lại nếu không truyền input | Đã xác định |
| P2 | Dry-run bỏ qua crawler/R2 nhưng vẫn cần file input và MongoDB | Đã xác định |
| P2 | Giới hạn 5 MiB đang dùng chung cho asset có cả video; cần policy riêng nếu upload hero video lớn | Cần kiểm tra |

Quy tắc vận hành trước khi sửa code:

- Không rotation account cho lỗi xác thực, bucket/account sai, MIME, chữ ký hoặc dữ liệu không hợp lệ.
- Chỉ retry/rotation khi provider xác nhận rate limit/quota hoặc lỗi tạm thời được nhận diện rõ và luôn có giới hạn attempt.
- Không xóa hoặc di chuyển asset cũ nếu asset mới chưa upload, verify và ghi reference thành công.
- Chỉ chạy test cần thiết; không tự chạy `npm run build`.

## 13. Kết luận

Bộ tên `Product...` là nhất quán và tránh được các key chung như `ID`, `Name`, `Description`, `URL` và `Images`. Phần extractor, staging envelope, output schema, adapter normalize, validator, Product model, API, translation và frontend đã được nối theo contract. Lệnh `npm run seed` hiện chạy full pipeline A–Z theo phase; crawler chỉ chạy lại khi thêm `--force-scrape` hoặc chưa có output.

Luồng upload R2 cho ảnh trong mô tả đã được nối vào seed/import và metadata asset; migration các asset Cloudinary cũ, asset manifest/backup đầy đủ và dry-run batch thật vẫn là điều kiện trước rollout diện rộng.

Triển khai an toàn tiếp theo là chạy fixture/unit test, dry-run một batch nhỏ và kiểm tra dữ liệu trước khi upsert diện rộng. Tầng crawler chỉ chịu trách nhiệm lấy dữ liệu; storage, database và frontend phải dùng contract riêng và không phụ thuộc trực tiếp vào HTML của GearVN.
