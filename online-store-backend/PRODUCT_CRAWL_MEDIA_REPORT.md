# Báo cáo crawler, media và seed sản phẩm

## Phạm vi

Pipeline sản phẩm hiện đi qua các bước:

```text
Crawler GearVN
  -> JSON/CSV sản phẩm
  -> tải và kiểm tra ảnh theo snapshot
  -> upload ảnh lên Cloudinary
  -> import Product vào MongoDB Atlas
```

Crawler và bước chuẩn bị ảnh không ghi trực tiếp vào MongoDB. MongoDB chỉ nhận dữ liệu sau khi ảnh đã được xử lý.

## Các vấn đề đã ghi nhận

### 1. Ảnh nguồn trả HTTP 530

Một số URL Hstatic/CDN trả HTTP 530 khi backend tải ảnh. Đây là lỗi ở request tới nguồn ảnh hoặc lớp CDN/origin, không phải lỗi dedupe hay dữ liệu JSON.

### 2. Kết nối ảnh bị ngắt giữa chừng

Một số gallery báo:

```text
Connection broken: IncompleteRead
```

Response bắt đầu tải nhưng CDN đóng kết nối trước khi truyền đủ dữ liệu. Ảnh chính lỗi sẽ làm sản phẩm không được chuẩn bị; ảnh gallery lỗi được ghi warning và không làm mất toàn bộ sản phẩm.

### 3. Extractor cũ có thể lấy nhầm ảnh

Extractor cũ quét toàn bộ `img` trên trang và dùng ảnh đầu tiên làm ảnh chính. Cách này có thể lấy ảnh từ sản phẩm tương tự, sản phẩm đã xem, banner hoặc khu vực khác của trang.

### 4. Website nguồn thay đổi liên tục

Nếu crawl thông tin ở một thời điểm nhưng tải ảnh bằng cách quét lại trang ở thời điểm khác, dữ liệu và ảnh có thể không còn cùng một snapshot. Việc chạy lại cùng batch cũng có thể ghi đè ảnh của lần crawl trước nếu không có batch ID riêng.

## Thay đổi đã triển khai

### Extractor theo đúng gallery sản phẩm

Helper dùng chung:

```text
python/scraper_paths.py:extract_product_image_urls
```

Thứ tự ưu tiên:

1. `button[aria-label^="Xem ảnh sản phẩm"] img`
2. `img[alt^="Thumbnail "]`
3. Các selector gallery có ngữ nghĩa như `data-product-gallery`, `product-gallery`, `product__media`
4. `meta[property="og:image"]` cho fallback ảnh chính

Không còn fallback sang toàn bộ `soup.find_all('img')`.

Tất cả scraper trong `python/*_Scraper.py` vẫn giữ các field:

```text
MainImage
GalleryImages
```

và vẫn giữ thứ tự main/gallery.

### Snapshot batch

Mỗi lần chạy `prepare_product_images.py` tạo batch ID UTC riêng. Ảnh được lưu theo dạng:

```text
data/scraped-products/images/<batch-id>/<file-stem>/<product-key>/main.jpg
data/scraped-products/images/<batch-id>/<file-stem>/<product-key>/gallery-01.jpg
```

Các lần crawl khác nhau không dùng chung thư mục ảnh.

### Retry ảnh lỗi

Downloader thử tối đa 3 lần với backoff cho:

- `IncompleteRead`;
- lỗi kết nối và timeout;
- HTTP 408;
- HTTP 429;
- HTTP 5xx.

Ảnh được tải vào file `.part`, kiểm tra chữ ký ảnh rồi mới đổi tên chính thức. File tải dở không được coi là ảnh hợp lệ.

### Bảo toàn URL gallery lỗi

Nếu gallery vẫn lỗi sau retry, URL nguồn vẫn được giữ trong JSON và manifest với trạng thái `failed`. Nhờ đó có thể chạy lại bước chuẩn bị ảnh mà không cần crawl lại trang.

Manifest nằm tại:

```text
data/scraped-products/manifests/<batch-id>/
```

### Mapping MongoDB và Cloudinary

Khóa sản phẩm được ưu tiên theo:

```text
productId -> SKU hợp lệ -> URL sản phẩm -> brand:name
```

Các placeholder như `N/A`, `NA`, `null`, `none`, `unknown` không còn được coi là SKU hợp lệ.

Cloudinary public ID được tạo ổn định theo product identity:

```text
<identity-hash>/main
<identity-hash>/gallery-0
<identity-hash>/gallery-1
```

MongoDB lưu:

```text
image              <-> imagePublicId
images[index]      <-> imagePublicIds[index]
```

## Cách vận hành

### Chỉ crawl sản phẩm

```powershell
cd online-store-backend/python
npm run scrape:all
```

Kết quả JSON/CSV nằm trực tiếp trong:

```text
data/scraped-products/
```

### Tải ảnh từ JSON đã crawl

```powershell
npm run prepare:images
```

Lệnh này không kết nối MongoDB và không upload Cloudinary.

### Cào và upload Cloudinary

```powershell
cd online-store-backend
npm run media:upload
```

Lệnh này chạy crawler, chuẩn bị ảnh, upload Cloudinary và ghi manifest Cloudinary; không import Product vào MongoDB Atlas.

Chạy một nhóm riêng:

```powershell
npm run media:upload -- --target asus-keyboard
```

### Import vào MongoDB Atlas

Chỉ chạy seed/import sau khi batch ảnh đã hoàn tất và các lỗi ảnh chính đã được xử lý.

## Quy tắc an toàn

- Không import sản phẩm nếu ảnh chính chưa có bản local hợp lệ.
- Gallery có thể thiếu sau khi đã retry hết số lần, nhưng phải có warning trong manifest.
- Không crawl lại trang để retry ảnh của một batch cũ; retry theo URL được lưu trong manifest.
- Không dùng chung thư mục ảnh giữa hai lần crawl.
- Không dùng SKU placeholder làm khóa map.
- Kiểm tra manifest trước khi import để phát hiện ảnh lỗi.

## Kiểm tra đã thực hiện

- Đã xác nhận 35/35 scraper dùng `extract_product_image_urls`.
- Đã xác nhận không còn block quét toàn bộ `img` trong scraper.
- Đã xác nhận các file JavaScript backend liên quan qua `node --check`.
- Python syntax compile chưa chạy được trong môi trường phát triển hiện tại vì Python runtime bị shell policy chặn; cần chạy kiểm tra này trên môi trường crawler thực tế trước khi chạy batch lớn.
