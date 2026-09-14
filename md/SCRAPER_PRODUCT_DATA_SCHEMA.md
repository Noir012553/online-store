# Chuẩn schema dữ liệu sản phẩm từ scraper

## 1. Phạm vi

Tài liệu này ghi nhận bộ key sản phẩm dự kiến sau khi bổ sung:

- Mô tả sản phẩm dạng bài viết.
- Ảnh nằm bên trong mô tả sản phẩm.
- Khuyến mãi và quà tặng đi kèm.

Tài liệu chỉ chốt schema và rủi ro. Chưa thay đổi scraper Python, adapter import hoặc model MongoDB.

## 2. Trạng thái hiện tại

Scraper hiện vẫn xuất 13 key cũ trong:

- `online-store-backend/python/scraper_paths.py`
- `online-store-backend/python/scraper_runner.py`

Adapter Node hiện cũng đang đọc trực tiếp các key cũ như `Name`, `Brand`, `ID`, `Description`, `MainImage` và `GalleryImages` tại:

- `online-store-backend/src/utils/importAdapters/BaseImportAdapter.js`

Vì vậy, chỉ đổi tên key trong Python mà không cập nhật adapter sẽ làm dữ liệu không được normalize đúng khi import.

## 3. Bộ key chuẩn độc nhất

Bộ key canonical dự kiến gồm 16 key. Tất cả đều có tiền tố `Product` để tránh tên chung và tránh va chạm nghĩa:

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

## 8. Kết luận

Bộ tên `Product...` là nhất quán và tránh được các key chung như `ID`, `Name`, `Description`, `URL` và `Images`. Tuy nhiên, schema mới chưa được triển khai trong code. Rủi ro lớn nhất là đổi output Python mà không cập nhật adapter Node, khiến dữ liệu mới không được import đúng. Vì vậy cần triển khai theo một thay đổi đồng bộ, có fixture HTML và test trước khi chạy trên batch sản phẩm thật.
