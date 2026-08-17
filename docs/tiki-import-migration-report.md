# Báo cáo chuyển đổi nguồn sản phẩm GearVN sang Tiki

## 1. Mục tiêu

Chuyển luồng tạo Product từ nguồn GearVN sang dữ liệu JSON được crawl từ Tiki, đồng thời vẫn sử dụng chức năng import/export Product trong giao diện Admin.

Luồng mục tiêu:

```text
Seed dữ liệu nền
→ Chuẩn hóa JSON raw Tiki
→ Kiểm tra category/supplier/source identity
→ Dry-run
→ Import qua giao diện Admin
→ Seed dữ liệu phụ thuộc Product
```

Phạm vi báo cáo này bao gồm các lỗi, thay đổi code và kết quả kiểm tra trong quá trình chuẩn bị import dữ liệu Tiki.

## 2. Hiện trạng ban đầu

### 2.1. Vấn đề GearVN

Legacy Product seeder gọi endpoint GearVN bên ngoài và đã bị loại bỏ hoàn toàn. Luồng seed mặc định và phase `pre-products` không còn có chức năng tạo Product từ API nguồn ngoài; Product phải được import qua pipeline Product/adapter tương ứng.

### 2.2. Dữ liệu Tiki khác schema Product nội bộ

JSON raw Tiki chứa các field như:

```text
configurable_products
current_seller
categories
stock_item
specifications
```

Trong khi Product nội bộ cần các field đã chuẩn hóa:

```text
source
sourceId
sourceParentId
sku
category
supplier
baseCurrencyCode
price
image
```

Vì vậy JSON raw Tiki không được upload trực tiếp vào API import Product hiện tại. Nó phải đi qua transformer trước.

## 3. Các thay đổi code đã thực hiện

### 3.1. Khóa import theo định danh Tiki

File:

```text
online-store-backend/src/controllers/productImportController.js
```

Đã thay đổi:

- Ưu tiên lookup theo `source + sourceId`.
- Cho phép mode `update` dùng source identity, không bắt buộc phải có MongoDB `productId`.
- Không fallback theo `name + brand` đối với Product có `source = TIKI`.
- Chuẩn hóa source khi đối chiếu Product hiện có.
- Tránh trường hợp Tiki update nhầm Product cũ chỉ vì tên và brand giống nhau.

### 3.2. Chặn duplicate source identity

File:

```text
online-store-backend/src/utils/productImportValidator.js
```

Đã bổ sung kiểm tra duplicate `source + sourceId` trong cùng một file import.

Mã lỗi:

```text
DUPLICATE_SOURCE_ID
```

### 3.3. Bổ sung kiểm tra seller trong preflight

File:

```text
online-store-backend/src/sources/tiki/productTransformer.js
```

Preflight hiện kiểm tra seller thực tế trong file raw Tiki có tồn tại trong database hay không.

Điều này giúp ngăn việc import hàng loạt seller lạ thành supplier không hợp lệ.

### 3.4. Truyền seller từ file raw vào preflight

File:

```text
online-store-backend/src/sources/tiki/transformProducts.js
```

Script đã đọc seller từ:

```text
current_seller
configurable_products[].current_seller
configurable_products[].seller
```

Sau đó kiểm tra các seller này trước khi transform.

### 3.5. Hỗ trợ JSON có UTF-8 BOM

File:

```text
online-store-backend/src/sources/tiki/transformProducts.js
```

Transformer đã loại bỏ UTF-8 BOM và khoảng trắng đầu/cuối file trước khi gọi `JSON.parse`.

Điều này xử lý lỗi thường gặp khi file JSON được tạo hoặc lưu lại bằng PowerShell/Windows.

### 3.6. Khớp category an toàn

Category Tiki không còn được map bằng bảng hard-code trong code. Transformer normalize tên rồi chỉ khớp với category đang tồn tại và chưa bị xóa trong MongoDB.

- Category khớp trực tiếp được import.
- Category không khớp trả `CATEGORY_NOT_FOUND` và đi vào report reject.
- Không tự gán category gần nhất.
- Không tự tạo category nguồn trong auto-import.

Cách này giữ category nội bộ là dữ liệu động, tránh đưa dữ liệu nguồn chưa được duyệt vào storefront.

Các npm command tiện dụng:

```powershell
npm run products:filter -- --input=./data/products.json --output=./data/products-filtered.json
npm run products:transform -- --input=./data/products-filtered.json
npm run products:review -- --input=./data/products-filtered.json
```

`products.json` chỉ là tên file ví dụ. Lệnh `products:filter` giữ toàn bộ seller nếu không truyền `--seller`; có thể lọc một seller cụ thể bằng cách thêm `--seller="Seller Name"`.

Lệnh filter cũng xử lý seller ở từng configurable variant. Lệnh `products:transform` ghi output import vào `tiki-import-output/`; `products:review` bật `--include-raw` và ghi output kiểm tra vào thư mục mặc định.

## 4. Chuẩn bị database đã thực hiện

Đã chạy:

```powershell
npm run seed:pre-products
```

Các module chính đã chạy thành công:

- Languages
- Translations
- Currencies
- Users/admin
- Categories
- Suppliers
- Customers
- Shipping providers
- Category translations

Supplier factory có các supplier mặc định, trong đó có `Tiki Trading` để hỗ trợ dataset mẫu:

```text
online-store-backend/src/factories/supplierFactory.js
```

Currency cần dùng:

```text
VND
```

### 4.1. Cảnh báo locations đã được xử lý

Lần seed trước báo:

```text
Ward data was fetched but no wards exist in the database
```

Nguyên nhân là unique index của `Ward` chỉ dùng `provider + wardCode`, trong khi ward code cần được định danh trong phạm vi district. Index đã được đổi thành `provider + districtId + wardCode`; location seeder chủ động xóa legacy index rồi đồng bộ index mới trước khi insert.

Lần chạy trước đã fetch được:

- 65 provinces
- 726 districts
- 11981 wards

Sau khi chạy lại `seed:pre-products`, cần xác nhận log lưu ward thành công và kiểm tra số bản ghi `Ward` trong database.

## 5. Quy trình xử lý file JSON

### 5.1. File raw ban đầu

JSON Tiki được lưu tại file do người vận hành chỉ định, ví dụ:

```text
data/products.json
```

Tên file chỉ là tên do người vận hành tạo, không phải file được project tự sinh.

### 5.2. Lọc seller

File raw ban đầu chứa nhiều seller khác nhau. Seller không bị hard-code trong pipeline:

- Không truyền `--seller`: giữ toàn bộ seller trong file raw.
- Truyền `--seller=Seller Name`: chỉ giữ seller được chỉ định.
- Mỗi seller vẫn phải tồn tại trong database dưới dạng Supplier; không tự đổi seller này thành seller khác.

Dataset mẫu của báo cáo trước đây dùng `Tiki Trading`, nên kết quả bên dưới là kết quả của lần chạy có lọc seller đó.

Kết quả command:

```json
{
  "source_item_count": 401,
  "filtered_item_count": 57,
  "source_variant_count": 299,
  "filtered_variant_count": 16
}
```

Đã lọc được 57 sản phẩm cha và lưu thành:

```text
data/products-filtered.json
```

Không tự động gộp seller khác vào cùng một supplier, vì sẽ làm sai dữ liệu supplier. Nếu không truyền `--seller`, các seller được giữ nguyên và mỗi seller phải được resolve thành Supplier tương ứng.

### 5.3. Chạy transformer

Lệnh baseline đã chạy:

```powershell
npm run products:transform -- --input=data\products-filtered.json
```

Sau khi bổ sung mapping `Tai Nghe Có Dây → Audio`, lệnh tiện dụng để chạy lại là:

```powershell
npm run products:transform -- --input=data\products-filtered.json
```

Baseline trước mapping Audio là 13 record hợp lệ và 55 record bị reject. Sau khi chạy lại với mapping mới, kết quả đã xác nhận:

```json
{
  "success": true,
  "raw_item_count": 57,
  "flattened_record_count": 68,
  "qualified_count": 21,
  "rejected_count": 47,
  "variant_count": 16,
  "simulated_stock_count": 0,
  "reported_stock_count": 21,
  "out_of_stock_count": 0,
  "unknown_stock_count": 0,
  "synthetic_sku_count": 0,
  "rejection_breakdown": {
    "UNAPPROVED_CATEGORY": 47
  }
}
```

Output:

```text
tiki-import-output/ready_for_import.json
tiki-import-output/rejected-products.json
tiki-import-output/transform-report.json
```

Kết quả upload/enrichment trên backend:

```text
[FILE_UPLOAD] Successfully enriched 21 products
```

Điều này xác nhận file `ready_for_import.json` hiện tại đã được Admin nhận đủ 21 record. Cần kiểm tra response cuối của mode `upsert` để xác nhận số record created/updated trong database.

## 6. Kết quả reject sau mapping Audio

Sau khi chạy lại transformer, 47 record bị reject và toàn bộ đều có cùng nguyên nhân:

```text
UNAPPROVED_CATEGORY
```

Các category nguồn còn bị reject:

| Số lượng | Category Tiki |
| ---: | --- |
| 33 | Laptop - Máy Vi Tính - Linh kiện |
| 6 | Ổ Cứng Di Động |
| 2 | Root |
| 1 | Router Wifi |
| 1 | Bộ Kích Sóng Wifi |
| 1 | Phần Mềm Máy Tính |
| 1 | Máy In Phun |
| 1 | Phụ Kiện Thiết Bị Mạng |
| 1 | USB Wifi |

### 6.1. Ý nghĩa

Supplier, JSON format, giá, ảnh, tồn kho và source identity của 21 record hợp lệ đã vượt qua kiểm tra.

47 record còn lại bị reject do category nguồn chưa có mapping an toàn. Đây là hành vi đúng theo strict mode; transformer không tự gán category giả.

### 6.2. Kết quả kiểm tra mẫu

Đã dùng output có `--include-raw` để kiểm tra sản phẩm đại diện và danh sách tên sản phẩm trong các nhóm không rõ ràng.

`Laptop - Máy Vi Tính - Linh kiện` là category bị trộn nhiều loại sản phẩm:

- Màn hình Xiaomi, LG, ViewSonic và Dell.
- Phần mềm Microsoft và Kaspersky.
- Máy in, máy scan.
- USB Wifi, router, bộ kích sóng Wifi.
- Dây mạng và switch mạng.

Không có cơ sở để map toàn bộ nhóm này sang `Office Laptop`.

`Tai Nghe Có Dây` chứa cả tai nghe Bluetooth, EarPods Lightning, tai nghe có dây và tai nghe chụp tai. Tuy tên nguồn không hoàn toàn chính xác, các sản phẩm đều thuộc nhóm âm thanh nên đã được map sang `Audio`.

`Root` cũng chứa sản phẩm không cùng loại, gồm màn hình và USB Wifi, nên tiếp tục bị reject.

### 6.3. Gaming laptop

Dataset hiện tại không có sản phẩm thuộc category nguồn `Laptop Gaming`, nên mapping:

```text
Laptop Gaming → Gaming Laptop
```

chưa được kích hoạt trong lần chạy này. Việc không xuất hiện gaming laptop là do file raw hiện tại không chứa nhóm sản phẩm đó, không phải do transformer làm mất sản phẩm.

Muốn nhập gaming laptop, cần crawl một dataset có category nguồn cụ thể `Laptop Gaming`, lọc seller rồi chạy transform riêng để kiểm tra.

### 6.4. Quyết định category hiện tại

Không duy trì mapping source → category nội bộ trong code. Các category sau tiếp tục bị reject vì không khớp trực tiếp với category nội bộ hoặc chưa có category nội bộ phù hợp:

```text
Laptop - Máy Vi Tính - Linh kiện
Ổ Cứng Di Động
Root
Router Wifi
Bộ Kích Sóng Wifi
Phần Mềm Máy Tính
Máy In Phun
Phụ Kiện Thiết Bị Mạng
USB Wifi
```

Không tạo category mới chỉ để giảm số lượng reject. Chỉ bổ sung category nội bộ khi nghiệp vụ xác nhận store thực sự muốn bán nhóm sản phẩm đó.

## 7. Cách import qua giao diện Admin

Sau khi database nền sẵn sàng:

1. Chạy `seed:pre-products` nếu database chưa có dữ liệu nền.
2. Đặt file raw vào `data/products.json`.
3. Chạy lệnh lọc seller nếu cần. Nếu muốn giữ toàn bộ seller, bỏ qua bước này hoặc chạy lệnh không có `--seller`:

```powershell
npm run products:filter -- --input=./data/products.json --output=./data/products-filtered.json
```

Để chỉ chọn một seller cụ thể, thêm `--seller="Seller Name"`.

4. Kiểm tra file đã lọc tại `data/products-filtered.json`.
5. Chạy transformer:

```powershell
npm run products:transform -- --input=data\products-filtered.json
```

6. Kiểm tra `transform-report.json`.
7. Xác nhận các reject còn lại đều là category đã được chủ động từ chối, không có lỗi seller, giá, ảnh, tồn kho hoặc source identity bất thường.
8. Mở giao diện Admin.
9. Upload:

```text
tiki-import-output/ready_for_import.json
```

10. Chạy Dry run trước.
11. Kiểm tra category, supplier, giá, ảnh và số lượng tồn kho.
12. Import thật bằng mode `upsert`.
13. Kiểm tra response import có đủ record created/updated.
14. Chỉ chạy `seed:post-products` sau khi Product đã import và Product translation đã được tạo/approved.

```powershell
npm run seed:post-products
```

Không upload JSON raw Tiki trực tiếp vào giao diện import hiện tại, vì JSON raw chưa có schema Product nội bộ. File raw phải đi qua `npm run products:filter -- --input=./data/products.json --output=./data/products-filtered.json` và `npm run products:transform -- --input=data\products-filtered.json` trước.

## 8. Kết quả kiểm thử

### 8.1. Validator Tiki

Lệnh:

```bash
npx mocha src/test/sourceImportValidator.test.js
```

Kết quả:

```text
4 passing
```

Đã kiểm tra:

- Giữ đúng source identity.
- Giữ metadata Cloudinary.
- Reject source identity thiếu `sourceId`.
- Reject duplicate Tiki source identity.

### 8.2. Transformer và preflight Tiki

Lệnh:

```bash
npx mocha src/test/sourceProductTransformer.test.js
```

Kết quả:

```text
8 passing
```

Đã kiểm tra:

- Flatten configurable variants.
- Giữ source identity.
- Sanitize description.
- Kiểm tra giá, ảnh, tồn kho và category/supplier.
- Kiểm tra HTTPS Tiki CDN.
- Preflight seller thiếu trong database.

### 8.3. Syntax

Đã kiểm tra syntax các file backend liên quan:

```bash
node --check src/controllers/productImportController.js
node --check src/utils/productImportValidator.js
node --check src/sources/tiki/productTransformer.js
node --check src/sources/tiki/transformProducts.js
node --check src/sources/tiki/filterProductsBySeller.js
```

Kết quả: đạt.

### 8.4. Suite Tiki

Đã chạy:

```bash
npx mocha src/test/sourceProductTransformer.test.js src/test/sourceImportValidator.test.js
```

Kết quả:

```text
12 passing
sourceProductTransformer.test.js: 8 passing
sourceImportValidator.test.js: 4 passing
```

Test E2E còn thất bại ở bước kết nối MongoDB vì môi trường chạy test không có `MONGO_URI`:

```text
MongooseError: The `uri` parameter to `openUri()` must be a string, got "undefined"
```

Đây là vấn đề cấu hình môi trường test, chưa phải lỗi từ transformer hoặc validator Tiki.

### 8.5. Post-products seed

Lệnh:

```powershell
npm run seed:post-products
```

Kết quả lần chạy hiện tại:

```text
Found 13 products and 0 approved translation records
Product translation catalog incomplete: 117/117 product-language records need attention
CRITICAL module failed: specTranslations
```

Lệnh thất bại ở module `specTranslations` vì lần chạy đó database mới có 13 Product cũ và chưa có Product translation được approved. Đây không phải lỗi của Tiki transformer. Không chạy lại bước này cho đến khi import đủ Product và hoàn tất workflow tạo/approve translation.

## 9. Trạng thái hiện tại

| Hạng mục | Trạng thái |
| --- | --- |
| Seed nền không có Product seeder từ API nguồn ngoài | Đạt |
| Supplier được resolve theo seller trong file | Đạt |
| JSON raw Tiki đọc được | Đạt |
| Lọc seller tùy chọn | Đạt |
| Flatten configurable variants | Đạt |
| Source identity `TIKI + sourceId` | Đạt |
| Chặn duplicate source identity | Đạt |
| Preflight seller | Đạt |
| UTF-8 BOM handling | Đạt |
| Transform sau mapping Audio | Đạt một phần: 21/68 record |
| Mapping `Tai Nghe Có Dây → Audio` | Đạt |
| Lọc seller bằng npm command | Đạt |
| Từ chối category hỗn tạp/không an toàn | Đạt |
| Category mapping toàn bộ dữ liệu | Cố ý chưa hoàn tất; các nhóm không an toàn tiếp tục reject |
| Upload/enrich qua giao diện Admin | Đạt: 21 products |
| Import upsert hoàn tất trong database | Chưa xác nhận response cuối |
| Seed post-products | Chưa đạt: thiếu approved Product translations |
| Locations/wards | Cần xử lý riêng |
| E2E test có MongoDB | Chưa xác minh do thiếu `MONGO_URI` |

## 10. Việc cần làm tiếp theo

1. Kiểm tra response cuối của import để xác nhận created/updated đủ 21 record.
2. Xác nhận 47 reject còn lại đều thuộc nhóm category đã chủ động từ chối.
3. Hoàn tất workflow tạo và approve Product translations.
4. Chạy `seed:post-products` sau khi translations đạt.
5. Crawl dataset riêng cho category `Laptop Gaming` nếu cần nhập gaming laptop.
6. Cấu hình `MONGO_URI` cho môi trường test để chạy E2E.
7. Xử lý riêng lỗi seed locations nếu cần dùng order/address/shipping.

## 11. Quy trình tự động nhận file JSON

Để tự động xử lý file sản phẩm mà không cần chạy thủ công từng bước, backend có watcher:

```text
online-store-backend/src/sources/tiki/autoImportProducts.js
```

NPM command:

```powershell
npm run products:auto-import
```

### 11.1. Thư mục nhận file

Chỉ cần đặt một file JSON bất kỳ tên gì trực tiếp vào:

```text
online-store-backend/data/
```

Ví dụ:

```text
online-store-backend/data/laptop-gaming-2026.json
online-store-backend/data/tiki-products-01.json
```

Watcher hỗ trợ các dạng JSON sau:

- Mảng sản phẩm trực tiếp.
- Object có field `products`.
- Object có field `data`.
- Object có field `items`.
- File đã được transform sẵn theo schema Product nội bộ.

Không đặt file cần import vào các thư mục con của `data`.

### 11.2. Các bước được tự động thực hiện

Khi phát hiện file mới, watcher sẽ:

1. Đợi file ghi hoàn tất trước khi đọc.
2. Nhận diện file raw Tiki hoặc file đã chuẩn hóa.
3. Đọc seller thực tế từ `current_seller`, `configurable_products[].current_seller` hoặc `seller`.
4. Kiểm tra seller đã tồn tại trong database.
5. Reject record nếu supplier chưa được chuẩn bị, không tự tạo supplier từ dữ liệu crawl.
6. Khớp category trực tiếp với category động trong database; reject nếu không khớp.
7. Flatten configurable variants và chuẩn hóa Product.
8. Upload ảnh Tiki lên Cloudinary.
9. Upsert Product vào MongoDB theo `source + sourceId`.
10. Enqueue dọn ảnh Cloudinary cũ khi Product được cập nhật.
11. Ghi report kết quả xử lý.

### 11.3. Trạng thái file sau khi xử lý

File xử lý thành công được chuyển sang:

```text
online-store-backend/data/.processed/
```

File lỗi được chuyển sang:

```text
online-store-backend/data/.failed/
```

Report được lưu tại:

```text
online-store-backend/data/.auto-import-reports/
```

Các thư mục trạng thái bắt đầu bằng dấu chấm và không được watcher xử lý lại.

### 11.4. Cách vận hành

Khởi tạo dữ liệu nền trước:

```powershell
npm run seed:pre-products
```

Khởi động watcher:

```powershell
npm run products:auto-import
```

Sau đó chỉ cần copy file JSON vào `online-store-backend/data/`. Không cần chạy `products:filter`, `products:transform` hoặc upload thủ công qua Admin.

Để kiểm tra file mà không ghi Product vào database:

```powershell
npm run products:auto-import:dry-run
```

Để xử lý các file đang có trong `data` một lần rồi thoát:

```powershell
npm run products:auto-import:once
```

### 11.5. Điều kiện môi trường

Import thật yêu cầu:

- `MONGO_URI` để kết nối MongoDB.
- Tài khoản admin đã tồn tại sau khi chạy seed nền.
- Các biến Cloudinary để tải ảnh Tiki lên Cloudinary.
- File ảnh nguồn dùng HTTPS và thuộc host Tiki CDN được cho phép.

Nếu thiếu điều kiện hoặc dữ liệu không hợp lệ, Product không được ghi thành công; file sẽ được chuyển sang `.failed` và lỗi được ghi trong report. Auto-import không tự tạo Supplier hoặc Category từ dữ liệu crawl; các record thiếu reference hợp lệ sẽ bị reject.

### 11.6. Lưu ý về pipeline thủ công

Pipeline thủ công dùng các command `products:filter`, `products:transform` và `products:review`; mặc định chấp nhận mọi seller, hoặc lọc seller cụ thể bằng `--seller`. Pipeline tự động `products:auto-import` là luồng riêng, đọc seller và category động từ dữ liệu nguồn rồi chỉ resolve với reference đã tồn tại trong database.

## 12. Tự động crawl và import sản phẩm

Crawler Node nằm tại:

```text
online-store-backend/src/sources/tiki/crawlProducts.js
```

Crawler đọc toàn bộ Category chưa xóa và Supplier có `isDefaultImportSupplier: true` từ MongoDB. Với mỗi category, crawler dùng `sourceNames` và `name` đang cấu hình trong database để tìm kiếm động, sau đó chỉ ghi những record hợp lệ với đúng category đích. Mặc định là tối thiểu 50 record hợp lệ cho mỗi category.

Chạy crawler cho toàn bộ danh mục:

```powershell
npm run products:crawl
```

Các tham số chính:

- `--min-per-category=50`: số record hợp lệ tối thiểu cho mỗi category; mặc định là 50.
- `--max-pages=20`: số trang tối đa cho từng search term; mặc định là 20.
- `--page-size=40`: số record trên một trang; mặc định là 40.
- `--delay-ms=250`: khoảng nghỉ giữa các request trang; mặc định là 250ms.
- `--output=./data/products-crawl.json`: file raw JSON đầu ra.

Ví dụ tăng mục tiêu cho mọi category:

```powershell
npm run products:crawl -- --min-per-category=60
```

Crawler deduplicate theo `item.id` trên toàn bộ các từ khóa, không dừng chỉ vì một page không có record mới, và không hard-code tên sản phẩm, category, seller hoặc regex loại phụ kiện. Nó giữ dữ liệu category, seller, brand, giá, ảnh, mô tả, tồn kho và specifications từ nguồn để pipeline transform quyết định việc hợp lệ.

Sau khi crawler ghi xong file, watcher tự động sẽ nhận file và tiếp tục transform/import nếu đang chạy:

```powershell
npm run products:auto-import
```

Quy trình đầy đủ:

```text
npm run seed:pre-products
→ npm run products:crawl
→ ghi file JSON raw chỉ chứa record hợp lệ cho từng category động vào data/
→ npm run products:auto-import:dry-run (transform/validate, không ghi DB)
→ npm run products:auto-import:once
→ resolve Supplier/Category đã có và reject reference chưa hợp lệ
→ upload ảnh Cloudinary
→ upsert Product
→ website đọc Product từ MongoDB
```

Crawler có retry theo từng page và dừng với lỗi nếu page không thể tải sau số lần retry. Không ghi file output một phần sau lỗi page. Sau mỗi batch vẫn cần xem report trong `.auto-import-reports/` để kiểm tra record bị reject hoặc category nguồn bất thường.

## 13. Vấn đề dynamic/static và chính sách không hard-code

### 13.1. Vấn đề

Pipeline sản phẩm cần phân biệt rõ dữ liệu động lấy từ nguồn crawl với dữ liệu tĩnh của hệ thống. Nếu dùng bảng mapping hoặc static translation để tự biến đổi category, brand, seller hoặc nội dung sản phẩm, dữ liệu có thể bị gán sai và khó bảo trì khi nguồn Tiki thay đổi.

Các lỗi cần tránh:

- Hard-code `source category → internal category` trong `importConfig.js`.
- Tự gán category gần nhất khi category nguồn không khớp.
- Tự tạo Supplier hoặc Category từ chuỗi do nguồn crawl gửi lên.
- Gửi nội dung sản phẩm động qua static i18n translation.
- Đưa static feature key vào dynamic translation. Field `Product.features` đã được loại khỏi luồng sản phẩm; nếu gặp dữ liệu legacy, không được tự dịch hoặc hiển thị key thô.

### 13.2. Quyết định triển khai

- Brand, category, supplier, giá, tồn kho, mô tả, specifications và ảnh là **dynamic data**; lấy từ API nguồn hoặc database, sau đó qua validation.
- Locale key, label UI và nội dung giao diện cố định là **static data**; lấy từ catalog locale, không dùng để suy đoán dữ liệu Product.
- Category được normalize rồi khớp với `Category.name` hoặc `Category.sourceNames` đang tồn tại và chưa bị xóa trong MongoDB.
- `Category.sourceNames` là cấu hình dữ liệu do admin quản lý, không phải mapping hard-code trong importer.
- Supplier được normalize rồi khớp chính xác với supplier đang tồn tại và chưa bị xóa trong MongoDB.
- Record không khớp bị reject với mã ổn định như `CATEGORY_NOT_FOUND` hoặc `SUPPLIER_NOT_FOUND`, kèm giá trị nguồn trong report.
- Không tự tạo reference, không tự map gần đúng và không dùng tên sản phẩm để suy đoán category.

### 13.3. Luồng tự động sau thay đổi

```text
Crawler list API
→ lấy detail theo product ID
→ merge dữ liệu dynamic
→ ghi JSON array
→ normalize và validate
→ resolve reference động từ MongoDB
→ reject record chưa xác định
→ upload ảnh Cloudinary
→ upsert Product theo source + sourceId
```

Dry-run phải được chạy trước import thật:

```powershell
npm run products:auto-import -- --data-dir=data --dry-run --once
```

Chỉ record vượt qua validation và resolve đầy đủ reference mới được phép ghi Product. Việc category chưa khớp phải được xử lý như một quyết định dữ liệu riêng, không sửa bằng cách thêm mapping hard-code vào pipeline.

### 13.4. Quyết định dynamic mapping theo nguồn crawl

Pipeline được phép resolve reference động từ dữ liệu nguồn, nhưng không được tự suy đoán hoặc tự gán giá trị gần đúng.

- Crawler giữ lại mọi record có dữ liệu tối thiểu hợp lệ; thiếu seller không làm mất record raw.
- Transformer đọc toàn bộ `categories` và `breadcrumbs` của Tiki để tìm tên nguồn có thể khớp.
- Category nội bộ được resolve qua `Category.name` hoặc danh sách `Category.sourceNames` do admin quản lý trong MongoDB.
- Supplier được resolve chính xác từ `current_seller`, `seller` hoặc `seller_name` sau khi normalize tên.
- Category/supplier mới được phát hiện phải xuất hiện trong preflight/report để admin duyệt trước khi thêm alias hoặc reference vào database.
- Không tự tạo Category/Supplier trong lúc import, không dùng category gần nhất, không dùng supplier mặc định và không lấy tên sản phẩm để suy đoán reference.
- Record thiếu seller hoặc chưa có reference hợp lệ vẫn được lưu trong report với `SUPPLIER_NOT_FOUND` hoặc `CATEGORY_NOT_FOUND`, không được ghi Product.

Luồng xử lý thống nhất:

```text
Crawl raw data
→ Giữ record đủ name/price/image
→ Extract toàn bộ category/breadcrumb/seller nguồn
→ Normalize và preflight với MongoDB
→ Admin duyệt reference/alias mới nếu cần
→ Transform lại
→ Dry-run
→ Import Product hợp lệ
```

## 14. Troubleshooting: auto-import đã chạy nhưng post-products thất bại

### 14.1. Hiện tượng

Watcher có thể báo:

```text
status: completed_with_rejections
qualifiedCount: 0
rejectedCount: 1
persistence.inserted: 0
```

Trong trường hợp này file crawl đã được đọc và xử lý, nhưng không có Product nào được ghi vào MongoDB. File thành công được chuyển sang `data/.processed/`; report được lưu tại `data/.auto-import-reports/`.

Các lỗi thường gặp:

```text
CATEGORY_NOT_FOUND
SUPPLIER_NOT_FOUND
```

`CATEGORY_NOT_FOUND` nghĩa là category nguồn chưa khớp chính xác với category đang tồn tại trong MongoDB. `SUPPLIER_NOT_FOUND` nghĩa là seller nguồn chưa resolve được thành Supplier hợp lệ. Pipeline không tự tạo hoặc tự gán gần đúng các reference này.

### 14.2. Vì sao `seed:post-products` thất bại

`seed:post-products` bắt buộc phải có ít nhất một Product chưa bị xóa. Nếu chưa có Product được import, module `specTranslations` dừng với:

```text
Cannot run post-products seed without imported products
```

Không chạy lại `seed:post-products` để thử khi report auto-import vẫn có `qualifiedCount: 0` hoặc `persistence.inserted/updated: 0`.

### 14.3. Cách đọc report mới nhất trên PowerShell

Không nhập trực tiếp đường dẫn thư mục như một lệnh:

```powershell
data\.auto-import-reports\
```

Dùng lệnh đọc thư mục:

```powershell
Get-ChildItem .\data\.auto-import-reports
Get-ChildItem .\data\.processed
```

Đọc report mới nhất:

```powershell
$report = Get-ChildItem .\data\.auto-import-reports\*.json |
  Sort-Object LastWriteTime |
  Select-Object -Last 1

Get-Content $report.FullName
```

Có thể xem nhanh các trường quyết định:

```powershell
(Get-Content $report.FullName -Raw | ConvertFrom-Json) |
  Select-Object status, qualifiedCount, rejectedCount, persistence
```

### 14.4. Điều kiện chạy post-products

Chỉ chạy:

```powershell
npm run seed:post-products
```

sau khi report có một trong các trạng thái hợp lệ:

```json
{
  "qualifiedCount": 1,
  "persistence": {
    "inserted": 1
  }
}
```

hoặc Product đã tồn tại và được cập nhật:

```json
{
  "qualifiedCount": 1,
  "persistence": {
    "updated": 1
  }
}
```

### 14.5. Debug kết nối MongoDB

Khi auto-import báo lỗi kết nối hoặc `Client must be connected before running operations`, bật debug trong PowerShell:

```powershell
$env:MONGO_DEBUG = "true"
$env:AUTO_IMPORT_DEBUG = "true"
npm run products:auto-import:dry-run
```

Debug chỉ in `readyState`, database name, host/port, bước query và stack lỗi; không in `MONGO_URI` hoặc credential. Tắt lại trong phiên PowerShell sau khi kiểm tra:

```powershell
Remove-Item Env:MONGO_DEBUG -ErrorAction SilentlyContinue
Remove-Item Env:AUTO_IMPORT_DEBUG -ErrorAction SilentlyContinue
```

Nếu còn `CATEGORY_NOT_FOUND`, cần xử lý category như một quyết định dữ liệu qua Admin hoặc seed data. Không thêm mapping hard-code chỉ để vượt qua validation. Không cần chạy lại `clear`, vì `clear` xóa toàn bộ collection và index MongoDB trước khi seed nền lại.
