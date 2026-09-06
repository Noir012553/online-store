# Tóm tắt lỗi seed và dữ liệu hiển thị

## 1. Lỗi sản phẩm không hiển thị trên nhiều trang

### Nguyên nhân

Model `Product` có trường `storefrontReady` với giá trị mặc định là `false` tại:

- `src/models/Product.js`

Các API sản phẩm public đều lọc:

```js
{ isDeleted: false, storefrontReady: true }
```

Trong lần seed trước, báo cáo ghi nhận 594 sản phẩm nhưng chưa có bước cập nhật `storefrontReady`. Vì vậy sản phẩm tồn tại trong MongoDB nhưng bị loại khỏi:

- Trang chủ
- Trang `/products`
- Trang sản phẩm theo danh mục
- Tìm kiếm sản phẩm
- Các API sản phẩm public khác

### Cách xử lý đã thực hiện

Đã chạy backfill cho dữ liệu hiện có:

```bash
npm run backfill:storefront
```

Kết quả:

```text
594 products processed
594 changed
```

Đã cập nhật `src/seeds/productSeedPipeline.js` để sau khi seed và hoàn tất dịch sản phẩm, pipeline tự gọi `refreshStorefrontReadiness()` cho các sản phẩm chưa xóa. Các lần seed đầy đủ sau này sẽ không lặp lại lỗi này.

## 2. Lỗi danh sách thương hiệu rỗng

### Nguyên nhân

Sản phẩm được import từ JSON/CSV có trường `Product.brand`, nhưng danh sách thương hiệu được lưu riêng trong collection `Brand`.

Lần seed trước có 594 sản phẩm nhưng danh sách module chạy không có `brands` hoặc `brandSeeder`:

```text
currencies, languages, translations, ... __product-pipeline__, inventory, reviews, orders, coupons, specTranslations
```

Ngoài ra, `brandSeeder.js` chưa được đăng ký trong `seedRegistry.js`. Do đó:

```bash
npm run seed -- --only-module=brands
```

không seed dữ liệu; log sẽ báo:

```text
Unknown module: brands
```

Lệnh vẫn kết thúc với trạng thái thành công do seed runner hiện chưa coi unknown module là lỗi fatal.

### Cách xử lý đã thực hiện

Đã cập nhật `src/controllers/brandController.js` để API `/api/brands` hợp nhất:

1. Brand đang có trong collection `Brand`.
2. Các giá trị `Product.brand` của sản phẩm có:
   - `isDeleted: false`
   - `storefrontReady: true`

Các brand trùng tên không phân biệt hoa thường sẽ được loại bỏ. Brand suy ra từ sản phẩm sẽ hiển thị tên; nếu chưa có document trong collection `Brand` thì chưa có logo.

Giải pháp này không ghi thêm dữ liệu vào database và áp dụng cho mọi nơi sử dụng API `/api/brands`, không chỉ homepage.

## 3. Cách seed JSON/CSV sản phẩm

Pipeline sản phẩm nằm tại:

- `src/seeds/productSeedPipeline.js`

Pipeline hỗ trợ cả JSON và CSV. Nếu trong cùng thư mục có hai file cùng basename:

```text
products.json
products.csv
```

thì JSON được ưu tiên.

Seed bình thường sẽ:

1. Chạy crawler.
2. Tạo file dữ liệu sản phẩm.
3. Chuẩn hóa và upload ảnh lên Cloudinary.
4. Validate dữ liệu JSON/CSV.
5. Import sản phẩm.
6. Dịch sản phẩm.
7. Cập nhật `storefrontReady`.

Các file manifest Cloudinary chỉ là báo cáo mapping ảnh nguồn với URL/public ID trên Cloudinary; manifest không phải input để seed sản phẩm.

## 4. Lỗi ảnh team trên Cloudinary

### Nguyên nhân

URL ảnh team trước đây dùng:

```text
f_auto,q_auto
```

Chrome thương lượng sang WebP, nhưng biến thể WebP của các asset team trả 404.

### Cách xử lý đã thực hiện

Đã đổi transformation tại:

- `src/config/aboutMedia.js`

sang:

```text
f_jpg,q_auto
```

Áp dụng cho cả `url` và `srcSet` của ảnh team. Quy trình validate ảnh upload không bị thay đổi.

## 5. Các lệnh cần và không cần chạy

### Đã cần chạy cho database hiện có

```bash
npm run backfill:storefront
```

Lệnh này đã chạy thành công cho 594 sản phẩm.

### Không cần chạy lại cho lỗi brand hiện tại

```bash
npm run seed
npm run seed -- --only-module=brands
npm run backfill:storefront
npm run build
```

Lỗi brand hiện tại được xử lý khi API đọc brand từ `Product`, không cần seed lại toàn bộ database.

### Sau khi cập nhật code

- Restart/redeploy backend để nạp controller mới.
- Nếu backend chạy bằng Nodemon, thường sẽ tự reload.
- Reload lại frontend sau khi backend sẵn sàng.

## 6. Lưu ý

- `brandSeeder.js` hiện chỉ chứa một số brand cố định và chưa phải cơ chế đồng bộ đầy đủ từ sản phẩm.
- Nếu muốn lưu lâu dài toàn bộ brand vào collection `Brand` để quản lý logo, mô tả và trang chi tiết, cần thêm bước đồng bộ distinct `Product.brand` sang `Brand`.
- Không cần chạy `npm run build` trong quá trình xử lý này.
