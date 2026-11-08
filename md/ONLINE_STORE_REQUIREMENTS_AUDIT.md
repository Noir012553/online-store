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
| Admin sản phẩm | Đã sửa các lỗi CRUD đã xác nhận | Payload sửa gửi `featured`; xóa `originalPrice` được hỗ trợ cả trong form sản phẩm và trình sửa thống kê. |
| Admin khách hàng | Đã sửa lỗi giữ nguyên tên | Form sửa giữ toàn bộ phần tên sau từ đầu tiên thay vì cắt ở từ thứ hai. |
| Admin đơn hàng | Đã sửa phản hồi CRUD đã xác nhận | Thao tác đánh dấu đã giao báo lỗi; lỗi tải tổng có thể thử lại và chặn lưu khi chưa có tổng mới. |
| Admin tiền tệ/tỷ giá | Đã sửa lỗi xác thực | Ghi dữ liệu dùng API client chung để gửi Bearer token và tự làm mới phiên. |
| Toast CRUD | Đã sửa lỗi trùng/sai nội dung | Thao tác cục bộ giữ toast thành công; socket chỉ đồng bộ danh sách; mutation API không hiện thêm toast lỗi toàn cục trước toast của màn hình. Thao tác giao đơn dùng toast đơn hàng. |
| Ràng buộc xóa | Đạt cơ bản | Backend chặn xóa sản phẩm/khách hàng có đơn liên quan; xóa cứng sản phẩm, khách hàng và đơn hàng hiện yêu cầu bản ghi đã xóa mềm trước. |

## Các mục còn tồn tại

### Rà soát bổ sung CRUD admin

Đây là audit tĩnh code frontend và các API/backend route liên quan. Các lỗi dưới đây đã được sửa trong code; frontend typecheck và cú pháp backend đạt. Chưa xác minh thao tác end-to-end do preview admin yêu cầu đăng nhập; test backend chưa chạy được vì thiếu package `dotenv`.

#### Lỗi ảnh hưởng đến thao tác hoặc dữ liệu

1. **Đã sửa (Cao) — thiếu Bearer token ở thao tác tiền tệ/tỷ giá.** `online-store-frontend/src/lib/services/currencyService.ts` chuyển các thao tác ghi sang `apiCall`, dùng Bearer token, cookie refresh và error handling chung; vẫn giữ toast lỗi tại form/list.
2. **Đã sửa (Trung bình) — form sửa sản phẩm gửi `featured`.** `online-store-frontend/src/components/admin/products/ProductForm.tsx` gửi trạng thái nổi bật trong cả payload tạo và sửa.
3. **Đã sửa (Trung bình) — xóa giá gốc sản phẩm.** Backend đặt `originalPrice` về `undefined` khi nhận chuỗi rỗng hoặc `null`; form sản phẩm và trang thống kê đều gửi giá trị rỗng khi admin xóa trường. Thêm test hồi quy tại `online-store-backend/src/test/controllers/products/productController.test.js`.
4. **Đã sửa (Trung bình) — giữ tên khách hàng nhiều từ.** `CustomerForm.tsx` giữ phần còn lại của tên trong trường họ, nên tên như “Nguyen Van An” không bị cắt khi mở rồi lưu lại.
5. **Đã sửa (Trung bình) — reset trạng thái form banner khi upload thất bại.** Các nhánh upload trả về sớm trong `online-store-frontend/src/pages/admin/bannersAdmin/[bannerId]/edit.tsx` giờ tắt `isSubmitting` trước khi thoát.

#### Phản hồi lỗi và thông báo

6. **Đã sửa (Trung bình) — lỗi đánh dấu đã giao được thông báo.** `OrderDetail.tsx` bỏ toast lỗi toàn cục trùng lặp và hiển thị toast lỗi tại thao tác.
7. **Đã sửa (Thấp) — toast thành công không còn nhân đôi bởi socket.** Các listener sản phẩm/khách hàng/đơn hàng vẫn refresh dữ liệu nhưng không phát toast; mutation handler tại màn hình giữ phản hồi thành công cho thao tác người dùng.
8. **Đã sửa (Thấp) — mutation API chỉ hiện một toast lỗi.** CRUD admin dùng `skipErrorToast` tại API wrapper hoặc request; `api.ts` cũng tôn trọng cờ này trong các nhánh 401/rate limit, còn màn hình chịu trách nhiệm hiển thị toast dễ hiểu.
9. **Đã sửa (Thấp) — toast trang thống kê đúng ngữ cảnh.** Lưu coupon/khách hàng dùng thông báo cập nhật chung; đánh dấu đơn đã giao dùng `toast_order_updated`.
10. **Đã sửa (Thấp) — lỗi tổng đơn có toast, nút thử lại và chặn lưu nếu chưa có tổng.** `OrderForm.tsx` xóa tổng cũ khi tính lại, báo lỗi tại form và chỉ cho gửi đơn khi đã có tổng mới.

#### Phạm vi đã rà soát và giới hạn

- Các luồng danh sách/tạo/sửa/xóa/khôi phục của sản phẩm, coupon, khách hàng, đơn hàng, banner, người dùng, tiền tệ/tỷ giá và ngôn ngữ đã được đối chiếu với các API route tương ứng. Phần lớn method/path và luồng refresh sau thành công khớp; các phát hiện của audit được ghi và đánh dấu đã sửa ở trên.
- Chưa thấy trang CRUD danh mục riêng; hiện chỉ có thao tác tạo danh mục inline trong form sản phẩm. Không thấy trang quản trị CRUD review.
- Đã mở route `/admin/products` trong preview; không có phiên admin nên được chuyển về đăng nhập. Vì vậy CRUD chưa được kiểm tra end-to-end bằng tài khoản admin.
- Frontend `npm run typecheck`: **đạt**. Backend `node --check` controller/test và `git diff HEAD --check`: **đạt**.
- Backend test runner chưa chạy được: môi trường thiếu module `dotenv`. Không cài package và không chạy `npm run build`.

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
