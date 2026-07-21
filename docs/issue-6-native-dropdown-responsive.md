## Quy tắc đặt tên báo cáo

Tên file Markdown phải theo định dạng `issue-N-<mô-tả>.md`, trong đó `N` là số thứ tự của issue.

## Trạng thái

- **Loại:** Điều chỉnh component dropdown và responsive
- **Phạm vi:** Các component dùng dropdown trong `online-store-frontend`
- **Ưu tiên:** Cao đối với form admin, bộ lọc và các thao tác trên mobile
- **Trạng thái hiện tại:** Đã rà soát consumer và dọn import cũ; chờ xác minh build/preview

## Mô tả

Một số dropdown hiện đang sử dụng component từ Radix UI thông qua wrapper nội bộ. Cách triển khai này có thể làm thay đổi kích thước, vị trí hiển thị, cách tính chiều rộng và hành vi khi viewport hẹp. Hệ quả là dropdown có khả năng làm lệch bố cục hoặc gây khó khăn khi thao tác trên tablet và mobile.

Yêu cầu hiện tại là không tiếp tục sử dụng dropdown từ thư viện cho các trường hợp cần giao diện responsive ổn định. Khi triển khai issue này, cần ưu tiên dropdown native của HTML hoặc một implementation nội bộ đơn giản, giữ nguyên style và hành vi nghiệp vụ hiện có.

## Hiện trạng kỹ thuật

### 1. Dropdown menu từ thư viện

- Wrapper: `online-store-frontend/src/components/ui/dropdown-menu.tsx`
- Thư viện nền: `@radix-ui/react-dropdown-menu`
- Component sử dụng chính:
  - `online-store-frontend/src/components/Header.tsx`
  - `online-store-frontend/src/components/LanguageSwitcher.tsx`

### 2. Select từ thư viện

- Wrapper: `online-store-frontend/src/components/ui/select.tsx`
- Thư viện nền: `@radix-ui/react-select`
- Các API wrapper đang dùng gồm `Select`, `SelectTrigger`, `SelectContent`, `SelectItem` và `SelectValue`.
- Các khu vực sử dụng gồm Products, Orders, Coupons, Users, Currency, Banners, Language Management và các form admin khác.

### 3. Select native hiện có

Một số khu vực đã dùng trực tiếp phần tử HTML `<select>`, gồm:

- `online-store-frontend/src/components/admin/orders/OrderForm.tsx`
- `online-store-frontend/src/components/admin/AddLanguageModal.tsx`
- `online-store-frontend/src/components/admin/ImportExportWidget.tsx`
- `online-store-frontend/src/pages/admin/dashboard.tsx`
- `online-store-frontend/src/pages/admin/statistics.tsx`
- Các trang translation, audit log và một số form admin khác.

## Ảnh hưởng cần xử lý

- Kích thước trigger hoặc content của dropdown không ổn định khi chiều rộng màn hình giảm.
- Menu mở bằng portal có thể không khớp với container hoặc vùng thao tác mong muốn.
- Nội dung dài, nhãn dịch dài và danh sách nhiều lựa chọn có thể gây tràn ngang.
- Hành vi hiển thị giữa dropdown thư viện và `<select>` native không đồng nhất.
- Các form và bộ lọc admin có thể bị lệch layout dù phần bảng hoặc content chính đã có responsive.
- Trải nghiệm thao tác cảm ứng trên mobile có thể khác nhau giữa các loại dropdown.

## Định hướng triển khai

1. Lập danh sách đầy đủ các nơi đang import `Select` hoặc `DropdownMenu` từ component nội bộ.
2. Phân loại từng trường hợp là menu điều hướng, bộ lọc hay trường nhập liệu.
3. Thay các select phù hợp bằng `<select>` native có class responsive theo style hiện có.
4. Với menu điều hướng như tài khoản và ngôn ngữ, cân nhắc implementation nội bộ không phụ thuộc dropdown primitive của thư viện.
5. Giữ nguyên dữ liệu, callback, validation, quyền, route, thứ tự lựa chọn và logic nghiệp vụ.
6. Giữ nguyên màu sắc, hình dạng, typography, tên biến style và breakpoint hiện tại nếu không có lý do kỹ thuật rõ ràng.
7. Kiểm tra nội dung dịch dài, danh sách nhiều lựa chọn, viewport mobile, tablet và desktop.
8. Không xóa package hoặc wrapper dùng chung trước khi xác nhận không còn nơi nào sử dụng.
9. Sau khi thay thế hoàn tất, phải rà soát và dọn sạch thư viện dropdown thừa, wrapper không còn dùng, import không còn cần thiết và các dependency liên quan trong `package.json`.
10. Chỉ xóa dependency sau khi đã kiểm tra toàn bộ frontend, build thành công và xác nhận không còn import trực tiếp hoặc gián tiếp.

## Phạm vi ưu tiên

- Bộ lọc trong Products, Orders, Customers và Users.
- Select trong ProductForm, OrderForm, CouponForm, CurrencyForm và các form tạo/sửa.
- Dropdown ngôn ngữ và menu tài khoản trong header.
- Select trong Dashboard, Statistics, Translation, Audit Log, Import/Export và Banner Management.

## Nguyên tắc không thay đổi

- Không thay đổi API hoặc dữ liệu.
- Không thay đổi cấu trúc route.
- Không thay đổi phân quyền.
- Không xóa breakpoint responsive hiện có.
- Không thay đổi giao diện desktop ngoài phần cần thiết để loại bỏ ảnh hưởng của dropdown thư viện.
- Không triển khai thay thế cho đến khi có rà soát đầy đủ các consumer của wrapper.

## Tiêu chí nghiệm thu

- Các dropdown trong phạm vi ưu tiên không còn gây lệch layout trên mobile và tablet.
- Trigger và danh sách lựa chọn không vượt khỏi viewport.
- Form, bộ lọc và menu vẫn giữ nguyên hành vi nghiệp vụ.
- Dropdown có nội dung dài và bản dịch dài vẫn thao tác được.
- Giao diện desktop giữ nguyên màu sắc, hình dạng, typography và bố cục hiện có.
- Không còn import không sử dụng từ wrapper dropdown sau khi thay thế.
- Không còn package, wrapper hoặc dependency dropdown thừa trong frontend sau khi rà soát.
- Build frontend thành công.
- Golden path của Products, Orders, Customers và Dashboard được kiểm tra trên desktop, tablet và mobile.

## Trạng thái xử lý

- Rà soát toàn bộ frontend: không có file wrapper `src/components/ui/select.tsx` hoặc `src/components/ui/dropdown-menu.tsx`, cũng không có dependency `@radix-ui/react-select` hay `@radix-ui/react-dropdown-menu`.
- Xác nhận menu tài khoản, menu sản phẩm trong header và bộ chọn ngôn ngữ đều là implementation nội bộ, không sử dụng dropdown primitive từ Radix.
- Xác nhận các trường coupon đang dùng `<select>` native; giữ lại Popover cho multi-select vì có tìm kiếm, checkbox và thao tác chọn/xóa nhiều mục.
- Đã xóa hai import `Select` cũ không dùng trong `CouponManagementPage.tsx` và `coupons/CouponForm.tsx`.
- Build frontend và TypeScript đã chạy thành công sau khi cài dependencies.
- `npm run check:emoji` và `npm test` đạt lần lượt không có lỗi và 10/10 bài kiểm tra.
- Chưa kiểm thử trực tiếp trên preview vì môi trường chưa cấu hình tiến trình dev server.
