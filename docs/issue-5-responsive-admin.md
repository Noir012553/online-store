# Vấn đề 5: Kế hoạch tối ưu responsive cho khu vực admin

## Quy tắc đặt tên báo cáo

Tên file Markdown phải theo định dạng `issue-N-<mô-tả>.md`, trong đó `N` là số thứ tự của issue.

## Trạng thái

- **Loại:** Tối ưu giao diện responsive
- **Phạm vi:** Các trang và component admin trong `online-store-frontend`
- **Ưu tiên:** Layout admin, các luồng quản lý chính và form tạo/sửa
- **Trạng thái hiện tại:** Đã triển khai và xác minh tự động các điều chỉnh responsive trọng tâm; còn chờ kiểm thử tương tác trực tiếp trên preview

## Mô tả

Khu vực admin cần được tối ưu để sử dụng ổn định trên desktop, tablet và mobile. Việc tối ưu phải giữ nguyên giao diện hiện có, bao gồm màu sắc, hình dạng, typography, tên biến style và các breakpoint đã được sử dụng.

Mục tiêu là giúp người quản trị:

- Điều hướng sidebar thuận tiện trên màn hình nhỏ.
- Đọc và thao tác với bảng dữ liệu mà không làm vỡ layout.
- Nhập liệu trong các form tạo/sửa mà không bị chật hoặc tràn ngang.
- Sử dụng dashboard, bộ lọc, nút thao tác và modal trên nhiều kích thước màn hình.
- Duy trì hành vi và phân quyền hiện tại, chỉ thay đổi cách bố trí khi cần cho responsive.

## Phạm vi route admin

Các nhóm route được ưu tiên gồm:

- `/admin/dashboard`
- `/admin/statistics`
- `/admin/products`
- `/admin/products/create`
- `/admin/products/[id]/edit`
- `/admin/orders`
- `/admin/orders/create`
- `/admin/orders/[id]`
- `/admin/customers`
- `/admin/customers/create`
- `/admin/customers/[id]`
- `/admin/customers/[id]/edit`
- `/admin/coupons`
- `/admin/coupons/create`
- `/admin/coupons/[id]/edit`
- `/admin/bannersAdmin`
- `/admin/usersAdmin`
- `/admin/currencyAdmin`
- Các route quản lý ngôn ngữ, bản dịch và audit log

## Các file trọng tâm

### Layout dùng chung

- `online-store-frontend/src/components/admin/_AdminLayout.tsx`
- `online-store-frontend/src/components/admin/ProtectedAdminPage.tsx`
- `online-store-frontend/src/components/admin/withAdminLayout.tsx`

### Danh sách và form nghiệp vụ

- `online-store-frontend/src/components/admin/products/ProductsList.tsx`
- `online-store-frontend/src/components/admin/products/ProductForm.tsx`
- `online-store-frontend/src/components/admin/orders/OrdersList.tsx`
- `online-store-frontend/src/components/admin/orders/OrderForm.tsx`
- `online-store-frontend/src/components/admin/customers/CustomersList.tsx`
- `online-store-frontend/src/components/admin/customers/CustomerForm.tsx`
- `online-store-frontend/src/components/admin/CurrencyList.tsx`
- `online-store-frontend/src/components/admin/BannerManagementPage.tsx`

### Styles và cấu hình liên quan

- `online-store-frontend/src/styles/index.css`
- Các class Tailwind đang được dùng trực tiếp trong component admin
- `online-store-frontend/tailwind.config.ts`

## Phân tích hiện trạng

### 1. Admin layout

`_AdminLayout.tsx` đang dùng sidebar với độ rộng cố định `w-64` hoặc `w-20`, trong khi vùng nội dung có padding lớn như `p-8`. Trên mobile, sidebar có thể chiếm nhiều không gian và làm vùng nội dung bị hẹp.

Kế hoạch xử lý:

- Bổ sung cách hiển thị sidebar phù hợp cho mobile mà không thay đổi màu đen, trạng thái thu gọn hoặc cấu trúc menu hiện tại.
- Giữ nút mở/đóng sidebar và trạng thái lưu trong localStorage.
- Bổ sung lớp phủ hoặc cơ chế đóng sidebar khi chọn menu trên màn hình nhỏ nếu cấu trúc hiện tại phù hợp.
- Điều chỉnh padding vùng header và content theo breakpoint, vẫn giữ các giá trị breakpoint hiện có.
- Kiểm tra header, notification bell, tên cửa hàng và nút đổi ngôn ngữ khi chiều rộng giảm.

### 2. Form sản phẩm và đơn hàng

Một số khu vực form đang sử dụng bố cục hai cột cố định, ví dụ các nhóm `grid-cols-2` trong `ProductForm.tsx` và `OrderForm.tsx`.

Kế hoạch xử lý:

- Dùng một cột trên mobile và chuyển sang hai cột từ breakpoint phù hợp trên tablet/desktop.
- Cho phép các input, select, textarea và nhóm upload ảnh chiếm đủ chiều rộng.
- Kiểm tra nhóm nút lưu, hủy, thêm sản phẩm và thao tác với item trong đơn hàng.
- Đảm bảo nội dung dài, giá tiền, mã tiền tệ và thông báo lỗi không gây tràn ngang.

### 3. Bảng dữ liệu

Các danh sách sản phẩm, đơn hàng, khách hàng, coupon và currency đã có một số vùng `overflow-x-auto`. Cần rà soát đồng nhất để bảng vẫn đọc được trên mobile.

Kế hoạch xử lý:

- Giữ bảng desktop hiện tại và chỉ bổ sung cuộn ngang có kiểm soát khi cần.
- Đảm bảo cột thao tác vẫn có thể truy cập, không bị co về kích thước không sử dụng được.
- Kiểm tra bộ lọc, ô tìm kiếm, phân trang và nhóm nút hành động trên màn hình nhỏ.
- Không thay đổi dữ liệu, thứ tự cột hoặc logic phân trang.

### 4. Dashboard và thống kê

Dashboard và trang thống kê cần được kiểm tra với thẻ số liệu, biểu đồ và các vùng nội dung có chiều rộng cố định.

Kế hoạch xử lý:

- Chuyển các nhóm thẻ thống kê thành một hoặc hai cột tùy chiều rộng.
- Đảm bảo biểu đồ không vượt khỏi container và có thể đọc được trên mobile.
- Kiểm tra tiêu đề, bộ lọc thời gian, currency selector và trạng thái loading.
- Giữ nguyên màu sắc, dạng bo góc, bóng đổ và thứ tự nội dung hiện tại.

### 5. Các trang quản trị phụ

Sau khi hoàn tất các luồng chính, rà soát banners, users, currency, translations, import/export và audit log.

Các điểm cần kiểm tra:

- Modal và form không vượt khỏi viewport.
- Text dài hoặc bản dịch dài không làm vỡ nút và menu.
- Khu vực upload, preview ảnh và bảng bản dịch hoạt động trên mobile.
- Các trang có nhiều cột vẫn có cách đọc và thao tác rõ ràng.

## Nguyên tắc triển khai

1. Giữ nguyên style hiện có, đặc biệt là màu sắc, hình dạng, typography và các giá trị biến CSS/Tailwind đang dùng.
2. Không xóa hoặc thay đổi breakpoint hiện có; chỉ bổ sung lớp responsive cần thiết.
3. Ưu tiên class có tên theo đúng ngữ cảnh component, không thêm class tên chung chung hoặc khó hiểu.
4. Không dùng inline style cho phần responsive mới; dùng class và stylesheet hiện có của dự án.
5. Ưu tiên CSS shorthand khi cần viết CSS mới.
6. Không thay đổi API, dữ liệu, phân quyền, validation hoặc logic nghiệp vụ.
7. Không thay đổi cấu trúc route admin.
8. Không tạo fallback hoặc abstraction mới nếu không cần cho yêu cầu responsive.

## Thứ tự triển khai

1. Cập nhật responsive cho `_AdminLayout.tsx` và xác minh toàn bộ route dùng layout này.
2. Rà soát dashboard và statistics.
3. Cập nhật Products, Orders, Customers và Coupons list.
4. Cập nhật `ProductForm.tsx`, `OrderForm.tsx`, `CustomerForm.tsx` và các form tương ứng.
5. Rà soát banners, users, currency và các trang translation.
6. Kiểm tra các trạng thái loading, empty, error, modal, toast và quyền super-admin.
7. Chạy build/type check và kiểm tra trực tiếp trên preview ở các kích thước desktop, tablet và mobile.

## Tiêu chí nghiệm thu

- Sidebar và header không che khuất nội dung trên mobile.
- Không có trang admin chính nào xuất hiện overflow ngang ngoài vùng bảng được chủ ý cho phép.
- Các form tạo/sửa sử dụng được bằng màn hình cảm ứng và không bị cắt nút thao tác.
- Bảng dữ liệu vẫn có thể xem, cuộn và thao tác trên mobile.
- Dashboard và biểu đồ không bị méo hoặc tràn khỏi container.
- Các route admin giữ nguyên hành vi điều hướng, phân quyền và dữ liệu.
- Giao diện desktop hiện tại không bị thay đổi ngoài các điều chỉnh cần thiết để hỗ trợ responsive.
- Các breakpoint và giá trị style gốc được giữ nguyên khi không có lý do kỹ thuật rõ ràng để bổ sung điều chỉnh.
- Build frontend thành công sau khi triển khai.
- Golden path của Products, Orders, Customers và Dashboard được kiểm tra trực tiếp trên preview.

## Kiểm thử dự kiến

### Desktop

- Chiều rộng lớn: sidebar mở, bảng đầy đủ cột, form hai cột.
- Chiều rộng trung bình: sidebar thu gọn, header và bộ lọc không bị chồng.

### Tablet

- Sidebar và content không chiếm chồng lên nhau.
- Form chuyển đổi hợp lý giữa một và hai cột.
- Bảng, biểu đồ và modal còn đủ vùng thao tác.

### Mobile

- Mở/đóng sidebar và chuyển route thành công.
- Tạo sản phẩm, tạo đơn hàng và cập nhật khách hàng không bị tràn.
- Tìm kiếm, lọc, phân trang và thao tác bảng sử dụng được.
- Kiểm tra trạng thái loading, empty, error và nội dung bản dịch dài.

## Rủi ro và giới hạn

- Một số bảng nhiều cột cần giữ cuộn ngang để không làm mất thông tin.
- Các component dùng chung có thể ảnh hưởng nhiều route admin, vì vậy cần kiểm tra regression sau mỗi nhóm thay đổi.
- Nội dung dịch có độ dài khác nhau giữa các locale có thể làm thay đổi kích thước nút và menu.
- Không tự động xóa hoặc thay thế các style cũ nếu chưa xác nhận chúng không còn được sử dụng.

## Tiến độ triển khai

### Đã hoàn thành

- Rà soát và xác nhận `_AdminLayout.tsx` đã hỗ trợ sidebar mobile, lớp phủ đóng sidebar, lưu trạng thái sidebar và bố cục content theo breakpoint.
- Xác nhận các danh sách Products, Orders, Customers và Coupons đã có bộ lọc responsive, bảng cuộn ngang có kiểm soát và cột thao tác không bị co quá mức.
- Xác nhận `ProductForm.tsx`, `OrderForm.tsx`, `CustomerForm.tsx` và `coupons/CouponForm.tsx` đã chuyển các nhóm nhiều cột về một cột trên mobile.
- Bổ sung `min-w-[560px]` cho bảng đơn hàng gần đây trong trang Statistics để giữ khả năng đọc và cuộn ngang trên màn hình hẹp.
- Chuyển vùng nhập bản dịch sản phẩm và các thẻ thông tin trong modal thông báo đơn hàng sang một cột trên mobile, khôi phục hai cột từ breakpoint `sm`.
- Rà soát các trang Dashboard, Statistics, Banners, Currency, Translations và các bảng admin phụ; giữ nguyên màu sắc, kiểu dáng, logic và breakpoint hiện có.

### Kết quả xác minh

- Frontend production build và TypeScript đã chạy thành công.
- `npm run check:emoji` đạt, không phát hiện emoji hard-code ngoài registry được phép.
- `npm test` đạt 10/10 bài kiểm tra offline.
- Các điều chỉnh responsive trọng tâm đã được rà soát trong mã nguồn; chưa thực hiện kiểm thử tương tác trực tiếp trên preview do môi trường hiện không có tiến trình dev server được cấu hình.

**Trạng thái:** Đã hoàn thành phần triển khai và xác minh tự động; kiểm thử trực tiếp trên preview vẫn là bước vận hành tùy thuộc cấu hình môi trường.
