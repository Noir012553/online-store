# Đặc tả ETL nhập sản phẩm Tiki vào hệ thống

**Trạng thái:** Đặc tả kỹ thuật / Chưa triển khai code  
**Phiên bản:** 2.0  
**Ngày cập nhật:** 2025-01-01  
**Nguồn dữ liệu:** File JSON sản phẩm được crawl từ Tiki  
**Mục tiêu:** Chuẩn hóa dữ liệu Tiki thành Product nội bộ, kiểm soát chất lượng dữ liệu, hỗ trợ import/upsert an toàn và không phụ thuộc vào `productSeeder` GearVN.

---

## 1. Mục tiêu và phạm vi

Tài liệu này mô tả thiết kế đầy đủ cho quy trình:

```text
Snapshot và inventory dữ liệu cũ
→ Preview cleanup Product GearVN + Cloudinary
→ Xác nhận cleanup trong môi trường được phép reset
→ Xóa Product cũ và asset Cloudinary thuộc phạm vi
→ Seed dữ liệu nền không có Product seeder từ API nguồn ngoài
→ Preflight database
→ Transformer / Normalizer
→ Clean products + Rejected products + Report
→ Dry-run import
→ Import upsert thật
→ Kiểm tra dữ liệu
→ Seed các module phụ thuộc Product
```

Phạm vi bao gồm:

- Đọc dữ liệu sản phẩm từ file JSON Tiki.
- Chuẩn hóa các field của Tiki sang schema `Product` nội bộ.
- Ánh xạ category Tiki sang category nội bộ.
- Kiểm tra supplier đã tồn tại trong database.
- Xử lý sản phẩm configurable và flatten variant.
- Xử lý listing của seller hiện tại.
- Xác định source identity để import lại không tạo dữ liệu trùng.
- Kiểm tra giá, ảnh, mô tả, brand, tồn kho và currency.
- Sanitize HTML description từ nguồn bên ngoài.
- Xuất danh sách sản phẩm hợp lệ, sản phẩm bị reject và báo cáo thống kê.
- Mở rộng backend schema, validator và logic upsert.
- Tách seed nền, import Product và seed dữ liệu phụ thuộc.

Không nằm trong phạm vi giai đoạn đầu:

- Đồng bộ tồn kho theo thời gian thực với Tiki.
- Đồng bộ đơn hàng hoặc giá theo lịch tự động.
- Mô hình marketplace nhiều seller cho cùng một Product.
- Thiết kế hệ thống variant đầy đủ trong frontend/database.
- Tự động tải ảnh Tiki về Cloudinary: đã bổ sung pipeline upload khi import thật, chỉ chấp nhận HTTPS từ `*.tikicdn.com`, giới hạn kích thước, retry/concurrency, lưu `imagePublicId`/gallery public IDs và dọn ảnh mới nếu import database thất bại. Dry-run không upload ảnh.
- Tự động tạo category hoặc supplier mới trong lúc import.
- Xóa dữ liệu Product/asset Cloudinary ngoài phạm vi reset đã được preview và xác nhận.
- Thay thế hoàn toàn cơ chế export/import hiện tại trước khi identity mới ổn định.

---

## 2. Bối cảnh hiện tại

### 2.1. Vấn đề của full seed hiện tại

`npm run seed` đang bao gồm module `products`. Module này sử dụng `productSeeder`, trong đó có logic lấy dữ liệu từ các endpoint GearVN. Khi endpoint bên ngoài trả về lỗi, ví dụ HTTP 404, full seed bị dừng.

Dự án đã có chức năng import/export Product dành cho admin, vì vậy không nên tiếp tục phụ thuộc vào `productSeeder` bên ngoài để tạo dữ liệu sản phẩm ban đầu.

### 2.2. Registry seed hiện tại

Registry hiện tại nằm tại:

```text
online-store-backend/src/seeds/seedRegistry.js
```

Các module liên quan gồm:

| Module | Dependency hiện tại |
| --- | --- |
| `products` | `users`, `categories`, `suppliers` |
| `reviews` | `products`, `users` |
| `orders` | `products`, `users`, `customers`, `currencies` |
| `coupons` | `products`, `categories` |
| `specTranslations` | `products` |

Cơ chế `--only-module` hiện tại chỉ bỏ qua dependency trong lúc vận hành. Nó chưa biểu diễn đầy đủ khái niệm Product đã được tạo từ giao diện admin import.

### 2.3. Dữ liệu Product cũ cần reset

Trước khi sử dụng riêng bộ dữ liệu Tiki, môi trường đích phải được dọn khỏi các Product cũ được tạo từ GearVN hoặc product seed cũ. Đây là một **destructive reset**, không phải thao tác import thông thường.

Mục tiêu của reset:

- Không để Product GearVN cũ trộn với Product Tiki.
- Không để Product cũ tiếp tục được tham chiếu bởi seed reviews/orders/coupons mới.
- Dọn các asset Cloudinary thuộc Product cũ.
- Bắt đầu bộ dữ liệu Product mới với source identity `TIKI`.

Phạm vi reset mặc định:

```text
Product legacy thuộc source profile đã được inventory
→ Các dữ liệu phụ thuộc được xác định trước
→ Cloudinary public IDs thuộc các Product đó
```

Không được hiểu là:

```text
Xóa toàn bộ collection products
Xóa toàn bộ Cloudinary account/folder
Xóa banner, category image, about media hoặc asset dùng chung
```

Do Product schema hiện tại chưa có `source = GEARVN` rõ ràng, bước đầu tiên phải tạo inventory để xác định chính xác các record cũ. Không được dùng `deleteMany({})` hoặc xóa toàn bộ asset theo folder nếu chưa có danh sách mục tiêu.

### 2.4. Nguyên tắc an toàn cho reset

Reset Product/Cloudinary chỉ được chạy khi thỏa tất cả điều kiện:

1. Môi trường được phép reset, mặc định là development hoặc staging.
2. Đã tạo snapshot/backup database.
3. Đã xuất danh sách Product mục tiêu và số lượng record.
4. Đã xuất danh sách review/order/coupon/cache liên quan.
5. Đã xuất danh sách Cloudinary public ID sẽ xóa.
6. Đã kiểm tra không có public ID dùng chung với asset ngoài Product.
7. Đã chạy cleanup preview/dry-run.
8. Có xác nhận rõ ràng trước thao tác xóa thật.
9. Có log thao tác, thời gian, người thực hiện và kết quả.

Production không được reset theo quy trình này nếu chưa có quy trình backup, phê duyệt và rollback riêng.

### 2.5. Inventory trước khi xóa

Cleanup phải tạo một manifest bất biến trước khi xóa:

```text
product-cleanup-inventory.json
cloudinary-cleanup-inventory.json
cleanup-report.json
```

`product-cleanup-inventory.json` cần có tối thiểu:

```json
{
  "environment": "staging",
  "generatedAt": "2025-01-01T00:00:00.000Z",
  "sourceProfile": "legacy-gearvn",
  "productIds": [],
  "productCount": 0,
  "evidence": []
}
```

Mỗi Product mục tiêu cần có:

- Mongo `_id`.
- `name`.
- `brand`.
- `image`.
- `images`.
- `imagePublicId` nếu có.
- `createdAt`.
- `updatedAt`.
- Lý do được đưa vào phạm vi cleanup.

Nếu không xác định được Product là GearVN bằng evidence đáng tin cậy, record phải được đưa vào danh sách `ambiguous` và không được xóa tự động.

### 2.6. Xác định Product GearVN

Vì Product legacy có thể chưa có `source`, việc nhận diện phải dựa trên profile và evidence cụ thể, ví dụ:

- Manifest được tạo từ lần chạy product seeder cũ.
- Danh sách Product được tạo trong lần reset trước.
- Metadata/mapping đã được lưu trong database.
- Dấu vết nguồn GearVN đã được ghi nhận trong audit hoặc migration data.
- Danh sách `_id` do người vận hành xác nhận sau khi xem inventory.

Không được coi các tiêu chí sau là bằng chứng đủ mạnh nếu đứng riêng lẻ:

- Chỉ dựa vào tên sản phẩm.
- Chỉ dựa vào brand.
- Chỉ dựa vào việc ảnh là URL bên ngoài.
- Chỉ dựa vào thời gian tạo.

Nếu toàn bộ Product trong môi trường được xác nhận là dữ liệu GearVN, vẫn phải xuất inventory và kiểm tra số lượng trước khi xóa. Câu lệnh xóa thật phải nhận danh sách `_id` hoặc manifest đã phê duyệt, không nhận điều kiện rỗng có thể xóa toàn collection.

### 2.7. Dữ liệu phụ thuộc Product

Xóa Product có thể để lại hoặc làm hỏng các quan hệ:

```text
Review.product
Order.items[].product
Coupon.applicableProducts[]
ProductCatalogTranslationCache.entityId
UserContentTranslationCache hoặc cache liên quan
```

Trước khi cleanup phải quyết định profile dữ liệu phụ thuộc:

#### Profile reset development/staging

- Xóa reviews thuộc Product mục tiêu.
- Xóa hoặc xử lý coupons có `applicableProducts` thuộc Product mục tiêu.
- Xử lý orders theo chính sách môi trường demo; không xóa mù order history nếu cần giữ báo cáo.
- Xóa cache translation liên quan.
- Kiểm tra không còn reference Product cũ sau cleanup.

#### Profile giữ lịch sử orders

- Không xóa orders.
- Giữ snapshot thông tin line item theo schema hiện tại nếu có.
- Soft-delete Product để reference trong order vẫn hợp lệ nhưng không xuất hiện trong storefront.
- Không chạy seed orders cũ nếu chúng trỏ vào Product đã bị reset.

Profile mặc định cho việc chuyển toàn bộ demo data sang Tiki cần được chốt trước khi thực hiện. Không tự động xóa order history chỉ vì muốn xóa Product.

### 2.8. Dọn Cloudinary

Chỉ xóa Cloudinary asset thuộc Product mục tiêu đã được inventory.

Nguồn public ID được phép dùng:

```text
Product.imagePublicId
Product image public IDs đã được lưu trong manifest
Asset mapping được xác nhận bằng Cloudinary metadata
```

Không được suy đoán public ID từ URL bằng cách cắt chuỗi tùy ý nếu không có quy tắc mapping chắc chắn.

Trước khi xóa:

1. Thu thập toàn bộ `imagePublicId` của Product mục tiêu.
2. Loại duplicate.
3. Kiểm tra public ID có được asset khác tham chiếu không.
4. Loại asset thuộc banner, category, about media hoặc entity khác.
5. Xuất `cloudinary-cleanup-inventory.json`.
6. Chạy preview không xóa.
7. Xóa từng asset trong danh sách đã xác nhận.
8. Ghi kết quả thành công/thất bại cho từng public ID.

Product có `image` là URL Tiki nhưng không có `imagePublicId` thì không có Cloudinary asset để xóa. Không được xóa nhầm theo URL Tiki.

Nếu Cloudinary API xóa thất bại, cleanup phải ghi nhận lỗi và không giả vờ rằng asset đã được xóa. Có thể retry các asset thất bại bằng manifest, nhưng không tạo lại danh sách mục tiêu một cách khác trong lần retry.

### 2.9. Trình tự cleanup an toàn

```text
1. Kiểm tra environment/profile
2. Tạo database snapshot/backup
3. Inventory Product mục tiêu
4. Inventory reference Product
5. Inventory Cloudinary public IDs
6. Xuất cleanup report preview
7. Xác nhận số lượng và phạm vi
8. Xóa dữ liệu phụ thuộc theo profile
9. Xóa Cloudinary asset đã xác nhận
10. Xóa Product theo danh sách _id đã xác nhận
11. Xóa translation/cache liên quan còn sót
12. Verify database không còn Product mục tiêu
13. Verify Cloudinary không còn asset mục tiêu
14. Ghi cleanup completion report
```

Thứ tự xóa Product và Cloudinary phải được thiết kế sao cho manifest vẫn tồn tại trong suốt quá trình. Không xóa manifest trước khi verify hoàn tất.

### 2.10. Cleanup report

```json
{
  "environment": "staging",
  "profile": "legacy-gearvn-reset",
  "dryRun": false,
  "confirmationRequired": true,
  "productTargetCount": 20,
  "productDeletedCount": 20,
  "cloudinaryTargetCount": 18,
  "cloudinaryDeletedCount": 17,
  "cloudinaryFailedCount": 1,
  "dependentReviewCount": 40,
  "dependentCouponCount": 2,
  "dependentOrderCount": 0,
  "ambiguousProductCount": 0,
  "errors": [
    {
      "type": "CLOUDINARY_DELETE_FAILED",
      "publicId": "example/public-id",
      "message": "Remote deletion failed"
    }
  ],
  "verified": false
}
```

Cleanup chỉ được đánh dấu hoàn tất khi:

```text
(productDeletedCount + productArchivedCount) === productTargetCount
cloudinaryDeletedCount + cloudinaryFailedCount === cloudinaryTargetCount
ambiguousProductCount === 0 hoặc đã được xử lý thủ công
verified === true
```

`productArchivedCount` được dùng khi cleanup chạy với profile giữ lịch sử orders (`--orders=keep`).

### 2.11. Không thực hiện destructive cleanup tự động trong import

Cleanup GearVN và import Tiki phải là hai command/phase riêng:

```text
cleanup preview
→ cleanup confirm
→ cleanup execute
→ verify empty/clean Product set
→ Tiki transform
→ Tiki import
```

Không được gắn logic xóa Product/Cloudinary trực tiếp vào endpoint import admin. Import có thể được chạy nhiều lần; cleanup là thao tác destructive cần explicit confirmation và audit riêng.

### 2.12. Schema Product hiện tại

File:

```text
online-store-backend/src/models/Product.js
```

Các trường chính hiện có:

- `user`
- `name`
- `image`
- `images`
- `brand`
- `category`
- `description`
- `specs`
- `rating`
- `numReviews`
- `price`
- `originalPrice`
- `baseCurrencyCode`
- `countInStock`
- `supplier`
- `featured`
- `deal`
- `isDeleted`

Một số yêu cầu cần lưu ý:

- `name`, `image`, `brand`, `category`, `price`, `baseCurrencyCode` là các trường quan trọng của Product.
- `price` phải lớn hơn `0`.
- `baseCurrencyCode` phải có dạng mã tiền tệ ba chữ cái viết hoa.
- `category` là MongoDB ObjectId tham chiếu đến `Category`.
- `supplier` là MongoDB ObjectId tham chiếu đến `Supplier`.
- Product lưu `user` là admin thực hiện import.

### 2.4. Importer hiện tại

Các file chính:

```text
online-store-backend/src/controllers/productImportController.js
online-store-backend/src/utils/productImportValidator.js
online-store-backend/src/utils/importAdapters/JSONAdapter.js
online-store-backend/src/utils/importAdapters/CSVAdapter.js
```

Validator hiện tại yêu cầu các field:

```text
name
brand
price
category
supplier
baseCurrencyCode
```

Importer hiện hỗ trợ:

- JSON.
- CSV.
- `insert`.
- `update`.
- `upsert`.
- `dryRun`.
- Mapping category name sang Category ObjectId.
- Mapping supplier name sang Supplier ObjectId.
- Import qua JSON/CSV text.
- Import qua file upload.
- Export JSON/CSV.

Các route hiện tại:

```http
POST /api/products/admin/import
POST /api/products/admin/import-file
GET  /api/products/admin/import-template
GET  /api/products/admin/import-guide
GET  /api/products/admin/import-formats
GET  /api/products/admin/export
GET  /api/products/admin/export-stats
```

Tất cả route admin phải được bảo vệ bởi middleware xác thực và quyền admin.

### 2.5. Category và Supplier hiện tại

Category mặc định hiện có 9 loại:

```text
Keyboard
Mouse
Headphones
Cooling
Gaming Laptop
Office Laptop
Monitor
Gaming Monitor
Audio
```

Supplier mặc định hiện có 6 loại:

```text
TechCorp
ElectroHub
Gadget World
Digital Store
Innovation Labs
```

Dữ liệu Tiki có thể chứa các category và supplier khác. Theo đặc tả này, hệ thống sẽ mở rộng category/supplier có kiểm soát trước khi import, không tự động tạo record trong lúc import.

---

## 3. Mục tiêu kiến trúc mới

Luồng mặc định sau khi triển khai:

```text
seed:pre-products
→ Admin đăng nhập
→ Preflight category/supplier/currency
→ Chạy Transformer từ file Tiki
→ Xem clean/reject/report
→ Dry-run import
→ Import Product thật
→ Kiểm tra Product đã import
→ seed:post-products
```

Nguyên tắc chính:

1. Product không còn được tạo từ nguồn GearVN trong luồng import Tiki.
2. Transformer chỉ tạo dữ liệu chuẩn hóa, không tự sửa dữ liệu thiếu bằng giá trị giả tùy ý.
3. Dữ liệu không đạt yêu cầu được reject và xuất lý do cụ thể.
4. Identity nguồn phải được lưu trong Product để import lại không tạo bản ghi trùng.
5. Variant được flatten thành Product độc lập trong giai đoạn đầu.
6. Chỉ seller hiện tại được chọn làm nguồn Product; không import `other_sellers`.
7. Dữ liệu HTML từ Tiki phải được sanitize bằng thư viện chuyên dụng.
8. Các thay đổi category/supplier phải được preflight với database trước khi transform.
9. Seed dữ liệu phụ chỉ chạy sau khi Product đã tồn tại.
10. Full seed không gọi Product seeder từ API nguồn ngoài trong profile mới.

---

## 4. Các khái niệm định danh

### 4.1. Product concept

Product concept là sản phẩm tổng quát trên Tiki, thường được biểu diễn bởi:

```text
item.id
item.master_id
```

Ví dụ: Chuột Logitech M330 có thể là một product concept có nhiều màu.

### 4.2. Seller listing

Seller listing là phiên bản sản phẩm được bán bởi một seller cụ thể. Các field thường liên quan:

```text
current_seller.id
current_seller.product_id
current_seller.sku
current_seller.name
```

### 4.3. Variant

Variant là phiên bản cụ thể của product configurable, thường nằm trong:

```text
configurable_products[]
```

Một variant có thể có:

```text
id
sku
price
option1
option2
```

### 4.4. Source identity nội bộ

Product nội bộ cần bổ sung các trường:

| Field | Ý nghĩa |
| --- | --- |
| `source` | Nguồn dữ liệu, giai đoạn này là `TIKI` |
| `sourceId` | ID định danh duy nhất của listing hoặc variant được import |
| `sourceParentId` | ID sản phẩm cha/concept của Tiki |
| `sku` | SKU gốc hoặc synthetic SKU |

Quy tắc chọn `sourceId`:

```text
variant.id
→ current_seller.product_id
→ item.id
→ reject MISSING_SOURCE_ID
```

Với variant, phải ưu tiên `variant.id` trước `current_seller.product_id` để không làm nhiều variant trỏ về cùng một listing.

Quy tắc `sourceParentId`:

```text
item.master_id
→ item.id
```

Quy tắc `sku`:

```text
variant.sku
→ current_seller.sku
→ item.sku
→ TIKI-SYNTHETIC-${sourceId}
```

Synthetic SKU phải có tiền tố rõ ràng để phân biệt với SKU gốc từ Tiki.

### 4.5. Unique identity

Identity chính của Product Tiki là:

```text
source + sourceId
```

Dự kiến tạo unique partial index:

```javascript
{ source: 1, sourceId: 1 }
```

Index chỉ áp dụng cho document có source identity hợp lệ, không áp dụng bắt buộc cho Product legacy chưa có source.

---

## 5. Cấu trúc dữ liệu Tiki đầu vào

Một item Tiki có thể chứa các nhóm field sau:

### 5.1. Nhận diện và nội dung

```text
id
master_id
sku
name
url_key
url_path
short_url
type
short_description
description
```

### 5.2. Giá và đánh giá

```text
price
list_price
original_price
discount
discount_rate
rating_average
review_count
review_text
```

### 5.3. Ảnh

```text
thumbnail_url
images[].base_url
```

### 5.4. Kho và trạng thái bán

```text
inventory_status
inventory_type
stock_item.qty
stock_item.min_sale_qty
stock_item.max_sale_qty
stock_item.preorder_date
```

### 5.5. Thương hiệu và seller

```text
brand.id
brand.name
brand.slug
current_seller.id
current_seller.sku
current_seller.name
current_seller.product_id
current_seller.price
current_seller.store_id
other_sellers[]
```

### 5.6. Category và breadcrumb

```text
categories.id
categories.name
categories.is_leaf
breadcrumbs[].category_id
breadcrumbs[].name
breadcrumbs[].url
```

### 5.7. Thông số kỹ thuật

```text
specifications[].name
specifications[].attributes[].code
specifications[].attributes[].name
specifications[].attributes[].value
```

### 5.8. Configurable product

```text
configurable_options[]
configurable_products[]
```

---

## 6. Bảng mapping Tiki → Product nội bộ

| Dữ liệu Tiki | Field nội bộ | Quy tắc |
| --- | --- | --- |
| `name` | `name` | Trim khoảng trắng; variant ghép thêm option |
| `brand.name` | `brand` | Bắt buộc; không tự dùng `Generic` nếu chưa được cho phép |
| `price` | `price` | Giá bán hiện tại; phải lớn hơn 0 |
| `variant.price` | `price` | Ưu tiên nếu đang flatten variant |
| `current_seller.price` | `price` | Fallback cuối trước khi reject |
| `original_price` | `originalPrice` | Ưu tiên giá gốc Tiki |
| `list_price` | `originalPrice` | Fallback khi không có `original_price` |
| `price` | `originalPrice` | Fallback cuối nếu không có giá gốc |
| Tiki/Vietnam | `baseCurrencyCode` | Auto-fill `VND` |
| `categories.name` | `category` | Map qua bảng cấu hình rồi kiểm tra DB |
| `breadcrumbs[last].name` | `category` | Fallback cho `categories.name` |
| `current_seller.name` | `supplier` | Phải tồn tại trong DB |
| `thumbnail_url` | `image` | Ưu tiên ảnh đại diện |
| `images[].base_url` | `images` | Lọc URL hợp lệ, không giữ phần tử rỗng |
| `description` | `description` | Sanitize HTML |
| `short_description` | `description` | Fallback sau description |
| `name` | `description` | Fallback cuối |
| `rating_average` | `rating` | Chuẩn hóa trong khoảng 0–5 |
| `review_count` | `numReviews` | Số nguyên không âm |
| `specifications` | `specs` | Chuyển mảng nhóm thành object key-value |
| `stock_item.qty` | `countInStock` | Ưu tiên kể cả khi bằng 0 |
| `inventory_status` | `countInStock` | Dùng khi không có qty |
| `variant.id` | `sourceId` | Ưu tiên cho variant |
| `current_seller.product_id` | `sourceId` | Dùng cho seller listing |
| `item.id` | `sourceId` | Fallback cuối |
| `item.master_id` | `sourceParentId` | ID product concept |
| `sku` | `sku` | Fallback sau variant/seller SKU |

---

## 7. Quy tắc validation và reject

### 7.1. Nguyên tắc chung

Transformer phải phân biệt rõ:

- **Error:** Không thể tạo Product hợp lệ, record bị reject.
- **Warning:** Có thể import nhưng cần ghi nhận trong report.
- **Info:** Chỉ dùng để thống kê hoặc audit.

Một record chỉ được đưa vào `ready_for_import.json` khi không có error.

### 7.2. Các field bắt buộc

| Field | Điều kiện hợp lệ | Khi lỗi |
| --- | --- | --- |
| `name` | Chuỗi không rỗng sau trim | `MISSING_NAME` |
| `brand` | Chuỗi không rỗng | `MISSING_BRAND` |
| `price` | Số hữu hạn, lớn hơn 0 | `INVALID_PRICE` |
| `category` | Có trong allowlist và tồn tại DB | `UNAPPROVED_CATEGORY` hoặc `CATEGORY_NOT_FOUND` |
| `supplier` | Có trong allowlist thực tế và tồn tại DB | `UNAPPROVED_SUPPLIER` hoặc `SUPPLIER_NOT_FOUND` |
| `image` | URL `https` hợp lệ | `INVALID_IMAGE_URL` |
| `baseCurrencyCode` | `VND` | Auto-fill |
| `sourceId` | Chuỗi không rỗng | `MISSING_SOURCE_ID` |

### 7.3. Không dùng fallback giả cho field cốt lõi

Không được tự động dùng:

```text
price = 0
image = placeholder
category = General Tech
supplier = Default Supplier
brand = Generic
```

trừ khi một giá trị cụ thể đã được phê duyệt trong cấu hình nghiệp vụ. Mặc định, thiếu các field trên phải reject.

### 7.4. Mã lỗi chuẩn

Các mã lỗi nên ổn định để dùng trong report và kiểm thử:

```text
MISSING_NAME
MISSING_BRAND
INVALID_PRICE
INVALID_ORIGINAL_PRICE
UNAPPROVED_CATEGORY
CATEGORY_NOT_FOUND
UNAPPROVED_SUPPLIER
SUPPLIER_NOT_FOUND
INVALID_IMAGE_URL
MISSING_SOURCE_ID
INVALID_SOURCE_ID
INVALID_VARIANT
INVALID_DESCRIPTION
INVALID_SPECIFICATIONS
INVALID_STOCK
DUPLICATE_SOURCE_ID
```

### 7.5. Cấu trúc rejected record

```json
{
  "rawId": 274291882,
  "source": "TIKI",
  "sourceParentId": "274291882",
  "reasons": [
    {
      "code": "UNAPPROVED_CATEGORY",
      "field": "category",
      "value": "Màn Hình Gaming",
      "message": "Category chưa được khai báo hoặc chưa tồn tại trong database"
    },
    {
      "code": "UNAPPROVED_SUPPLIER",
      "field": "supplier",
      "value": "Tiki Trading",
      "message": "Supplier chưa được tạo hoặc chưa được cho phép"
    }
  ],
  "raw": {}
}
```

Raw data trong report cần được cân nhắc vì file có thể lớn hoặc chứa dữ liệu nhạy cảm. Nếu không cần lưu toàn bộ, chỉ lưu `rawId`, source identity và các field liên quan lỗi.

---

## 8. Quy tắc giá

Thứ tự lấy giá bán:

```text
variant.price
→ item.price
→ current_seller.price
→ reject INVALID_PRICE
```

Giá phải thỏa mãn:

```text
Number.isFinite(price) === true
price > 0
```

Thứ tự lấy giá gốc:

```text
variant.original_price
→ item.original_price
→ item.list_price
→ price
```

Nếu `originalPrice < price`, nên xử lý theo một trong hai profile:

- `strict`: reject `INVALID_ORIGINAL_PRICE`.
- `permissive`: giữ giá và ghi warning.

Profile mặc định nên là `strict` trong dữ liệu production và có thể dùng `permissive` cho staging nếu cần khảo sát dữ liệu.

Sản phẩm không giảm giá hợp lệ khi:

```text
originalPrice === price
```

Không cần tạo `deal` nếu:

```text
discount_rate <= 0
hoặc originalPrice <= price
```

Nếu tạo `deal`, discount phải nằm trong khoảng:

```text
0 <= discount <= 100
```

---

## 9. Quy tắc tồn kho

### 9.1. Ý nghĩa

`stock_item.qty` là số lượng mà Tiki báo cáo trong response tại thời điểm crawl. Đây không nhất thiết là nguồn tồn kho nội bộ hoặc tồn kho đảm bảo theo thời gian thực.

Vì Tiki thường ẩn số lượng với một số seller, cần phân biệt:

- Số lượng do Tiki báo cáo.
- Số lượng suy luận từ trạng thái bán.
- Số lượng mô phỏng cho staging/demo.

### 9.2. Quy tắc ưu tiên

```text
1. stock_item.qty là số hợp lệ và >= 0
2. inventory_status === "out_of_stock"
3. inventory_status === "available" nhưng qty bị ẩn
4. trạng thái không xác định
```

Kết quả:

| Tình huống | `countInStock` | `stockSource` trong report | `isSimulated` |
| --- | ---: | --- | --- |
| `qty = 15` | 15 | `tiki_reported` | false |
| `qty = 0` | 0 | `tiki_reported` | false |
| `out_of_stock`, không có qty | 0 | `tiki_status` | false |
| `available`, không có qty | configured default | `simulated` | true |
| Trạng thái không xác định | Theo profile hoặc reject | `unknown` | false |

`qty = 0` phải được ưu tiên. Không được ghi đè `qty = 0` bằng stock mô phỏng chỉ vì `inventory_status` là `available`.

### 9.3. Stock mô phỏng

Giá trị mặc định staging đề xuất:

```text
simulatedStockQty = 50
```

Giá trị này phải nằm trong config, không hard-code trong logic Transformer.

Báo cáo phải thống kê:

```text
simulated_stock_count
reported_stock_count
out_of_stock_count
unknown_stock_count
```

Không dùng stock mô phỏng cho production nếu chưa có quyết định nghiệp vụ riêng.

---

## 10. Quy tắc category

### 10.1. Nguồn category

Thứ tự đọc category:

```text
categories.name
→ breadcrumbs[last].name
→ reject nếu không có
```

Tên Tiki không được ghi trực tiếp vào Product. Phải được resolve qua `Category.name` hoặc danh sách `Category.sourceNames` do dữ liệu quản trị cung cấp.

### 10.2. Category nội bộ dự kiến

Bộ category hiện tại:

```text
Keyboard
Mouse
Headphones
Cooling
Gaming Laptop
Office Laptop
Monitor
Gaming Monitor
Audio
```

Các category ngoài allowlist vẫn bị reject cho đến khi được bổ sung mapping và bản dịch.

Việc thêm category phải tạo đầy đủ:

- Category record.
- Key/slug.
- Icon/image nếu UI yêu cầu.
- Translation key.
- Bản dịch cần thiết.
- Category translation cache nếu hệ thống sử dụng.

### 10.3. Category source names

Tên category nguồn được lưu cùng Category record và có thể quản lý qua API category admin:

```json
{
  "name": "Office Laptop",
  "sourceNames": ["Laptop Truyền Thống"]
}
```

Transformer normalize tên nguồn rồi resolve theo `name` hoặc `sourceNames` của Category active. Dữ liệu source name phải được duyệt trước khi import và không được đặt trong code importer.

### 10.4. Không có category fallback giả

Nếu category Tiki không có trong mapping hoặc mapping trỏ tới category chưa tồn tại:

```text
REJECT UNAPPROVED_CATEGORY
```

Không tự gán `General Tech`, `Uncategorized` hoặc một category gần đúng nếu chưa có quyết định nghiệp vụ.

---

## 11. Quy tắc supplier

### 11.1. Supplier được chọn

Trong giai đoạn đầu, chỉ sử dụng:

```text
current_seller.name
```

Không import `other_sellers` thành Product khác.

### 11.2. Preflight supplier

Trước khi transform:

1. Đọc toàn bộ supplier active từ database.
2. Chuẩn hóa tên để so sánh, nhưng giữ nguyên tên canonical từ DB.
3. Kiểm tra mọi seller trong file có mapping hợp lệ.
4. Xuất danh sách supplier thiếu.
5. Dừng pipeline nếu có supplier chưa được xử lý trong strict mode.

Không tự động tạo supplier trong lúc import, vì sẽ làm lẫn dữ liệu cấu hình với dữ liệu crawl.

### 11.3. Chuẩn hóa tên

Cần phân biệt:

```text
Tên dùng để lookup
Tên canonical lưu vào config
Tên hiển thị trong database
```

Ví dụ các khác biệt về khoảng trắng hoặc viết hoa có thể normalize để tìm, nhưng không nên tự gộp hai seller khác nhau chỉ vì tên gần giống.

---

## 12. Quy tắc brand

Brand phải là chuỗi không rỗng sau khi trim.

Thứ tự đọc:

```text
variant.brand.name
→ item.brand.name
→ reject MISSING_BRAND
```

Các giá trị như `No Brand`, `Unknown`, hoặc brand rỗng cần có chính sách riêng. Mặc định:

- Nếu `No Brand` là giá trị Tiki có chủ ý và hệ thống chấp nhận: normalize thành giá trị canonical đã định nghĩa.
- Nếu chưa có quyết định: reject hoặc đưa vào report cần duyệt.
- Không tự động đổi tất cả thành `Generic`.

---

## 13. Quy tắc ảnh

### 13.1. Ảnh chính

Thứ tự chọn ảnh chính:

```text
variant.thumbnail_url
→ variant.images[0].base_url
→ parent.thumbnail_url
→ parent.images[0].base_url
→ reject INVALID_IMAGE_URL
```

Ảnh phải:

- Là chuỗi không rỗng.
- Là URL hợp lệ.
- Dùng scheme `https`.
- Không dùng placeholder tự sinh.

### 13.2. Gallery

Lấy từ:

```text
variant.images[].base_url
→ parent.images[].base_url
→ [image]
```

Cần:

- Lọc URL rỗng.
- Lọc URL không hợp lệ.
- Loại duplicate.
- Giữ ảnh chính trong gallery nếu hệ thống cần.

### 13.3. Kiểm tra HTTP status

HTTP `HEAD` hoặc `GET` kiểm tra ảnh có thể rất chậm và không nên mặc định gọi cho 401 sản phẩm nếu không cần.

Nên hỗ trợ hai profile:

- `url_format_only`: chỉ kiểm tra format và scheme.
- `remote_check`: kiểm tra URL từ xa với timeout, retry và giới hạn concurrency.

Nếu remote check thất bại do rate limit hoặc timeout, cần phân biệt:

```text
INVALID_IMAGE_URL
IMAGE_CHECK_TIMEOUT
IMAGE_REMOTE_UNAVAILABLE
```

Không gộp tất cả thành ảnh không hợp lệ.

---

## 14. Quy tắc description và HTML

### 14.1. Fallback description

```text
variant.description
→ item.description
→ variant.short_description
→ item.short_description
→ name
```

Nếu sử dụng description của parent cho variant, cần ghi nhận trong report rằng nội dung được kế thừa.

### 14.2. Sanitize bắt buộc

Không dùng regex tự viết để sanitize HTML.

Sử dụng thư viện chuyên dụng phía Node.js, ví dụ `sanitize-html`, với chính sách allowlist rõ ràng.

Tags có thể cho phép:

```text
p
br
b
strong
i
em
ul
ol
li
table
thead
tbody
tr
th
td
img
```

Attributes có thể cho phép:

```text
img: src, alt, width, height
th/td: colspan, rowspan
```

Protocol cho URL:

```text
https
```

Cần loại bỏ:

```text
script
style
iframe
object
embed
form
onerror
onclick
onload
srcdoc
javascript:
data:
```

Nếu cần giữ ảnh trong HTML, phải áp dụng chính sách URL cho `img.src` tương tự ảnh chính. Không cho phép `data:` URL nếu chưa có lý do cụ thể.

### 14.3. Không trust HTML sau sanitize

Frontend vẫn cần render HTML theo một cách an toàn. Việc sanitize ở Transformer không nên được xem là lý do để bỏ qua các biện pháp bảo vệ tại boundary hiển thị.

---

## 15. Quy tắc specifications → specs

Tiki có dạng dữ liệu nhóm:

```json
[
  {
    "name": "Thông tin chung",
    "attributes": [
      {
        "code": "screen_size",
        "name": "Kích thước màn hình",
        "value": "27 inch"
      }
    ]
  }
]
```

Product nội bộ sử dụng object `specs` dạng key-value.

### 15.1. Quy tắc chuyển đổi

- Duyệt từng group.
- Duyệt từng attribute.
- Bỏ attribute thiếu `name` hoặc `value`.
- Ưu tiên key đã normalize nếu có mapping.
- Giữ lại tên gốc nếu chưa có mapping.
- Khi trùng key, dùng giá trị theo chính sách đã chọn và ghi warning.

Ví dụ kết quả:

```json
{
  "display": "27 inch",
  "display_resolution": "Full HD (1920 x 1080)",
  "refresh_rate": "180Hz"
}
```

### 15.2. Không làm mất dữ liệu thông số

Nếu hệ thống cần hiển thị tiếng Việt hoặc dịch spec, không nên chỉ bỏ toàn bộ key gốc. Có thể lưu key canonical cho các field quen thuộc và giữ key Tiki chưa map trong `specs`.

### 15.3. Kế thừa specs cho variant

Thứ tự:

```text
variant.specifications nếu có dữ liệu
→ parent.specifications
→ {}
```

Nếu variant có một phần specs riêng, cần quy định merge shallow hay deep. Mặc định dùng:

```text
variant override parent
```

---

## 16. Flatten configurable variant

### 16.1. Điều kiện flatten

Nếu:

```text
type === "configurable"
```

và:

```text
configurable_products là array không rỗng
```

thì không import Product cha như một Product bán độc lập. Thay vào đó, tạo một record cho mỗi variant.

### 16.2. Field của variant

Mỗi variant nhận:

| Field | Nguồn |
| --- | --- |
| `sourceId` | `variant.id` |
| `sourceParentId` | `item.master_id` hoặc `item.id` |
| `sku` | `variant.sku` rồi fallback |
| `price` | `variant.price` rồi fallback seller/item |
| `name` | Tên cha + option |
| `brand` | Variant rồi parent |
| `category` | Parent nếu variant không có |
| `supplier` | Seller hiện tại |
| `image` | Variant rồi parent |
| `description` | Variant rồi parent |
| `specs` | Variant merge/override parent |
| `countInStock` | Variant stock rồi parent/item |

### 16.3. Tên variant

Ví dụ:

```text
Chuột Không Dây Logitech M330 Silent Plus - Đen
Chuột Không Dây Logitech M330 Silent Plus - Đỏ
```

Nếu có nhiều option:

```text
Tên sản phẩm - Màu: Đen - Dung lượng: 512GB
```

Tên option phải được normalize khoảng trắng và loại bỏ giá trị rỗng.

### 16.4. Variant lỗi

Nếu một variant thiếu giá hoặc source identity:

- Chỉ reject variant đó.
- Không nhất thiết reject toàn bộ product parent.
- Report phải ghi `rawId`, `parentId`, `variantId` và lý do.

Nếu toàn bộ variant đều bị reject, parent được xem là không có Product hợp lệ.

---

## 17. Chính sách nhiều seller

Giai đoạn đầu chỉ import seller hiện tại:

```text
current_seller
```

Không import:

```text
other_sellers[]
```

Lý do:

- Schema Product hiện tại chưa phải marketplace listing model.
- `supplier` đang đại diện cho một nhà cung cấp/seller.
- Import nhiều seller có thể tạo các Product trùng tên.
- Giá, tồn kho, SKU và listing identity khác nhau.

Nếu sau này cần hỗ trợ nhiều seller, phải thiết kế riêng:

```text
Product concept
→ Seller listing
→ Seller price/stock/SKU
```

Không nên mở rộng bằng cách tạo Product duplicate một cách ngầm định.

---

## 18. Static configuration và Dynamic processor

### 18.1. Static configuration

Các giá trị nên nằm trong file cấu hình độc lập hoặc nguồn cấu hình có kiểm soát:

- Category mapping.
- Tên category nội bộ hợp lệ.
- Chính sách supplier.
- HTML allowlist.
- Stock simulated quantity.
- Profile strict/permissive.
- Quy tắc URL.
- Giới hạn kích thước file.
- Giới hạn concurrency khi kiểm tra ảnh.

Ví dụ cấu trúc:

```json
{
  "source": "TIKI",
  "currency": "VND",
  "categoryMapping": {
    "Laptop": "Office Laptop",
    "Laptop Gaming": "Gaming Laptop",
    "Màn Hình Gaming": "Gaming Monitor",
    "Chuột máy tính": "Mouse",
    "Bàn phím": "Keyboard"
  },
  "stockPolicy": {
    "mode": "staging",
    "simulatedStockQty": 50,
    "unknownStatus": "reject"
  },
  "descriptionPolicy": {
    "allowedSchemes": ["https"]
  },
  "validation": {
    "strictOriginalPrice": true,
    "requireHttpsImage": true
  }
}
```

### 18.2. Dynamic processor

Transformer runtime chịu trách nhiệm:

- Đọc raw data.
- Xác định parent/variant.
- Chọn fallback theo thứ tự.
- Chuẩn hóa kiểu dữ liệu.
- Map category.
- Resolve source identity.
- Sanitize HTML.
- Extract specs.
- Resolve stock.
- Tạo clean/reject/report.

Logic xử lý không nên chứa danh sách category, supplier hoặc seller hard-code.

### 18.3. Config không thay thế database

Config chỉ mô tả quy tắc và mapping. Database vẫn là nguồn kiểm chứng cuối cho:

- Category tồn tại.
- Supplier tồn tại.
- Currency active.
- User admin hợp lệ.

---

## 19. Preflight database

Preflight chạy trước Transformer hoặc trước bước import tùy kiến trúc triển khai.

### 19.1. Kiểm tra cần thực hiện

- Kết nối MongoDB thành công.
- Có ít nhất một admin dùng cho import.
- Currency `VND` tồn tại và active.
- Tất cả category đích trong mapping tồn tại.
- Tất cả supplier được phép tồn tại.
- Không có mapping category trỏ tới tên sai.
- Không có supplier duplicate theo quy tắc canonical.
- Index source identity đã sẵn sàng nếu chạy upsert.

### 19.2. Kết quả preflight

Nếu thành công:

```json
{
  "success": true,
  "categoriesChecked": 10,
  "suppliersChecked": 8,
  "currency": "VND",
  "sourceIdentityIndexReady": true
}
```

Nếu thất bại, phải dừng trước khi tạo `ready_for_import.json` hoặc đánh dấu report là không thể import.

Ví dụ lỗi:

```json
{
  "success": false,
  "errors": [
    {
      "code": "CATEGORY_NOT_FOUND",
      "value": "Gaming Monitor"
    },
    {
      "code": "SUPPLIER_NOT_FOUND",
      "value": "Tiki Trading"
    }
  ]
}
```

---

## 20. Output của Transformer

Transformer tạo ba file bắt buộc.

### 20.1. `ready_for_import.json`

Chỉ chứa các record đã vượt qua validation:

```json
[
  {
    "source": "TIKI",
    "sourceId": "279225807",
    "sourceParentId": "279225805",
    "sku": "5517358684027",
    "name": "Apple Macbook Air 13 Inch M5",
    "brand": "Apple",
    "price": 35590000,
    "originalPrice": 39900000,
    "baseCurrencyCode": "VND",
    "category": "Office Laptop",
    "supplier": "Tiki Trading",
    "countInStock": 50,
    "image": "https://example.com/product.png",
    "images": [
      "https://example.com/product.png"
    ],
    "description": "Mô tả đã được sanitize",
    "rating": 5,
    "numReviews": 1,
    "specs": {}
  }
]
```

### 20.2. `rejected-products.json`

Chứa record bị reject và lý do có cấu trúc.

### 20.3. `transform-report.json`

Báo cáo tổng hợp nên có:

```json
{
  "source": "TIKI",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "raw_item_count": 401,
  "flattened_record_count": 438,
  "qualified_count": 340,
  "rejected_count": 98,
  "variant_count": 37,
  "simulated_stock_count": 310,
  "reported_stock_count": 80,
  "out_of_stock_count": 48,
  "unknown_stock_count": 0,
  "synthetic_sku_count": 12,
  "inherited_description_count": 22,
  "inherited_image_count": 18,
  "rejection_breakdown": {
    "UNAPPROVED_CATEGORY": 45,
    "INVALID_PRICE": 10,
    "UNAPPROVED_SUPPLIER": 6,
    "MISSING_SOURCE_ID": 0
  }
}
```

Cần phân biệt:

- `raw_item_count`: số item gốc trong file.
- `flattened_record_count`: số record sau khi tách variant.
- `qualified_count`: số record sạch.
- `rejected_count`: số record bị loại.

---

## 21. Thay đổi backend cần thiết

### 21.1. Product schema

Bổ sung các field:

```text
source
sourceId
sourceParentId
sku
```

Nên xác định rõ:

- `source` là uppercase canonical, ví dụ `TIKI`.
- `sourceId` là String để tránh phụ thuộc số nguyên của nguồn.
- `sourceParentId` là String nullable nếu Product không có parent.
- `sku` là String, có thể là SKU gốc hoặc synthetic SKU.

Cần cân nhắc index riêng cho:

```text
source
sourceId
sku
source + sourceId
```

### 21.2. Product import validator

Validator phải giữ lại và kiểm tra các field identity:

```text
source
sourceId
sourceParentId
sku
```

Không được để các field này bị loại khỏi object `cleaned` trước khi ghi database.

Validator cần kiểm tra:

- `source` nằm trong danh sách source được hỗ trợ.
- `sourceId` không rỗng.
- `sourceParentId` nếu có phải là chuỗi không rỗng.
- `sku` nếu là synthetic phải đúng prefix quy định.

### 21.3. Import controller

Logic upsert hiện tại cần thay đổi từ ưu tiên `name + brand` sang:

```text
1. source + sourceId
2. legacy migration flow có kiểm soát
```

Không dùng `name + brand` làm fallback mặc định cho mọi import mới.

Các mode nên có hành vi:

#### Insert

- Nếu source identity đã tồn tại: skip hoặc báo duplicate.
- Nếu chưa tồn tại: tạo mới.

#### Update

- Bắt buộc có source identity hoặc Mongo Product ID.
- Nếu không tìm thấy: reject.

#### Upsert

- Tìm bằng source identity.
- Nếu không có: tạo mới.
- Không match mơ hồ bằng tên.

### 21.4. Translation invalidation

Khi upsert thay đổi các field translatable như:

```text
name
description
brand
specs
```

phải tiếp tục invalidation translation cache theo Product Mongo `_id`, không phải source ID.

---

## 22. Index và migration legacy

### 22.1. Partial unique index

Mục tiêu là ngăn duplicate cùng source identity nhưng không làm hỏng Product legacy.

Index dự kiến:

```javascript
{
  source: 1,
  sourceId: 1
}
```

Partial filter cần chỉ nhận document có identity hợp lệ, không chỉ kiểm tra field tồn tại. Cần kiểm tra các trường hợp:

```text
source = null
source = ""
sourceId = null
sourceId = ""
```

### 22.2. Không backfill tự động mù

Product legacy có thể được tạo từ GearVN hoặc seed cũ. Không nên tự động gán source TIKI chỉ vì name và brand giống nhau.

Migration legacy cần:

1. Chạy query candidate bằng name/brand.
2. Xuất danh sách candidate.
3. Xác định mức độ chắc chắn.
4. Chỉ backfill khi có identity Tiki khớp rõ ràng.
5. Ghi audit log.
6. Có khả năng rollback.

### 22.3. Legacy fallback riêng

Nếu cần hỗ trợ Product cũ trong giai đoạn chuyển tiếp, tạo flow migration riêng thay vì làm `name + brand` thành fallback ngầm trong mọi lần upsert.

---

## 23. Quy trình import vận hành

### Bước 1: Reset dữ liệu Product GearVN và Cloudinary

Đây là bước bắt buộc khi môi trường cần dùng riêng bộ dữ liệu Tiki.

Thực hiện theo trình tự:

```text
cleanup preview
→ kiểm tra manifest
→ xác nhận phạm vi xóa
→ cleanup execute
→ verify cleanup
```

Chỉ cleanup các Product GearVN đã được inventory. Không xóa toàn bộ Product collection hoặc toàn bộ Cloudinary folder bằng điều kiện tổng quát.

Các file cần lưu lại:

```text
product-cleanup-inventory.json
cloudinary-cleanup-inventory.json
cleanup-report.json
```

Nếu cleanup report chưa `verified: true`, không được chuyển sang import Tiki.

### Bước 2: Seed dữ liệu nền

Không chạy module `products` GearVN.

Seed tối thiểu:

```text
languages
translations
currencies
users
categories
suppliers
categoryTranslations
```

Có thể bổ sung:

```text
customers
shippingProviders
locations
```

nếu cần chạy orders hoặc addresses.

### Bước 3: Đăng nhập admin

Admin dùng tài khoản development được tạo bởi `userSeeder`.

Không dùng mật khẩu seed mặc định trong production.

### Bước 4: Chạy preflight

Kiểm tra:

- MongoDB.
- Admin.
- Currency.
- Category.
- Supplier.
- Index.

### Bước 5: Chạy Transformer

Input:

```text
tech_accessories_full.json
```

Output:

```text
ready_for_import.json
rejected-products.json
transform-report.json
```

Không import nếu report có lỗi preflight hoặc số lượng rejected vượt ngưỡng được chấp nhận.

### Bước 6: Xem report

Kiểm tra tối thiểu:

- Tổng số raw item.
- Tổng số flattened record.
- Số Product hợp lệ.
- Số Product bị reject.
- Lý do reject chính.
- Số stock mô phỏng.
- Số synthetic SKU.
- Số variant.

### Bước 7: Dry-run

Gửi dữ liệu qua endpoint import với:

```text
format=json
mode=upsert
dryRun=true
```

Dry-run cần kiểm tra:

- Category/supplier được resolve đúng ObjectId.
- Không có Product identity trùng ngoài dự kiến.
- Giá và currency đúng.
- Preview không chứa dữ liệu reject.

### Bước 8: Import thật

Chỉ import sau khi dry-run đạt yêu cầu.

Dùng:

```http
POST /api/products/admin/import
```

hoặc:

```http
POST /api/products/admin/import-file
```

### Bước 9: Kiểm tra sau import

Kiểm tra:

```http
GET /api/products?pageNumber=1&pageSize=20&lang=vi
GET /api/categories?pageSize=20&pageNumber=1&lang=vi
```

Ngoài API, cần kiểm tra database:

- Product có `source = TIKI`.
- `sourceId` không rỗng.
- `sourceId` không duplicate.
- Category là ObjectId hợp lệ.
- Supplier là ObjectId hợp lệ.
- User là admin thực hiện import.
- Product không có giá 0.
- Product không có image rỗng.

### Bước 10: Seed module phụ

Sau khi Product đã tồn tại:

```text
specTranslations
reviews
orders
coupons
```

Thứ tự đề xuất:

1. `specTranslations`.
2. `reviews`.
3. `orders`.
4. `coupons`.

Full seed không có Product seeder từ API nguồn ngoài.

---

## 24. Quy tắc export

Export Product nội bộ phải giữ lại identity nguồn nếu Product có:

```text
source
sourceId
sourceParentId
sku
```

JSON export nên có thể dùng làm input cho lần import sau mà không làm mất source identity.

CSV export cần quy định rõ cách biểu diễn:

- `specs` dưới dạng JSON string.
- `images` dưới dạng pipe-separated URLs hoặc JSON string nhất quán.
- `deal` dưới dạng JSON string.
- Không cắt mất `sourceId` hoặc `sku`.

Import lại file export nội bộ không được làm thay đổi source identity nếu các field đó hợp lệ.

---

## 25. Bảo mật

### 25.1. HTML/XSS

- Sanitize HTML ở pipeline.
- Không dùng regex làm sanitizer chính.
- Chặn `script`, event attributes và protocol nguy hiểm.
- Chỉ cho phép `https` cho URL trong HTML.
- Frontend vẫn phải render HTML an toàn.

### 25.2. File upload

Import file phải tiếp tục có:

- Giới hạn kích thước file.
- Kiểm tra MIME/type.
- Không thực thi nội dung file.
- Parse JSON/CSV trong giới hạn tài nguyên.
- Giới hạn số lượng record.
- Không log toàn bộ dữ liệu nhạy cảm.

### 25.3. SSRF khi kiểm tra ảnh

Nếu Transformer hoặc backend gọi URL ảnh từ nguồn bên ngoài:

- Chỉ cho phép scheme `https`.
- Kiểm soát redirect.
- Giới hạn timeout.
- Giới hạn kích thước response.
- Giới hạn số request đồng thời.
- Cân nhắc allowlist domain nếu triển khai production.

### 25.4. Quyền admin

Các endpoint import/export phải tiếp tục yêu cầu:

```text
protect
admin
```

Không mở endpoint import cho user thường.

---

## 26. Kiểm thử bắt buộc

### 26.1. Unit test Transformer

| Case | Kết quả mong đợi |
| --- | --- |
| Product thường đủ field | Qualified |
| Thiếu name | Reject `MISSING_NAME` |
| Giá bằng 0 | Reject `INVALID_PRICE` |
| Giá âm | Reject `INVALID_PRICE` |
| Có `variant.price` | Dùng giá variant |
| Không có variant price | Fallback item/seller price |
| Thiếu brand | Reject nếu không có policy fallback |
| Category có mapping | Qualified nếu category tồn tại DB |
| Category không mapping | Reject |
| Supplier chưa tồn tại | Reject |
| Chỉ có thumbnail | Qualified |
| Không có ảnh | Reject |
| HTML có script | Script bị loại |
| HTML có `javascript:` | URL bị loại |
| `stock_item.qty = 0` | Giữ 0, không mô phỏng |
| `stock_item.qty = 15` | Dùng 15 |
| Available không có qty | Dùng stock mô phỏng ở staging |
| Out of stock không có qty | Dùng 0 |
| Không có source ID | Reject |
| Thiếu SKU | Tạo synthetic SKU nếu được phép |
| Configurable có variants | Flatten từng variant |
| Variant lỗi giá | Chỉ reject variant đó |
| Nhiều seller | Chỉ dùng current seller |
| Duplicate source identity | Report duplicate |

### 26.2. Integration test backend

- Validator giữ `source`, `sourceId`, `sourceParentId`, `sku`.
- Import tạo Product có source identity.
- Upsert lần hai cập nhật đúng Product, không tạo duplicate.
- Insert bỏ qua hoặc báo duplicate đúng policy.
- Update không tìm thấy Product thì báo lỗi.
- Category name resolve đúng ObjectId.
- Supplier name resolve đúng ObjectId.
- Dry-run không ghi database.
- Translation cache bị invalidate khi field dịch thay đổi.
- Partial unique index chặn duplicate source identity.

### 26.3. E2E flow

```text
Seed nền
→ Login admin
→ Preflight
→ Transformer
→ Dry-run
→ Import thật
→ Query Product
→ Seed reviews
→ Seed orders
→ Seed coupons
```

### 26.4. Regression test seed

- Seed nền không gọi GearVN.
- Product seeder từ API nguồn ngoài đã được gỡ khỏi repository.
- Seed post-products không tạo lại Product.
- Reviews dùng Product `_id` đã tồn tại.
- Orders dùng Product `_id` đã tồn tại.
- Coupons dùng Product/category đã tồn tại.
- Spec translations dùng Product `_id` đã tồn tại.

---

## 27. Tiêu chí hoàn thành

Đặc tả được xem là triển khai đạt yêu cầu khi:

- Có thể inventory và preview đúng Product GearVN cần reset.
- Cleanup chỉ chạy sau khi có backup và xác nhận phạm vi.
- Product GearVN cũ được xóa khỏi database theo manifest đã xác nhận.
- Cloudinary asset thuộc Product GearVN được dọn theo public ID, không xóa asset dùng chung.
- Cleanup report được verify trước khi import Tiki.
- Có thể seed dữ liệu nền mà không gọi GearVN.
- Category và supplier cần thiết được tạo trước và kiểm tra qua preflight.
- Transformer tạo được clean/reject/report riêng.
- Product thiếu field cốt lõi không lọt vào clean file.
- `qty = 0` không bị ghi đè bởi stock mô phỏng.
- Stock mô phỏng chỉ được dùng theo profile staging/demo.
- HTML nguy hiểm bị sanitize bằng thư viện chuyên dụng.
- Variant được flatten theo source identity của variant.
- Seller hiện tại được xử lý nhất quán.
- Product có `source`, `sourceId`, `sourceParentId`, `sku`.
- Importer giữ lại source identity sau validation.
- Upsert lần hai không tạo Product duplicate.
- Legacy Product không bị match mù bằng name + brand.
- Export không làm mất source identity.
- Dry-run phản ánh đúng số Product sẽ insert/update.
- Reject report có mã lỗi ổn định.
- Seed reviews/orders/coupons/specTranslations chạy sau import thành công.
- Có test cho các case giá, stock, ảnh, category, supplier, variant và XSS.

---

## 28. Các quyết định đã chốt

| Chủ đề | Quyết định |
| --- | --- |
| Nguồn Product mặc định | Tiki JSON đã crawl |
| Product model giai đoạn đầu | Flatten variant thành Product độc lập |
| Seller | Chỉ import `current_seller` |
| Seller khác | Không import `other_sellers` |
| Category | Mở rộng có kiểm soát và có translation |
| Category không map được | Reject |
| Supplier chưa tồn tại | Reject, không tự tạo trong import |
| Brand thiếu | Reject nếu chưa có policy cụ thể |
| Image thiếu | Reject, không dùng placeholder |
| Price thiếu/không hợp lệ | Reject |
| Currency | Auto-fill `VND` |
| Source identity | `source + sourceId` |
| SKU thiếu | Synthetic SKU có prefix rõ ràng |
| Stock qty | Ưu tiên qty kể cả bằng 0 |
| Available không có qty | Stock mô phỏng theo staging config |
| Out of stock | `countInStock = 0` |
| HTML | Sanitize bằng thư viện chuyên dụng |
| Error report | Mã lỗi và field/value dạng object |
| Legacy upsert | Migration riêng, không fallback mù |
| Product seeding | Không phụ thuộc GearVN trong luồng mới |
| Dữ liệu Product cũ | Reset có kiểm soát trước khi dùng bộ Tiki |
| Cloudinary cũ | Chỉ xóa asset thuộc Product mục tiêu đã inventory |
| Cleanup | Tách riêng preview/confirm/execute/verify khỏi import |
| Môi trường cleanup | Development/staging mặc định; production cần phê duyệt riêng |

---

## 29. Các giá trị cần cấu hình trước khi triển khai

Các giá trị sau chưa nên hard-code trong Transformer:

- Đường dẫn file input.
- Đường dẫn các file output.
- Danh sách category mapping.
- Danh sách supplier được phép hoặc nguồn lấy supplier từ DB.
- `simulatedStockQty`.
- Profile `staging` hoặc `production`.
- Chính sách trạng thái stock không xác định.
- Chính sách `originalPrice < price`.
- Chính sách brand `No Brand`.
- Allowlist HTML tags.
- Allowlist HTML attributes.
- Allowlist URL schemes.
- Danh sách domain ảnh được phép nếu bật remote check.
- Timeout và concurrency khi kiểm tra ảnh.
- Ngưỡng rejected record cho phép trước khi dừng import.

---

## 30. Roadmap triển khai

### Phase 0: Cleanup dữ liệu GearVN

1. Xác định môi trường được phép reset.
2. Tạo database snapshot/backup.
3. Inventory Product GearVN và Product ambiguous.
4. Inventory reference reviews/orders/coupons/cache.
5. Inventory Cloudinary public IDs.
6. Chạy cleanup preview.
7. Xác nhận phạm vi xóa.
8. Xóa dữ liệu phụ thuộc theo profile.
9. Xóa Cloudinary asset đã xác nhận.
10. Xóa Product theo manifest `_id`.
11. Verify database, Cloudinary và report.
12. Chỉ chuyển phase tiếp theo khi cleanup report `verified: true`.

### Phase 1: Backend foundation

1. Bổ sung source identity vào Product schema.
2. Bổ sung index phù hợp.
3. Kiểm tra Product legacy.
4. Mở rộng validator.
5. Cập nhật import controller.
6. Cập nhật export giữ identity.
7. Bổ sung test upsert theo source identity.

### Phase 2: Category và supplier readiness

1. Chốt danh sách category mở rộng.
2. Tạo Category record.
3. Tạo translation key và bản dịch.
4. Tạo hoặc phê duyệt supplier Tiki.
5. Viết preflight check.
6. Kiểm tra currency VND.

### Phase 3: Transformer

1. Đọc config ngoài code.
2. Parse raw Tiki JSON.
3. Flatten variant.
4. Resolve source identity.
5. Resolve price.
6. Resolve category/supplier.
7. Resolve image.
8. Sanitize description.
9. Extract specs.
10. Resolve stock.
11. Tạo clean/reject/report.

### Phase 4: Dry-run và import thử

1. Chọn một nhóm nhỏ sản phẩm đại diện.
2. Chạy Transformer.
3. Kiểm tra report.
4. Chạy dry-run.
5. Kiểm tra category/supplier/identity.
6. Import thật nhóm nhỏ.
7. Kiểm tra frontend và database.

### Phase 5: Import toàn bộ

1. Chạy preflight lần cuối.
2. Snapshot hoặc backup database theo quy trình môi trường.
3. Transform toàn bộ file.
4. Xem reject report.
5. Import upsert.
6. Kiểm tra số lượng insert/update/unchanged.
7. Kiểm tra duplicate source identity.

### Phase 6: Seed dữ liệu phụ

1. Seed spec translations.
2. Seed reviews.
3. Seed orders nếu đủ customers/currencies.
4. Seed coupons.
5. Chạy kiểm tra relationship bằng Mongo `_id`.

### Phase 7: Ổn định và vận hành

1. Theo dõi report qua nhiều lần import.
2. Bổ sung category mapping mới khi cần.
3. Theo dõi synthetic SKU.
4. Theo dõi stock simulated.
5. Đánh giá lỗi ảnh từ xa.
6. Xem lại reject theo nhóm supplier/category.
7. Chỉ chuyển production policy sau khi staging ổn định.

---

## 31. Kết luận

Luồng mới phải xem file Tiki là **raw source**, không phải dữ liệu có thể ghi thẳng vào Product.

Kiến trúc đúng là:

```text
Raw source
→ Validate
→ Normalize
→ Sanitize
→ Resolve identity
→ Resolve database references
→ Reject dữ liệu lỗi
→ Dry-run
→ Import upsert
→ Verify
→ Seed dependent data
```

Mục tiêu không phải là import bằng mọi giá toàn bộ 401 item, cũng không phải xóa dữ liệu cũ bằng một lệnh tổng quát, mà là tạo ra một tập Product sạch sau một phase reset có kiểm soát:

- Có identity nguồn rõ ràng.
- Có liên kết category/supplier hợp lệ.
- Có giá và ảnh dùng được.
- Không chứa HTML nguy hiểm.
- Không tạo duplicate khi import lại.
- Có thể truy vết từ Product nội bộ về dữ liệu Tiki.
- Có report minh bạch cho mọi record bị loại.

Tài liệu này là cơ sở để triển khai backend foundation và Transformer ở các bước tiếp theo. Trong phạm vi tài liệu, chưa thay đổi code và chưa chạy import dữ liệu thật.
