# Chuẩn schema dữ liệu sản phẩm từ scraper

## 1. Phạm vi

Tài liệu này ghi nhận bộ key sản phẩm dự kiến sau khi bổ sung:

- Mô tả sản phẩm dạng bài viết.
- Ảnh nằm bên trong mô tả sản phẩm.
- Khuyến mãi và quà tặng đi kèm.

Tài liệu này đồng thời ghi nhận phần triển khai schema đã thực hiện ở scraper Python, adapter import, validator và Product model. Luồng upload asset mô tả lên Cloudinary/R2 riêng vẫn chưa được bật.

## 2. Trạng thái hiện tại

Trước thay đổi, scraper xuất 13 key cũ. Hiện record mới đã chuyển sang bộ 16 key canonical; adapter vẫn giữ khả năng đọc file legacy để không làm hỏng dữ liệu cũ.

Các file scraper chính:

- `online-store-backend/python/scraper_paths.py`
- `online-store-backend/python/scraper_runner.py`

Adapter Node tại đây hỗ trợ cả bộ key canonical mới và các key legacy như `Name`, `Brand`, `ID`, `Description`, `MainImage` và `GalleryImages`:

- `online-store-backend/src/utils/importAdapters/BaseImportAdapter.js`

Vì vậy, chỉ đổi tên key trong Python mà không cập nhật adapter sẽ làm dữ liệu không được normalize đúng khi import.

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

Mỗi batch nên có metadata riêng:

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

Xử lý riêng ba nhóm asset:

```text
ProductMainImage
ProductGalleryImages
ProductDescriptionImages
```

Sau khi upload, reference asset cần giữ tối thiểu:

```json
{
  "sourceUrl": "https://...",
  "storageProvider": "cloudinary",
  "storageAccount": "1",
  "storageKey": "...",
  "publicUrl": "https://...",
  "alt": "..."
}
```

`storageProvider`, `storageAccount` và `storageKey` phải được lưu cùng metadata sản phẩm để tạo URL, kiểm tra và xóa đúng tài khoản. Không tự động di chuyển hoặc xóa asset cũ chỉ vì thêm provider mới.

Cloudinary vẫn phải giữ nguyên quy tắc chọn account theo backend. R2 hiện mới có cấu hình môi trường, chưa được coi là provider upload cho đến khi có adapter và test riêng.

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

API chỉ trả schema nội bộ camelCase. Frontend không được biết selector GearVN, key `Product...`, Cloudinary account hay R2 secret.

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

### Bước 5: Cập nhật asset pipeline

- Chuẩn hóa URL ảnh.
- Kiểm tra MIME, magic bytes, kích thước và URL an toàn.
- Tách main, gallery và description images.
- Ghi provider/account/key sau upload.
- Không xóa asset cũ khi upload mới hoặc validation mới chưa hoàn tất.

Cloudinary multi-account và R2 chỉ được chọn ở backend. Frontend không nhận secret; nếu sau này có upload trực tiếp thì frontend chỉ nhận chữ ký, public key và endpoint cần thiết.

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

## 12. Kết luận

Bộ tên `Product...` là nhất quán và tránh được các key chung như `ID`, `Name`, `Description`, `URL` và `Images`. Phần extractor, output schema, adapter normalize, validator, Product model và import guide đã được cập nhật. Luồng upload riêng cho ảnh trong mô tả chưa được bật; hiện các URL ảnh mô tả được validate và lưu reference.

Triển khai an toàn tiếp theo là chạy fixture/unit test, dry-run một batch nhỏ và kiểm tra dữ liệu trước khi upsert diện rộng. Tầng crawler chỉ chịu trách nhiệm lấy dữ liệu; storage, database và frontend phải dùng contract riêng và không phụ thuộc trực tiếp vào HTML của GearVN.
