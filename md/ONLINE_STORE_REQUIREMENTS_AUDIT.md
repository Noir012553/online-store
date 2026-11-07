# Rà soát yêu cầu dự án Online Store

## Phạm vi

Đối chiếu mã nguồn frontend và backend với yêu cầu chức năng trong tài liệu dự án. Báo cáo tập trung vào cửa hàng, checkout và trang quản trị; không đánh giá responsive, GitLab hoặc slide PowerPoint.

Báo cáo này được cập nhật sau lượt sửa. Không chạy `npm run build`. TypeScript frontend và cú pháp JavaScript backend đã được kiểm tra; test Mocha chưa chạy được do package không có sẵn trong môi trường. Đã mở các route trong preview, nhưng chưa thể thực hiện thao tác admin thật vì trang yêu cầu đăng nhập.

## Tổng kết sau sửa

Đã sửa các lỗi đã xác nhận ở tạo danh mục mới, xóa mềm đơn hàng, lưu địa chỉ khách hàng, email checkout tùy chọn, prefill địa chỉ profile, giới hạn số lượng giỏ, lọc nhiều brand, tìm kiếm sản phẩm đã xóa, phân trang khi đổi bộ lọc và bảo vệ thao tác xóa cứng. Admin có thể sửa mặt hàng/số lượng ở đơn chưa thanh toán và chưa bắt đầu giao; backend tính lại giá, ưu đãi và phí giao hàng.

## Kết quả theo yêu cầu

| Hạng mục | Đánh giá | Ghi chú |
|---|---|---|
| Danh mục và sản phẩm | Đạt | Frontend gọi API; backend truy vấn dữ liệu và chỉ trả sản phẩm đang được đăng bán, chưa xóa. |
| Giỏ hàng | Đạt cơ bản | Thêm trùng sản phẩm thì cộng số lượng; giỏ lưu trong `localStorage`; có tăng, giảm, xóa; số lượng được giới hạn theo tồn kho có trong dữ liệu sản phẩm. Backend vẫn là nơi kiểm tra tồn kho cuối cùng. |
| Tạo đơn và tính tiền | Đạt về tính giá | Backend lấy giá từ database, kiểm tra tồn kho và tính tổng; không dùng giá do client gửi làm nguồn chuẩn. Cần xác minh cơ chế giữ/trừ kho khi có nhiều đơn đồng thời. |
| Đăng nhập và checkout | Đạt cơ bản | Checkout chuyển người chưa đăng nhập sang Login; tên, email, số điện thoại và địa chỉ profile được điền trước nếu có. Email được để tùy chọn nhất quán với form và schema. |
| Khớp khách bằng số điện thoại | Đạt theo luồng tạo đơn | Backend upsert khách theo số điện thoại và cập nhật thông tin/địa chỉ từ đơn mới. Không tra cứu hồ sơ trước khi đặt; tài liệu chỉ yêu cầu cập nhật khi lưu đơn. |
| Admin sản phẩm | Chưa đạt hoàn toàn | Có danh sách, tạo, sửa, lọc, xóa/khôi phục; audit CRUD bổ sung tìm thấy lỗi không lưu `featured` khi sửa và không xóa được `originalPrice`; xem mục “Rà soát bổ sung CRUD admin”. |
| Admin khách hàng | Chưa đạt hoàn toàn | Có danh sách, tìm kiếm, tạo/sửa và xóa/khôi phục; audit CRUD bổ sung phát hiện tên nhiều hơn hai từ có thể bị cắt khi sửa; xem mục “Rà soát bổ sung CRUD admin”. |
| Admin đơn hàng | Chưa đạt hoàn toàn | Có danh sách, bộ lọc, tạo, xem, cập nhật địa chỉ và mặt hàng/số lượng; audit CRUD bổ sung phát hiện thao tác đánh dấu đã giao không báo lỗi khi API thất bại; xem mục “Rà soát bổ sung CRUD admin”. |
| Ràng buộc xóa | Đạt cơ bản | Backend chặn xóa sản phẩm/khách hàng có đơn liên quan; xóa cứng sản phẩm, khách hàng và đơn hàng hiện yêu cầu bản ghi đã xóa mềm trước. |

## Các mục còn tồn tại

### Rà soát bổ sung CRUD admin

Đây là audit tĩnh code frontend và các API/backend route liên quan; chưa xác minh thao tác trực tiếp trên server đang chạy. Các phát hiện dưới đây cần xử lý riêng trước khi đánh giá CRUD admin là hoàn tất.

#### Lỗi ảnh hưởng đến thao tác hoặc dữ liệu

1. **Cao — các thao tác ghi tiền tệ và tỷ giá thiếu Bearer token.** `online-store-frontend/src/lib/services/currencyService.ts:114-185, 279-353` chỉ gửi `credentials: 'include'`; trong khi `online-store-backend/src/middleware/authMiddleware.js:17-26, 77-80` chỉ đọc token từ `Authorization: Bearer ...`. Các route ghi yêu cầu `protect` (`online-store-backend/src/routes/currencyRoutes.js:12-19`, `exchangeRateRoutes.js:30-37`), nên tạo/sửa/xóa có thể bị 401.
2. **Trung bình — form sửa sản phẩm không gửi trạng thái nổi bật.** Payload sửa trong `online-store-frontend/src/components/admin/products/ProductForm.tsx:174-200` không có `featured`; backend chỉ cập nhật trường này khi payload có gửi nó (`online-store-backend/src/controllers/productController.js:1056-1058`). UI có thể báo lưu thành công nhưng trạng thái không đổi.
3. **Trung bình — không xóa được giá gốc sản phẩm.** Form gửi chuỗi rỗng khi trường được xóa (`ProductForm.tsx:139-149, 191`); backend bỏ qua giá trị rỗng/không hợp lệ và giữ giá cũ (`productController.js:990-993`). Form sửa sản phẩm trong `statistics.tsx:498-505` cũng chịu cùng vấn đề.
4. **Trung bình — sửa khách hàng có thể làm mất phần tên từ ba từ trở lên.** `online-store-frontend/src/components/admin/customers/CustomerForm.tsx:45-54, 92-100` chỉ tách và lưu tối đa hai phần tên. Ví dụ “Nguyen Van An” có thể bị lưu thành “Nguyen Van” dù không sửa tên trong form.
5. **Trung bình — form sửa banner có thể bị kẹt trạng thái đang gửi sau lỗi upload.** `online-store-frontend/src/pages/admin/bannersAdmin/[bannerId]/edit.tsx:272-284` bật `isSubmitting` rồi return sớm khi upload không thành công/asset không hợp lệ; các nhánh này không chạy `finally` tại `:314-327`, nên nút lưu/hủy có thể bị vô hiệu hóa.

#### Phản hồi lỗi và thông báo

6. **Trung bình — lỗi đánh dấu đơn đã giao bị nuốt im lặng.** `online-store-frontend/src/components/admin/orders/OrderDetail.tsx:101-114` có `catch` rỗng; khi API từ chối, admin không nhận toast lỗi hoặc giải thích trạng thái chưa được cập nhật.
7. **Thấp — xóa/khôi phục sản phẩm, khách hàng, đơn hàng có thể hiện toast thành công hai lần.** Các list tự hiện toast sau mutation và cũng hiện toast khi nhận socket event; ví dụ `ProductsList.tsx:122-158, 167-197`, `CustomersList.tsx:118-154, 156-185`, `OrdersList.tsx:150-177, 191-219`. Backend phát event tương ứng trong cùng thao tác (ví dụ `online-store-backend/src/socket/socketHandler.js:256-263, 284-315`). Socket còn kích hoạt refresh thêm lần nữa.
8. **Thấp — một số API lỗi có thể hiện hai toast lỗi.** `online-store-frontend/src/lib/api.ts:664-704` gọi error handler rồi throw; các màn hình lại toast trong `catch`, ví dụ `CouponsList.tsx:131-143` và `CustomersList.tsx:156-170`.
9. **Thấp — toast trang thống kê mô tả sai thao tác.** `online-store-frontend/src/pages/admin/statistics.tsx:589, 599-610` dùng `admin_toast_product_updated` sau khi lưu coupon/khách hàng và sau khi đánh dấu đơn đã giao.
10. **Thấp — lỗi tải phần tóm tắt đơn hàng không hiển thị thông báo.** `online-store-frontend/src/components/admin/orders/OrderForm.tsx:172-188` bỏ qua lỗi API và xóa summary; nút tạo/sửa vẫn có thể bấm khi có sản phẩm (`:521-558`), khiến admin không biết phần tính tổng chưa tải được.

#### Phạm vi đã rà soát và giới hạn

- Các luồng danh sách/tạo/sửa/xóa/khôi phục của sản phẩm, coupon, khách hàng, đơn hàng, banner, người dùng, tiền tệ/tỷ giá và ngôn ngữ đã được đối chiếu với các API route tương ứng. Phần lớn method/path và luồng refresh sau thành công khớp; các ngoại lệ đã nêu ở trên.
- Chưa thấy trang CRUD danh mục riêng; hiện chỉ có thao tác tạo danh mục inline trong form sản phẩm. Không thấy trang quản trị CRUD review.
- Đây là nhận định dựa trên đọc code. Chưa chạy thao tác end-to-end trên trình duyệt hoặc xác minh API bằng tài khoản admin.

### Giữ hoặc trừ tồn kho khi tạo đơn

Giỏ được giới hạn theo tồn kho trong snapshot sản phẩm và backend kiểm tra lại khi tạo đơn. Tuy nhiên, luồng tạo đơn hiện chưa giữ/trừ tồn kho nguyên tử; cần quy định thời điểm giữ hàng, xử lý thanh toán thất bại và hoàn tồn trước khi triển khai.

### Chuẩn hóa số điện thoại dữ liệu cũ

Các đơn mới kiểm tra số điện thoại dạng 10–11 chữ số. Chưa có migration chuẩn hóa số điện thoại cũ có dấu cách/mã quốc gia; các record cũ khác định dạng có thể không được ghép với nhau.

## Xác minh sau sửa

- `npm run typecheck` trong frontend: **đạt**.
- `node --check` cho các controller, middleware, route và test backend đã sửa: **đạt**.
- Test Mocha: **chưa chạy** — Mocha không có sẵn trong backend; không cài thêm package.
- Preview: `/cart` và route sửa đơn trả HTTP 200; route admin chuyển về Login khi chưa có phiên. Chưa xác minh thao tác admin end-to-end do không có phiên admin.
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
