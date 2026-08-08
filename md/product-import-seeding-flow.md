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

`npm run seed` là full seed và có chạy module `products`. Module này đang gọi nguồn dữ liệu bên ngoài GearVN. Khi endpoint GearVN trả về HTTP 404, toàn bộ full seed bị dừng.

Vì dự án đã có tính năng import sản phẩm, không nên phụ thuộc vào `productSeeder` để tạo dữ liệu sản phẩm ban đầu.

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

1. Module `products` vẫn gắn với `productSeeder`, trong đó có logic lấy dữ liệu từ endpoint GearVN. Khi endpoint này trả về lỗi, full seed bị dừng.
2. Registry hiện khai báo `reviews`, `orders`, `coupons` và `specTranslations` phụ thuộc vào module `products`. Chạy `--modules=reviews` có thể kéo `productSeeder` chạy trước.
3. Registry chưa có khái niệm Product được tạo từ giao diện admin import. Nó chỉ biết Product được tạo bởi module `products`.
4. Chưa có lệnh hoặc profile chính thức chia quy trình thành trước import, import qua giao diện và sau import.
5. `--only-module` là cách vận hành tạm thời để bỏ qua dependency sau khi Product đã được import, không phải cơ chế dependency hoàn chỉnh cho luồng mới.

### Luồng module hóa mong muốn

```text
seed:pre-products
→ Admin đăng nhập và import Product
→ seed:post-products
```

Trong đó:

- `seed:pre-products` tạo dữ liệu nền và tài khoản admin.
- Giao diện admin tạo Product thông qua import JSON, CSV hoặc file upload.
- `seed:post-products` tạo reviews, orders, coupons và spec translations dựa trên các Product đã tồn tại.
- Không module nào trong luồng mặc định gọi lại nguồn dữ liệu GearVN.

### Định hướng xử lý code về sau

1. Tách nguồn Product bên ngoài khỏi luồng seed mặc định.
2. Bổ sung profile hoặc phase seed rõ ràng cho trước và sau import Product.
3. Cho phép các module phụ thuộc xác nhận Product đã tồn tại thay vì tự gọi `productSeeder`.
4. Thêm kiểm thử cho luồng seed nền → đăng nhập admin → import Product → seed module phụ.

## Luồng giao diện đề xuất

### 1. Khởi tạo dữ liệu nền

Tạo các dữ liệu cần thiết cho việc đăng nhập và hiển thị giao diện quản trị:

- Languages và static translations.
- Currencies và exchange rates.
- Users, gồm tài khoản admin.
- 6 Categories.
- Suppliers.
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

Sáu category chuẩn hiện tại:

```text
Keyboard
Mouse
Headphones
Cooling
Gaming Laptop
Office Laptop
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
- Import sản phẩm thành công mà không gọi GearVN.
- Sản phẩm được liên kết đúng với category, supplier, user và currency.
- Các seed module phụ chạy sau import mà không tạo lại sản phẩm từ nguồn bên ngoài.
- Không chạy full seed nếu full seed vẫn còn gọi `productSeeder` GearVN.

## Định hướng xử lý code về sau

Khi bắt đầu sửa code, nên cân nhắc:

1. Tách quy trình `import products` khỏi `productSeeder` bên ngoài.
2. Cho phép full seed bỏ qua `products` bằng một flag rõ ràng.
3. Cập nhật dependency của các module phụ để hỗ trợ nguồn Product đã import.
4. Thêm trạng thái hoặc kiểm tra rõ ràng để báo thiếu Products trước khi chạy `reviews`, `orders`, `coupons` và `specTranslations`.
5. Thêm kiểm thử cho luồng: seed nền → đăng nhập admin → import sản phẩm → seed module phụ.
