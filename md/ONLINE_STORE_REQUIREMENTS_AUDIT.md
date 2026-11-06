# Rà soát yêu cầu dự án Online Store

## Phạm vi

Đối chiếu mã nguồn frontend và backend với yêu cầu chức năng trong tài liệu dự án. Báo cáo tập trung vào cửa hàng, checkout và trang quản trị; không đánh giá responsive, GitLab hoặc slide PowerPoint.

Báo cáo này được cập nhật sau lượt sửa. Không chạy `npm run build`. TypeScript frontend và cú pháp JavaScript backend đã được kiểm tra; test Mocha chưa chạy được do package không có sẵn trong môi trường. Đã mở các route trong preview, nhưng chưa thể thực hiện thao tác admin thật vì trang yêu cầu đăng nhập.

## Tổng kết sau sửa

Đã sửa các lỗi đã xác nhận ở tạo danh mục mới, xóa mềm đơn hàng, lưu địa chỉ khách hàng, email checkout tùy chọn, prefill địa chỉ profile, giới hạn số lượng giỏ, lọc nhiều brand, tìm kiếm sản phẩm đã xóa, phân trang khi đổi bộ lọc và bảo vệ thao tác xóa cứng. Phần quản lý sửa mặt hàng trong đơn và giữ/trừ tồn kho chưa thay đổi vì cần chốt quy tắc nghiệp vụ trước.

## Kết quả theo yêu cầu

| Hạng mục | Đánh giá | Ghi chú |
|---|---|---|
| Danh mục và sản phẩm | Đạt | Frontend gọi API; backend truy vấn dữ liệu và chỉ trả sản phẩm đang được đăng bán, chưa xóa. |
| Giỏ hàng | Đạt cơ bản | Thêm trùng sản phẩm thì cộng số lượng; giỏ lưu trong `localStorage`; có tăng, giảm, xóa; số lượng được giới hạn theo tồn kho có trong dữ liệu sản phẩm. Backend vẫn là nơi kiểm tra tồn kho cuối cùng. |
| Tạo đơn và tính tiền | Đạt về tính giá | Backend lấy giá từ database, kiểm tra tồn kho và tính tổng; không dùng giá do client gửi làm nguồn chuẩn. Cần xác minh cơ chế giữ/trừ kho khi có nhiều đơn đồng thời. |
| Đăng nhập và checkout | Đạt cơ bản | Checkout chuyển người chưa đăng nhập sang Login; tên, email, số điện thoại và địa chỉ profile được điền trước nếu có. Email được để tùy chọn nhất quán với form và schema. |
| Khớp khách bằng số điện thoại | Đạt theo luồng tạo đơn | Backend upsert khách theo số điện thoại và cập nhật thông tin/địa chỉ từ đơn mới. Không tra cứu hồ sơ trước khi đặt; tài liệu chỉ yêu cầu cập nhật khi lưu đơn. |
| Admin sản phẩm | Đạt cơ bản | Có danh sách, tạo, sửa, lọc, xóa/khôi phục; tạo danh mục mới gọi API danh mục rồi gửi ID; có thể đổi danh mục khi sửa; tìm kiếm đã xóa và reset trang khi lọc đã được nối. |
| Admin khách hàng | Đạt cơ bản | Có danh sách, tìm kiếm, tạo/sửa và xóa/khôi phục; trường địa chỉ đã được khai báo trong schema và được lưu. Email khách hàng là tùy chọn. |
| Admin đơn hàng | Một phần | Có danh sách, bộ lọc, tạo, xem và thao tác trạng thái; xóa mềm dùng API client có xác thực. Chỉnh sửa đơn vẫn chỉ cập nhật địa chỉ giao hàng, chưa chỉnh sản phẩm/số lượng hay khách hàng. Payload đổi trạng thái đã được validate. |
| Ràng buộc xóa | Đạt cơ bản | Backend chặn xóa sản phẩm/khách hàng có đơn liên quan; xóa cứng sản phẩm, khách hàng và đơn hàng hiện yêu cầu bản ghi đã xóa mềm trước. |

## Các mục còn tồn tại

### Chỉnh sửa chi tiết mặt hàng trong đơn

Trang sửa đơn hiện chỉ cập nhật `shippingAddress`. Chưa thêm sửa sản phẩm/số lượng/khách hàng vì cần xác định chính sách cho đơn đã thanh toán, giảm giá, phí giao hàng và điều chỉnh tồn kho trước khi thay đổi tổng tiền.

- `online-store-frontend/src/components/admin/orders/OrderForm.tsx`
- `online-store-backend/src/controllers/orderController.js`
- `online-store-backend/src/routes/orderRoutes.js`

### Giữ hoặc trừ tồn kho khi tạo đơn

Giỏ được giới hạn theo tồn kho trong snapshot sản phẩm và backend kiểm tra lại khi tạo đơn. Tuy nhiên, luồng tạo đơn hiện chưa giữ/trừ tồn kho nguyên tử; cần quy định thời điểm giữ hàng, xử lý thanh toán thất bại và hoàn tồn trước khi triển khai.

### Chuẩn hóa số điện thoại dữ liệu cũ

Các đơn mới kiểm tra số điện thoại dạng 10–11 chữ số. Chưa có migration chuẩn hóa số điện thoại cũ có dấu cách/mã quốc gia; các record cũ khác định dạng có thể không được ghép với nhau.

## Xác minh sau sửa

- `npm run typecheck` trong frontend: **đạt**.
- `node --check` cho các controller, middleware, route và test backend đã sửa: **đạt**.
- Test Mocha: **chưa chạy** — Mocha không có sẵn trong backend; không cài thêm package.
- Preview: route `/cart` trả HTTP 200; `/admin/products/create` chuyển sang Login khi chưa đăng nhập. Chưa xác minh thao tác admin end-to-end do không có phiên admin.
- Không chạy `npm run build`.

## Mã nguồn liên quan

- Frontend giỏ hàng: `online-store-frontend/src/lib/context/CartContext.tsx`, `online-store-frontend/src/pages/cart.tsx`
- Frontend checkout: `online-store-frontend/src/pages/checkout.tsx`, `online-store-frontend/src/context/CheckoutContext.tsx`, `online-store-frontend/src/components/checkout/Step1Combined.tsx`, `online-store-frontend/src/components/checkout/Step3Payment.tsx`
- Admin sản phẩm: `online-store-frontend/src/components/admin/products/ProductForm.tsx`, `online-store-frontend/src/components/admin/products/ProductsList.tsx`
- Admin khách hàng: `online-store-frontend/src/components/admin/customers/CustomerForm.tsx`, `online-store-frontend/src/components/admin/customers/CustomersList.tsx`
- Admin đơn hàng: `online-store-frontend/src/components/admin/orders/OrderForm.tsx`, `online-store-frontend/src/components/admin/orders/OrdersList.tsx`
- Backend danh mục/sản phẩm: `online-store-backend/src/controllers/categoryController.js`, `online-store-backend/src/controllers/productController.js`
- Backend đơn hàng/validation: `online-store-backend/src/controllers/orderController.js`, `online-store-backend/src/routes/orderRoutes.js`, `online-store-backend/src/middleware/validationMiddleware.js`
- Backend khách hàng: `online-store-backend/src/controllers/customerController.js`, `online-store-backend/src/models/Customer.js`

## Mã nguồn liên quan

- Frontend giỏ hàng: `online-store-frontend/src/lib/context/CartContext.tsx`, `online-store-frontend/src/pages/cart.tsx`
- Frontend checkout: `online-store-frontend/src/pages/checkout.tsx`, `online-store-frontend/src/components/checkout/Step1Combined.tsx`, `online-store-frontend/src/components/checkout/Step3Payment.tsx`
- Admin sản phẩm: `online-store-frontend/src/components/admin/products/ProductForm.tsx`, `online-store-frontend/src/components/admin/products/ProductsList.tsx`
- Admin khách hàng: `online-store-frontend/src/components/admin/customers/CustomerForm.tsx`, `online-store-frontend/src/components/admin/customers/CustomersList.tsx`
- Admin đơn hàng: `online-store-frontend/src/components/admin/orders/OrderForm.tsx`, `online-store-frontend/src/components/admin/orders/OrdersList.tsx`
- Backend đơn hàng: `online-store-backend/src/controllers/orderController.js`, `online-store-backend/src/routes/orderRoutes.js`
- Backend khách hàng: `online-store-backend/src/controllers/customerController.js`, `online-store-backend/src/models/Customer.js`
