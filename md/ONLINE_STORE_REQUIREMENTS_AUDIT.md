# Rà soát yêu cầu dự án Online Store

## Phạm vi

Đối chiếu mã nguồn frontend và backend với yêu cầu chức năng trong tài liệu dự án. Báo cáo tập trung vào cửa hàng, checkout và trang quản trị; không đánh giá responsive, GitLab hoặc slide PowerPoint.

Đây là rà soát tĩnh. Không sửa mã nguồn, không chạy test, không chạy `npm run build` và chưa xác minh trên trình duyệt.

## Tổng kết

Các luồng chính đã được triển khai và phần catalog/đặt hàng có kết nối backend thật. Tuy nhiên, một số thao tác admin và dữ liệu checkout còn chưa khớp yêu cầu; chưa nên xem toàn bộ dự án là hoàn tất trước khi xử lý các mục ưu tiên bên dưới.

## Kết quả theo yêu cầu

| Hạng mục | Đánh giá | Ghi chú |
|---|---|---|
| Danh mục và sản phẩm | Đạt | Frontend gọi API; backend truy vấn dữ liệu và chỉ trả sản phẩm đang được đăng bán, chưa xóa. |
| Giỏ hàng | Đạt cơ bản | Thêm trùng sản phẩm thì cộng số lượng; giỏ lưu trong `localStorage`; có tăng, giảm và xóa sản phẩm. Chưa giới hạn số lượng theo tồn kho. |
| Tạo đơn và tính tiền | Đạt về tính giá | Backend lấy giá từ database, kiểm tra tồn kho và tính tổng; không dùng giá do client gửi làm nguồn chuẩn. Cần xác minh cơ chế giữ/trừ kho khi có nhiều đơn đồng thời. |
| Đăng nhập và checkout | Một phần | Checkout chuyển người chưa đăng nhập sang trang Login. Tên, email, số điện thoại được điền trước; địa chỉ hồ sơ chưa được điền vào form giao hàng. |
| Khớp khách bằng số điện thoại | Một phần | Backend tìm/tạo/cập nhật khách theo số điện thoại khi tạo đơn. Checkout chưa tra cứu khách theo số điện thoại để tự điền thông tin trước khi đặt hàng. |
| Admin sản phẩm | Một phần | Có danh sách, tạo, sửa, lọc và thao tác xóa/khôi phục; luồng tạo danh mục mới đang lệch payload giữa frontend và backend. |
| Admin khách hàng | Một phần | Có danh sách, tìm kiếm, tạo, sửa và thao tác xóa/khôi phục. Trường địa chỉ được gửi từ form nhưng không có trong schema Customer nên có thể không được lưu. |
| Admin đơn hàng | Một phần | Có danh sách, bộ lọc, tạo, xem và thao tác trạng thái. Chỉnh sửa đơn hiện chỉ cập nhật địa chỉ giao hàng, không chỉnh sản phẩm/số lượng hay khách hàng gắn với đơn. Xóa mềm có khả năng lỗi xác thực và báo thành công giả. |
| Ràng buộc xóa | Đạt một phần | Backend chặn xóa sản phẩm/khách hàng có đơn liên quan. Một số endpoint xóa cứng không bắt buộc bản ghi phải được xóa mềm trước. |

## Các vấn đề cần ưu tiên

### 1. Tạo sản phẩm với danh mục mới không khớp API

Form gửi `categoryName`, trong khi backend yêu cầu `category` là ID danh mục hợp lệ. Vì vậy, nhánh tạo danh mục mới trong form có thể không tạo được sản phẩm.

- `online-store-frontend/src/components/admin/products/ProductForm.tsx:116-129,208-216`
- `online-store-backend/src/controllers/productController.js:755-759,787-795`

### 2. Xóa mềm đơn hàng có khả năng không thực hiện đúng

Trang admin gọi `fetch` trực tiếp mà không thêm Bearer token; backend bảo vệ route bằng middleware xác thực. Frontend cũng không kiểm tra `response.ok` trước khi hiển thị thành công.

- `online-store-frontend/src/components/admin/orders/OrdersList.tsx:190-207`
- `online-store-backend/src/middleware/authMiddleware.js:17-25`
- `online-store-backend/src/routes/orderRoutes.js:146-149`

### 3. Sửa đơn hàng chưa đầy đủ

Form chỉnh sửa gửi `shippingAddress`; chưa có luồng cập nhật danh sách sản phẩm, số lượng hoặc khách hàng của đơn.

- `online-store-frontend/src/components/admin/orders/OrderForm.tsx:80-104,186-224`
- `online-store-backend/src/routes/orderRoutes.js:146-149`

### 4. Địa chỉ khách hàng admin có thể không được lưu

Form và controller có nhận trường `address`, nhưng schema Customer không khai báo trường này. Với schema hiện tại, không nên giả định địa chỉ được lưu và đọc lại thành công.

- `online-store-frontend/src/components/admin/customers/CustomerForm.tsx:92-108`
- `online-store-backend/src/controllers/customerController.js:117-136`
- `online-store-backend/src/models/Customer.js:28-51`

### 5. Email checkout không nhất quán giữa form và backend

Form không đánh dấu email bắt buộc, nhưng backend/schema yêu cầu email hợp lệ. Nếu người mua xóa email khỏi form, tạo khách hàng/đơn có thể bị từ chối.

- `online-store-frontend/src/components/checkout/Step1Combined.tsx:265-280`
- `online-store-backend/src/middleware/validationMiddleware.js:135-140`
- `online-store-backend/src/models/Customer.js:34-39`

### 6. Tra cứu khách hàng trong checkout chưa được nối

Backend có handler tra cứu theo số điện thoại nhưng route yêu cầu quyền admin; frontend checkout chưa gọi API này. Việc ghép khách hiện diễn ra ở bước tạo đơn, không phải lúc nhập số điện thoại.

- `online-store-backend/src/controllers/customerController.js:363-375`
- `online-store-backend/src/routes/customerRoutes.js:60-65`
- `online-store-backend/src/controllers/orderController.js:299-375`

## Rủi ro và điểm cần xác minh thêm

- Số lượng trong giỏ có thể vượt tồn kho; hiện chỉ backend kiểm tra khi tạo đơn.
- Nhiều yêu cầu tạo đơn đồng thời có thể cùng vượt qua bước kiểm tra tồn kho nếu không có cơ chế giữ/trừ kho ở luồng khác.
- Số điện thoại cùng khách nhưng khác định dạng có thể không được nhận diện là một giá trị thống nhất.
- API cập nhật trạng thái đơn nhận `isPaid`/`isDelivered` nhưng thiếu validation và kiểm tra chuyển trạng thái nghiệp vụ đầy đủ.
- Một số bộ lọc còn giới hạn: trang danh mục chỉ gửi brand đầu tiên khi chọn nhiều brand; tìm kiếm sản phẩm có giới hạn kết quả; tìm kiếm ở danh sách sản phẩm đã xóa chưa được truyền đầy đủ.

## Mã nguồn liên quan

- Frontend giỏ hàng: `online-store-frontend/src/lib/context/CartContext.tsx`, `online-store-frontend/src/pages/cart.tsx`
- Frontend checkout: `online-store-frontend/src/pages/checkout.tsx`, `online-store-frontend/src/components/checkout/Step1Combined.tsx`, `online-store-frontend/src/components/checkout/Step3Payment.tsx`
- Admin sản phẩm: `online-store-frontend/src/components/admin/products/ProductForm.tsx`, `online-store-frontend/src/components/admin/products/ProductsList.tsx`
- Admin khách hàng: `online-store-frontend/src/components/admin/customers/CustomerForm.tsx`, `online-store-frontend/src/components/admin/customers/CustomersList.tsx`
- Admin đơn hàng: `online-store-frontend/src/components/admin/orders/OrderForm.tsx`, `online-store-frontend/src/components/admin/orders/OrdersList.tsx`
- Backend đơn hàng: `online-store-backend/src/controllers/orderController.js`, `online-store-backend/src/routes/orderRoutes.js`
- Backend khách hàng: `online-store-backend/src/controllers/customerController.js`, `online-store-backend/src/models/Customer.js`
