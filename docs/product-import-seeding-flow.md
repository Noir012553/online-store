# Luồng đăng nhập admin, import sản phẩm và seed dữ liệu phụ thuộc

## Phạm vi

Tài liệu này mô tả luồng dữ liệu mong muốn cho môi trường phát triển:

1. Tạo dữ liệu đăng nhập admin.
2. Admin đăng nhập vào giao diện quản trị.
3. Admin mở màn hình import/export sản phẩm.
4. Admin thêm sản phẩm từ file hoặc JSON được chuẩn bị hợp lệ.
5. Chỉ sau khi sản phẩm tồn tại trong database mới chạy các seed module phụ thuộc vào sản phẩm.

Chưa thay đổi code trong phạm vi tài liệu này.

## Vấn đề hiện tại

`npm run seed` hiện chạy seed nền trước Product và không tạo Product từ API bên ngoài. Product được đưa vào hệ thống qua pipeline crawl/transform/import.

Không đưa logic crawl hoặc tạo Product vào seed nền; seed phải độc lập với nguồn dữ liệu bên ngoài.

Ngoài ra, các module sau có quan hệ với Product:

| Module | Dữ liệu cần có trước |
| --- | --- |
| `reviews` | Products và Users |
| `orders` | Products, Users, Customers và Currencies |
| `coupons` | Products và Categories |
| `specTranslations` | Products |
| `addresses` | Customers, Locations và Shipping Providers |

## Mức độ module hóa hiện tại

### Phần đã module hóa

Seed đã có registry riêng tại `online-store-backend/src/seeds/seedRegistry.js`. Mỗi module có seeder, layer, dependency và mức độ quan trọng riêng. Có thể chạy theo nhóm bằng `--modules=...` hoặc chạy một module riêng bằng `--only-module=...`.

Các nhóm như users, categories, suppliers, currencies, customers, banners, locations, reviews, orders và coupons đã được tách thành các seeder riêng.

### Phần chưa module hóa hoàn toàn

1. Registry không có module `products`; Product được tạo bởi import thủ công hoặc auto-import.
2. Các module `specTranslations`, `reviews`, `orders` và `coupons` được chạy ở phase sau và kiểm tra Product đã tồn tại trước khi seed.
3. Auto-import nhận file JSON trực tiếp từ `online-store-backend/data/`, resolve Category/Supplier đã có và upsert Product theo source identity.
4. Luồng chính thức được chia thành seed nền, crawl/import Product và seed dữ liệu phụ thuộc.
5. Không chạy `seed:post-products` khi report auto-import chưa có Product hợp lệ được insert/update.

### Luồng chuẩn hiện tại

```text
seed:pre-products
→ products:crawl ghi JSON vào online-store-backend/data
→ products:auto-import:dry-run (transform/validate)
→ products:auto-import:once (upsert MongoDB)
→ seed:post-products
```

Trong đó:

- `seed:pre-products` tạo dữ liệu nền, category, supplier, currency và tài khoản admin.
- `products:crawl` chỉ ghi raw JSON vào `online-store-backend/data/`; không ghi MongoDB.
- `products:auto-import:dry-run` transform/validate và tạo report nhưng không ghi Product.
- `products:auto-import:once` resolve reference, upload ảnh cần thiết và upsert Product theo `source + sourceId`.
- `seed:post-products` tạo reviews, orders, coupons và spec translations dựa trên Product đã tồn tại.
- Không module seed nào trong luồng mặc định gọi lại nguồn dữ liệu bên ngoài.

### Kiểm tra duy trì

1. Không đưa logic crawl hoặc tạo Product trở lại seed nền.
2. Chỉ chạy `seed:post-products` sau khi report auto-import có `qualifiedCount > 0` và `persistence.inserted` hoặc `persistence.updated` lớn hơn 0, hoặc Product đã tồn tại hợp lệ.
3. Kiểm tra các file lỗi trong `online-store-backend/data/.failed/` và report trong `online-store-backend/data/.auto-import-reports/` trước khi chạy lại.
4. Kiểm thử định kỳ luồng seed nền → crawl → dry-run → import → seed module phụ.

## Luồng giao diện đề xuất

### 1. Khởi tạo dữ liệu nền

Tạo các dữ liệu cần thiết cho việc đăng nhập và hiển thị giao diện quản trị:

- Languages và static translations.
- Currencies và exchange rates.
- Users, gồm tài khoản admin.
- 9 Categories, gồm các category cần cho dữ liệu Tiki.
- Suppliers, gồm các supplier tương ứng với seller trong dataset import và các supplier mặc định.
- Category translations.
- Customers, shipping providers và locations nếu cần sử dụng đơn hàng/địa chỉ.

Có thể chạy các module nền mà không chạy `products`:

```bash
npm run seed -- --modules=languages,translations,bannerSlotLabels,testimonialLabels,currencies,users,categories,suppliers,customers,shippingProviders,locations,categoryTranslations
```

Lưu ý: tài khoản được tạo bởi `userSeeder` chỉ phù hợp cho môi trường phát triển. Không dùng mật khẩu seed mặc định trong production.

### 2. Admin đăng nhập

Admin đăng nhập bằng dữ liệu do module `users` tạo, sau đó truy cập giao diện quản trị sản phẩm.

Các route import/export đều được bảo vệ bằng middleware `protect` và `admin`, vì vậy người dùng chưa đăng nhập hoặc không có quyền admin không được gọi trực tiếp các API này.

### 3. Admin chuẩn bị và kiểm tra dữ liệu sản phẩm

File import cần có các trường chính:

```text
name
description
brand
category
supplier
price
baseCurrencyCode
countInStock
image
```

Chín category chuẩn hiện tại:

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

`category` và `supplier` phải khớp với dữ liệu trong database hoặc được endpoint import hỗ trợ tạo mới. `baseCurrencyCode` phải là currency đang hoạt động, ví dụ `VND`.

### 4. Preview trước khi lưu

Admin nên lấy template/hướng dẫn trước:

```http
GET /api/products/admin/import-template
GET /api/products/admin/import-guide
GET /api/products/admin/import-formats
```

Sau đó chạy import ở chế độ preview/dry-run nếu giao diện hỗ trợ. Cần kiểm tra tối thiểu:

- Tên và thương hiệu sản phẩm.
- Category và supplier được liên kết đúng.
- Giá lớn hơn 0.
- Currency hợp lệ.
- Ảnh có URL hợp lệ.
- Số lượng tồn kho không âm.

### 5. Import thật

Import JSON hoặc CSV text:

```http
POST /api/products/admin/import
```

Upload file:

```http
POST /api/products/admin/import-file
```

Các route thực tế nằm dưới `/api/products` và được khai báo trong `online-store-backend/src/routes/productRoutes.js`.

Sau khi import thành công, mỗi Product phải có `_id`. Các dữ liệu phụ thuộc phải liên kết tới `_id` này, không liên kết bằng vị trí trong mảng hoặc chỉ bằng tên sản phẩm.

### 6. Kiểm tra sản phẩm sau import

Trước khi seed dữ liệu phụ, kiểm tra:

```http
GET /api/products?pageNumber=1&pageSize=20&lang=vi
GET /api/categories?pageSize=6&pageNumber=1&lang=vi
```

Cần xác nhận sản phẩm xuất hiện đúng category, có giá, ảnh, supplier và thông tin currency.

### 7. Chạy các seed module phụ

Chỉ chạy sau khi import sản phẩm thành công:

```bash
npm run seed -- --only-module=specTranslations
npm run seed -- --only-module=reviews
npm run seed -- --only-module=orders
npm run seed -- --only-module=coupons
```

Thứ tự khuyến nghị:

1. `specTranslations` nếu cần dịch thông số.
2. `reviews` nếu muốn có đánh giá demo.
3. `orders` nếu đã có customers, currencies và sản phẩm.
4. `coupons` nếu muốn có mã giảm giá gắn với sản phẩm.

Không chạy `--modules=reviews,orders,coupons` một cách tùy ý trước khi kiểm tra dependency, vì seed registry hiện khai báo các module này phụ thuộc vào `products`. Cơ chế resolve dependency có thể kéo `productSeeder` chạy lại.

## Quan hệ dữ liệu và indexing

Index không thay thế thứ tự khởi tạo dữ liệu. Index chỉ tối ưu việc tìm kiếm.

Các liên kết nên dùng MongoDB `_id`:

```text
Product.category -> Category._id
Product.supplier -> Supplier._id
Product.user -> User._id
Review.product -> Product._id
Order.items[].product -> Product._id
Coupon.applicableProducts[] -> Product._id
```

Không dùng `products[0]`, `products[1]` hoặc tên sản phẩm làm khóa liên kết chính vì thứ tự và tên có thể thay đổi.

## Tiêu chí hoàn thành luồng

- Admin có thể đăng nhập bằng dữ liệu seed trong môi trường phát triển.
- Admin truy cập được giao diện quản lý import/export.
- Admin xem được template và hướng dẫn import.
- Import sản phẩm thành công mà không gọi lại nguồn dữ liệu bên ngoài.
- Sản phẩm được liên kết đúng với category, supplier, user và currency.
- Các seed module phụ chạy sau import mà không tạo lại sản phẩm từ nguồn bên ngoài.
- Seed nền không gọi API nguồn ngoài và Product được import riêng qua pipeline.

## Trạng thái triển khai

1. Quy trình `import products` không phụ thuộc product seeder từ API nguồn ngoài.
2. Full seed và các phase pre/post Product dùng dữ liệu Product đã import.
3. Các module phụ kiểm tra Product tồn tại trước khi chạy.
4. Luồng cần kiểm thử định kỳ: seed nền → đăng nhập admin → import sản phẩm → seed module phụ.
