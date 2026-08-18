# Kế hoạch import và seed sản phẩm từ dữ liệu crawler

## 1. Mục tiêu

Xây dựng luồng đưa sản phẩm từ các file CSV/JSON được crawler tạo ra vào MongoDB một cách:

- Không tạo sản phẩm trùng khi chạy lại.
- Có thể xử lý số lượng sản phẩm lớn theo từng batch.
- Có thể dừng và chạy tiếp mà không mất tiến độ.
- Không làm toàn bộ luồng seed thất bại chỉ vì một sản phẩm hoặc một batch lỗi.
- Hạn chế lỗi `429`, timeout và rate limit từ các dịch vụ dịch hoặc AI.
- Tách việc import sản phẩm khỏi seed dữ liệu nền hiện tại.

## 2. Nguồn dữ liệu và schema crawler

Thư mục mặc định:

```text
data/scraped-products/
```

Mỗi crawler tạo một file CSV và một file JSON. Schema đầu vào chuẩn, giữ nguyên thứ tự:

```text
Brand
ID
Name
SKU
Price_VND
Regular_Price
InStock
Categories
Attributes
Description
MainImage
GalleryImages
URL
```

`baseCurrencyCode` không cần có trong file crawler. Khi import, hệ thống tự gán:

```text
baseCurrencyCode = VND
```

## 3. Mapping sang Product schema

| Trường crawler | Trường Product | Quy tắc |
|---|---|---|
| `Brand` | `brand` | Chuẩn hóa chuỗi, bắt buộc |
| `Name` | `name` | Chuẩn hóa chuỗi, bắt buộc |
| `SKU` | `sku` | Dùng làm khóa dedupe chính nếu có |
| `Price_VND` | `price` | Số dương, tiền tệ VND |
| `Regular_Price` | `originalPrice` | Số dương nếu có |
| `InStock` | `countInStock` | Chuẩn hóa thành số lượng tồn kho |
| `Categories` | `category` | Resolve theo tên category trong database |
| `Attributes` | `specs` | Parse JSON string thành object |
| `Description` | `description` | Chuỗi đã sanitize |
| `MainImage` | `image` | Ảnh chính bắt buộc |
| `GalleryImages` | `images` | Parse danh sách URL |
| `ID` | Không lưu trực tiếp | Không dùng làm MongoDB ObjectId |
| `URL` | Không lưu trực tiếp ở phase đầu | Có thể dùng để dedupe khi chưa có SKU |
| `supplier` | Không hỗ trợ | Không đưa vào Product |
| `source` | Không hỗ trợ trong Product | Không đưa vào Product |
| `sourceId` | Không hỗ trợ | Không đưa vào Product |

## 4. Luồng xử lý đề xuất

### Phase 1: Quét và chọn file

- Tự động đọc các file `.csv` và `.json` trong `data/scraped-products/`.
- Cho phép chọn một file hoặc toàn bộ thư mục.
- Ưu tiên JSON nếu CSV và JSON có cùng prefix và cùng ngày.
- Không xử lý file tạm hoặc file không đúng schema.

### Phase 2: Dry-run

Dry-run không ghi database, chỉ tạo báo cáo:

- Tổng số dòng đọc được.
- Số dòng hợp lệ.
- Số dòng thiếu `Name`, `Brand`, giá hoặc ảnh chính.
- Số dòng trùng `SKU`.
- Số dòng trùng `URL`.
- Số category chưa resolve được.
- Số `Attributes` không parse được.
- Số giá hoặc tồn kho không hợp lệ.

Chỉ cho phép chạy import thật khi các lỗi nghiêm trọng đã được xử lý hoặc được người vận hành xác nhận bỏ qua.

### Phase 3: Normalize và validate

- Chuẩn hóa tên trường theo schema crawler.
- Parse `Attributes` bằng JSON; nếu không parse được thì ghi lỗi theo dòng.
- Chuyển `Price_VND` và `Regular_Price` sang number.
- Chuẩn hóa `InStock` về số nguyên không âm.
- Tách `GalleryImages` theo dấu phân cách crawler đang sử dụng.
- Loại bỏ giá trị rỗng và URL ảnh không hợp lệ.
- Sanitize các trường text trước khi ghi database.
- Gán `baseCurrencyCode: 'VND'`.

### Phase 4: Dedupe

Thứ tự nhận diện sản phẩm:

1. `SKU` hợp lệ.
2. `URL` nếu SKU rỗng.
3. Tổ hợp đã chuẩn hóa `brand + name` chỉ dùng để cảnh báo, không dùng làm khóa duy nhất tuyệt đối.

Các dòng trùng trong cùng một file phải được gộp trước khi ghi database. Với dữ liệu đã tồn tại, importer phải dùng upsert thay vì `create` hàng loạt không kiểm soát.

### Phase 5: Resolve category

- Đọc category từ trường `Categories` trong file crawler; nếu trường này trống thì suy ra phần category từ tên file `Brand_Category_Date`.
- Tìm category theo tên canonical hoặc `sourceNames` alias trong database.
- Nếu category từ crawler chưa tồn tại, pipeline đồng bộ category mới từ chính giá trị crawler, tự tạo `key` và `slug` chuẩn hóa; không dùng danh sách category hard-code trong pipeline.
- Đưa các dòng thiếu `Categories` vào báo cáo lỗi.
- Chỉ import những sản phẩm có category hợp lệ.

### Phase 6: Import theo batch

Thiết lập mặc định đề xuất:

```text
batchSize: 50
concurrency: 1
```

- Dùng `bulkWrite` với `upsert: true`.
- Mỗi batch được commit độc lập.
- Ghi trạng thái batch sau khi database xác nhận thành công.
- Một dòng lỗi không được làm mất các dòng hợp lệ trong cùng batch.
- Không gọi dịch hoặc AI trong phase import dữ liệu gốc.

## 5. Checkpoint và khả năng resume

Mỗi lần chạy cần có một `runId` và trạng thái xử lý:

- File nguồn.
- Hash hoặc thời điểm file.
- Tổng số dòng.
- Batch hiện tại.
- Số sản phẩm tạo mới.
- Số sản phẩm cập nhật.
- Số dòng bỏ qua.
- Số lỗi.
- Thời gian bắt đầu và kết thúc.

Khi chạy lại cùng một file, importer bỏ qua các batch đã thành công hoặc tiếp tục từ batch cuối chưa hoàn thành. Nếu file thay đổi, tạo `runId` mới.

## 6. Chiến lược chống rate limit

Import database và dịch/AI phải là hai luồng độc lập.

### Import database

- Không gọi AI.
- Batch nhỏ, concurrency thấp.
- Retry các lỗi tạm thời với exponential backoff.
- Không retry lỗi validation hoặc lỗi dữ liệu.

### Dịch sản phẩm

- Chạy sau khi import sản phẩm hoàn tất.
- Chỉ gửi các sản phẩm thiếu bản dịch.
- Chia nội dung thành queue, không chạy `Promise.all` cho toàn bộ sản phẩm.
- Giới hạn số request đồng thời, mặc định 1 hoặc 2.
- Có delay giữa các request.
- Khi chạy `npm run seed` một tiến trình, dùng lock trong bộ nhớ; không yêu cầu Redis.
- Redis chỉ cần khi nhiều process/server cùng chạy translation queue.
- Xử lý `429` bằng `Retry-After` nếu dịch vụ cung cấp.
- Exponential backoff cho timeout và lỗi 5xx.
- Giới hạn số lần retry.
- Khi một provider bị rate limit, tạm dừng queue thay vì tiếp tục gửi request.
- Lưu trạng thái từng sản phẩm để có thể resume.
- Cho phép chạy riêng từng ngôn ngữ.

## 7. Các lệnh chạy pipeline

`npm run seed` chạy toàn bộ pipeline theo thứ tự:

```text
seed nền -> crawler -> import upsert theo batch -> dịch sản phẩm -> seed phụ thuộc sản phẩm
```

Chạy toàn bộ crawler và xử lý tất cả file sản phẩm:

```bash
npm run seed
```

Chạy preview import từ file hoặc thư mục có sẵn, không ghi Product và không gọi AI:

```bash
npm run seed -- --dry-run --file data/scraped-products/<file>.json
npm run seed -- --dry-run --directory data/scraped-products
```

Các tùy chọn vận hành:

```bash
npm run seed -- --skip-scrape --directory data/scraped-products
npm run seed -- --scrape=keyboards
npm run seed -- --languages=en,fr --batch-size=50
npm run seed -- --skip-translate
```

Chạy riêng từng phase khi cần:

```bash
npm run seed:pre-products
npm run seed:post-products
```

Các seed phụ thuộc sản phẩm như review, order, coupon và spec translation chỉ chạy sau khi product import hoàn tất.

## 8. Xử lý lỗi và báo cáo

Importer cần tạo báo cáo cuối lượt gồm:

- Số sản phẩm đọc được.
- Số sản phẩm tạo mới.
- Số sản phẩm cập nhật.
- Số sản phẩm bỏ qua vì trùng.
- Số sản phẩm lỗi validation.
- Số sản phẩm lỗi category.
- Số batch thành công/thất bại.
- File hoặc run cần resume.

Lỗi của từng dòng cần có số dòng, khóa dedupe, tên sản phẩm và lý do cụ thể.

## 9. Tiêu chí hoàn thành

- Chạy dry-run không ghi MongoDB.
- Chạy lại cùng một file không tạo bản ghi trùng.
- Có thể dừng giữa chừng và resume.
- Dữ liệu lưu vào Product không có `supplier`, `source` hoặc `sourceId`.
- Giá sản phẩm có `baseCurrencyCode: 'VND'`.
- Không có request AI hàng loạt đồng thời.
- Các lỗi rate limit được retry có kiểm soát.
- Có báo cáo import và báo cáo lỗi theo từng dòng.
- Các seed phụ thuộc sản phẩm không chạy trước khi có sản phẩm hợp lệ.

## 10. Thứ tự triển khai

1. Tạo module đọc CSV/JSON và validate schema.
2. Tạo normalize và dedupe dùng chung.
3. Tạo category resolver.
4. Tạo importer batch bằng `bulkWrite`.
5. Tạo checkpoint và báo cáo.
6. Thêm dry-run và resume.
7. Kiểm thử với file nhỏ, file trùng và file có lỗi.
8. Chạy import dữ liệu thật theo từng nhóm category.
9. Tạo queue dịch có giới hạn concurrency và retry.
10. Chỉ sau khi import ổn định mới chạy các seed phụ thuộc sản phẩm.
