# Audit và chuẩn hóa bộ scraper Python

## 1. Phạm vi

Rà soát các scraper trong `online-store-backend/python`, gồm 34 file `*_Scraper.py`, `scraper_paths.py`, `package.json` và `test_scraper_paths.py`.

Mục tiêu:

- Xác định nguyên nhân sản phẩm bị bỏ qua hoặc lẫn sai loại.
- Dùng tên file scraper làm metadata brand/category.
- Chuẩn hóa cách lấy collection, đọc trang sản phẩm và ghi dữ liệu.
- Dự đoán các lỗi có thể xuất hiện sau khi sửa bộ lọc.

Các hạng mục ưu tiên đã được triển khai trong `online-store-backend/python/scraper_runner.py` và 34 scraper cấu hình; các giới hạn còn lại được ghi ở mục 10 để tiếp tục theo dõi.

## 2. Quy ước metadata từ tên file

Tên file scraper hiện có cấu trúc:

```text
<Brand>_<Category>_Scraper.py
```

Ví dụ:

```text
Acer_Laptop_Gaming_Scraper.py
```

Suy ra:

```text
Brand      = Acer
Categories = Laptop Gaming
categoryKey = laptop_gaming
```

Các ví dụ khác:

| File scraper | Brand | Categories | categoryKey |
|---|---|---|---|
| `Acer_Laptop_Office_Scraper.py` | Acer | Laptop Office | `laptop_office` |
| `Razer_Keyboard_Scraper.py` | Razer | Keyboard | `keyboard` |
| `Logitech_Mouse_Scraper.py` | Logitech | Mouse | `mouse` |
| `Asus_Headphone_Scraper.py` | Asus | Headphone | `headphone` |

Quy tắc nên dùng:

1. Bỏ hậu tố `_Scraper.py`.
2. Segment đầu tiên là brand.
3. Các segment còn lại ghép lại thành category hiển thị.
4. Tạo `categoryKey` riêng bằng cách lowercase và đổi khoảng trắng thành `_`.
5. Không dùng `laptop` làm key chung cho `Laptop Gaming` và `Laptop Office`.
6. Nếu record đã có `Brand` hoặc `Categories`, ưu tiên dữ liệu record; tên file là fallback metadata của batch.

## 3. Lỗi nghiêm trọng được xác định trước triển khai

### 3.1. Truyền product URL vào bộ lọc collection

Các scraper, ví dụ:

```text
online-store-backend/python/Acer_Laptop_Gaming_Scraper.py:63
online-store-backend/python/Acer_Laptop_Office_Scraper.py:66
```

đang gọi:

```python
if not product_matches_collection(soup, url):
```

Tại thời điểm này `url` là URL sản phẩm:

```text
https://gearvn.com/products/...
```

Trong khi `product_matches_collection()` tại:

```text
online-store-backend/python/scraper_paths.py:153-176
```

lại tìm token từ URL dạng `/collections/<slug>`.

Kết quả: không có collection token, hàm trả về `False`, và sản phẩm bị ghi:

```text
Bỏ qua sản phẩm không khớp collection
```

Đây là nguyên nhân trực tiếp khiến nhiều scraper bỏ qua gần như toàn bộ dữ liệu hợp lệ.

### 3.2. Bộ lọc category hiện tại phụ thuộc metadata trang chi tiết

`product_matches_collection()` lấy category từ JSON-LD, meta tag hoặc breadcrumb. Trang sản phẩm GearVN có thể chỉ hiển thị breadcrumb chung như `LAPTOP BÁN CHẠY`, không chứa collection gốc.

Vì vậy sản phẩm đã được lấy đúng từ collection listing vẫn bị loại do trang chi tiết thiếu metadata.

### 3.3. Điều kiện khớp dùng OR quá rộng

Logic hiện tại:

```python
return any(
    token in category
    for token in expected_tokens
    for category in source_categories
)
```

Nếu truyền đúng collection URL, chỉ cần token `laptop` hoặc `gaming` xuất hiện là có thể khớp. Logic này không bắt buộc đồng thời đúng brand và category, nên có nguy cơ lẫn sản phẩm giữa:

- Acer và Asus.
- Laptop Gaming và Laptop Office.
- Collection chính và collection liên quan.

## 4. Khác biệt giữa các scraper

### 4.1. Phân loại Asus Laptop khác các scraper khác

`Asus_Laptop_Office_Scraper.py` dùng metadata từ tên file để xác định batch là `Laptop Office`. File này không còn dùng fallback `Laptop`, vì danh mục đã được xác định rõ ngay từ tên scraper.

Các sản phẩm Asus Gaming được xử lý riêng bởi `Asus_Laptop_Gaming_Scraper.py`.

### 4.2. Category trong output bị hard-code ở từng file

Nhiều scraper ghi trực tiếp:

```python
"Categories": "Laptop Gaming"
"Categories": "Laptop Office"
"Categories": "Keyboard"
"Categories": "Mouse"
"Categories": "Headphone"
```

Runner dùng metadata từ tên file để tạo record thống nhất. Khi đổi tên file, phải cập nhật cả lệnh gọi scraper tương ứng để output không bị lệch danh mục.

### 4.3. Logic trích xuất bị nhân bản

34 file tự triển khai lại các bước:

- Request collection.
- Request product detail.
- Đọc JSON-LD.
- Đọc giá, SKU, tồn kho.
- Đọc specs.
- Đọc ảnh.
- Tạo CSV/JSON.

Một số phần dùng helper chung nhưng luồng tổng thể và điều kiện xử lý vẫn không đồng nhất.

### 4.4. JSON-LD chưa được xử lý đồng nhất

Nhiều file chỉ đọc script JSON-LD đầu tiên và lấy phần tử đầu tiên nếu dữ liệu là list. Cách này có thể bỏ qua:

- JSON-LD nằm trong `@graph`.
- `offers` là một list.
- Product schema không nằm ở phần tử đầu tiên.
- Trang có nhiều script JSON-LD.

### 4.5. Collection URL không phải lúc nào cũng phản ánh category output

Một số file có collection theo brand hoặc nhóm rộng nhưng output category chi tiết hơn. `Asus_Laptop_Office_Scraper.py` dùng collection `laptop-asus` và gắn batch này với `Laptop Office`; sản phẩm Gaming được tách sang scraper Gaming riêng.

Cần xác định rõ metadata batch và category record, không dùng một điều kiện chung áp dụng mù cho tất cả scraper.

## 5. Các lỗi có thể phát sinh

### P0 - Có thể làm mất toàn bộ dữ liệu

1. Truyền product URL vào helper cần collection URL khiến toàn bộ sản phẩm bị bỏ qua.
2. Trang chi tiết thiếu category/breadcrumb khiến sản phẩm hợp lệ bị loại.
3. Scraper gặp lỗi network giữa chừng nhưng vẫn ghi file rỗng hoặc file thiếu dữ liệu.
4. Một file output rỗng ghi đè file hợp lệ cùng ngày.

### P1 - Có thể làm sai loại sản phẩm

1. Bộ lọc OR chỉ cần khớp một token `laptop`, `gaming` hoặc brand.
2. Sản phẩm thuộc collection liên quan bị thu thập nhưng không được kiểm tra đủ brand/category.
3. Scraper Asus dùng tên file không đủ cụ thể có thể tạo category `Laptop`; batch văn phòng phải dùng `Asus_Laptop_Office_Scraper.py`.
4. Tên file và field `Categories` khác nhau nhưng không có cảnh báo.
5. Brand viết khác hoa thường: `HP`, `Hp`, `ASUS`, `Asus`, `MSI`, `Msi` tạo ra nhiều giá trị khác nhau nếu không normalize.
6. Tên brand có nhiều từ hoặc chứa dấu gạch dưới sẽ làm parser tên file sai.
7. Sản phẩm trùng xuất hiện ở nhiều collection và không được deduplicate thống nhất.
8. File cào có category mới nhưng import bị chặn bởi taxonomy 9 category hard-code.

### P2 - Có thể làm thiếu hoặc giảm chất lượng dữ liệu

1. JSON-LD nhiều object nhưng chỉ đọc object đầu tiên.
2. Không kiểm tra `response.status_code` trước khi parse trang chi tiết ở một số scraper.
3. Request tuần tự làm toàn bộ batch rất chậm.
4. Không có retry/backoff cho lỗi timeout hoặc HTTP 429/5xx.
5. Pagination dừng khi trang hiện tại không có link mới; thay đổi HTML có thể làm dừng sớm.
6. Selector specs chỉ tìm section có text chính xác `Thông số nổi bật`.
7. Selector giá phụ thuộc class HTML cụ thể của GearVN.
8. Ảnh lazy-load hoặc gallery mới có thể không nằm trong selector hiện tại.
9. Cùng một sản phẩm có thể được ghi lại khi chạy lại nhưng không có quy tắc identity thống nhất.
10. Ngày trong tên file chỉ có độ phân giải một ngày, dễ ghi đè khi chạy nhiều lần trong ngày.

## 6. Chuẩn chung đề xuất

### 6.1. Chuẩn metadata

Mỗi scraper nên có metadata suy ra từ tên file:

```text
scriptFile: Acer_Laptop_Gaming_Scraper.py
brand: Acer
category: Laptop Gaming
categoryKey: laptop_gaming
```

Metadata này phải được dùng để tạo output record:

```json
{
  "Brand": "Acer",
  "Categories": "Laptop Gaming"
}
```

Không cần danh sách brand/category hard-code trong bộ lọc.

### 6.2. Nguồn category

Thứ tự ưu tiên:

1. `Categories` trong record sau khi scraper trích xuất.
2. Metadata từ tên file scraper.
3. Metadata từ tên file output.
4. Không suy đoán từ breadcrumb trang chi tiết nếu không có dữ liệu chắc chắn.

Nếu field record và tên file khác nhau:

- Ưu tiên field record.
- Ghi warning gồm file, URL, giá trị cũ và giá trị mới.
- Không âm thầm đổi category.

### 6.3. Collection listing là nguồn phạm vi

Sản phẩm đã được lấy từ collection listing thì không nên bị loại chỉ vì trang chi tiết thiếu category metadata.

Có thể kiểm tra:

- HTTP status hợp lệ.
- URL cùng domain.
- URL có dạng `/products/`.
- Tên sản phẩm có dữ liệu.

Không dùng breadcrumb trang chi tiết làm điều kiện bắt buộc.

### 6.4. Bộ extractor dùng chung

Tạo một luồng chung cho tất cả scraper:

1. Fetch collection pages.
2. Thu thập product links.
3. Fetch product detail với retry/backoff.
4. Parse JSON-LD đầy đủ, bao gồm list và `@graph`.
5. Parse price, stock, SKU, image và specs qua helper chung.
6. Gắn metadata brand/category từ file.
7. Validate field bắt buộc.
8. Deduplicate theo URL/SKU/ID.
9. Ghi CSV và JSON cùng một schema.

### 6.5. Schema output bắt buộc

Tất cả scraper phải ghi thống nhất:

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

## 7. Trạng thái xử lý

1. **Đã triển khai:** loại bỏ việc truyền product URL vào bộ lọc collection; 34 scraper lấy phạm vi từ collection listing.
2. **Đã triển khai:** dùng metadata từ tên file và chuẩn hóa brand/category key.
3. **Đã triển khai:** gom pipeline vào `scraper_runner.py`, gồm fetch, parse, validate cơ bản, deduplicate và output.
4. **Đã triển khai:** parse nhiều JSON-LD, `@graph`, `offers` dạng list, retry HTTP và status validation.
5. **Đã triển khai:** detail request chạy song song có giới hạn, tái sử dụng session theo worker.
6. **Đã triển khai:** test cho taxonomy, retry, JSON-LD, deduplicate, giới hạn worker và thứ tự output.
7. **Còn theo dõi:** test runtime chưa chạy được trong môi trường hiện tại vì lệnh Python bị ACL chặn.

## 8. Kết luận

Bộ scraper hiện không chỉ có vấn đề dữ liệu lẫn loại; còn có lỗi luồng khiến dữ liệu đúng bị bỏ qua. Nguồn phân loại đáng tin cậy nhất trong kiến trúc hiện tại là metadata từ tên file scraper kết hợp với field `Brand` và `Categories` trong record. Danh sách 9 category hard-code không nên được dùng làm whitelist bắt buộc cho dữ liệu crawler.

## 9. Tối ưu tốc độ đã triển khai

`scraper_runner.py` xử lý các trang chi tiết bằng `ThreadPoolExecutor`, mặc định 4 worker và giới hạn tối đa 8 worker qua `SCRAPER_MAX_WORKERS`. Mỗi worker tái sử dụng một `requests.Session`; retry/backoff vẫn giữ nguyên cho từng request. Kết quả được gom theo URL đầu vào để concurrency không làm thay đổi thứ tự output, còn lỗi bất kỳ vẫn chặn ghi batch chưa hoàn chỉnh.

## 10. Giới hạn và việc cần theo dõi

- Pagination collection vẫn tuần tự vì trang kế tiếp phụ thuộc điều kiện kết thúc của trang trước.
- `Asus_Laptop_Office_Scraper.py` dùng category batch `Laptop Office` theo metadata filename; không tự suy đoán Gaming/Office từ breadcrumb hoặc tên sản phẩm.
- Tên file output vẫn có độ phân giải ngày; không nên chạy nhiều batch cùng brand/category trong cùng ngày nếu chưa bổ sung run ID.
- Không tự động chuyển tài khoản, di chuyển hoặc xóa dữ liệu cũ trong các luồng upload ảnh.
