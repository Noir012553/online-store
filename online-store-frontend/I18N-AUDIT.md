# Báo cáo rà soát i18n

## Phạm vi

Đã kiểm tra static UI và dynamic UI trong frontend, gồm:

- Header, navigation, hero carousel, danh mục, product card, CTA, badge và footer.
- Product detail, search, checkout, orders, auth, profile, policy và các route admin.
- Loading, empty, error, toast, placeholder, `aria-label`, `title` và dữ liệu từ API/CMS.
- Chuỗi tiếng Việt và tiếng Anh hard-code, cùng dữ liệu sản phẩm/đơn hàng theo locale.

## Tổng quan

Ứng dụng đang dùng i18n theo namespace, tải translation từ backend qua `LanguageContext` và `translationService`. Các static label chính ở storefront nhìn chung đã dùng `t(...)`; không phát hiện các chuỗi chính như menu, hero, CTA và badge bị hard-code trực tiếp ở trang chủ.

Tuy nhiên, một số khu vực vẫn phụ thuộc hoàn toàn vào dữ liệu API hoặc còn chuỗi tiếng Anh/accessibility label chưa được dịch.

## Phát hiện cần ưu tiên

### P1 — Ảnh hưởng trực tiếp tới bản dịch

#### 1. Nhãn thông số sản phẩm bị render bằng raw key

- `src/components/SpecsTable.tsx:20-27`
- `src/components/product/ProductInformationTabs.tsx:52-54`
- `src/pages/product/[id].tsx:300-302`

Trang chi tiết đã có `specLabels` theo locale nhưng `SpecsTable` chỉ nhận `product.specs` và hiển thị key như `processor`, `ram`, `screenSize`. Cần truyền `specLabels` xuống bảng và dùng label đã dịch.

#### 2. Một số chuỗi tiếng Anh còn hard-code

- `src/components/admin/CouponManagementPage.tsx:818-820`: `Currency`, `Select currency`.
- `src/pages/admin/orders/[id]/index.tsx:15-17`: `Loading...`.
- Các wrapper admin customer/coupon edit cũng có `Loading...` tương tự.

#### 3. Error/toast có thể hiển thị raw message từ API

Ví dụ:

- `src/pages/my-orders.tsx:322-325`
- `src/pages/orders/[id].tsx:112-116`
- `src/pages/product/[id].tsx:187-190`
- `src/pages/profile.tsx:143-152`
- `src/pages/reset-password.tsx:98-100`

`err.message` có thể là tiếng Anh hoặc mã lỗi nội bộ. Nên map error code sang translation key trước khi render hoặc gọi toast.

#### 4. Review translation dùng API base URL riêng

- `src/hooks/useReviewTranslation.ts:11-20`

Hook này dùng `NEXT_PUBLIC_API_BASE_URL` và fallback `http://localhost:5000`, trong khi các request translation khác dùng proxy `/api`. Điều này có thể khiến translation review không hoạt động ở production.

## Dynamic UI và dữ liệu API/CMS

### Product

- Product detail có cơ chế localized name, description, brand, specs và `specLabels` tại `src/pages/product/[id].tsx:290-335`.
- Product card hiển thị trực tiếp name, brand, specs và `formattedPrice` tại `src/components/ProductCard.tsx:44-67` và `:170-211`.
- Đây là dữ liệu domain hợp lệ nếu backend luôn trả đúng `lang`, nhưng listing/search và product detail hiện chưa có cùng mức fallback translation.
- Brand trong search đang được đưa vào `t(product.brand)` tại `src/components/SearchDropdown.tsx:70-73`. Brand là dữ liệu động, không nên dùng làm translation key.
- Giá phụ thuộc nhiều vào `formattedPrice`; cần bảo đảm backend trả đúng currency/locale hoặc có fallback format bằng `Intl.NumberFormat`.
- Rating dùng `.toFixed(1)`, nên chưa tuân theo dấu thập phân của locale.

### Category và brand

Category/brand được gọi kèm `lang`, vì vậy tên trả từ API là dữ liệu có chủ đích, không phải chuỗi UI cần dịch. Tuy nhiên frontend chưa normalize nhất quán trường hợp API trả object đa ngôn ngữ như `{ vi, en, ... }`.

Các vị trí liên quan:

- `src/lib/context/CategoryContext.tsx:37-47`
- `src/hooks/useBrands.ts:26-31`
- `src/lib/data.ts:64-110`
- `src/components/Header.tsx:86-96`
- `src/components/Footer.tsx:331-341`

### Order

Tên sản phẩm trong order item là snapshot/dữ liệu đơn hàng và được render trực tiếp. Đây không nhất thiết là lỗi i18n, nhưng cần thống nhất sản phẩm trong đơn là snapshot cố định hay thay đổi theo locale hiện tại.

## Accessibility còn thiếu nhãn dịch

Các control icon-only sau chưa có accessible label đầy đủ:

- Nút previous/next và indicator của hero carousel: `src/components/HomeContent.tsx:656-676`.
- Nút tài khoản: `src/components/Header.tsx:138-147`.
- Social links ở footer: `src/components/Footer.tsx:276-310`.
- Nút tăng/giảm số lượng: `src/components/product/ProductOverview.tsx:93-116`.
- Nút đóng quick view: `src/components/QuickViewModal.tsx:63-70`.
- Nút chọn số sao khi viết review: `src/components/product/ProductReviews.tsx:85-100`.
- Google Maps iframe cần `title`: `src/pages/contact.tsx:230-240`.

## Rủi ro fallback i18n

- `src/lib/context/LanguageContext.tsx:404-405` trả nguyên `keyPath` nếu translation namespace chưa tải hoặc API translation lỗi. Người dùng có thể thấy các key như `loading` hoặc `filter_no_products_found`.
- Namespace được tải bất đồng bộ sau khi component render, nên cần kiểm soát trạng thái loading hoặc có fallback text phù hợp.
- `src/lib/translationService.ts:81-89` bắt lỗi network và trả object rỗng, khiến lỗi có thể chỉ biểu hiện dưới dạng translation key.

## Đề xuất thứ tự xử lý

1. Truyền và render `specLabels` trong `SpecsTable`.
2. Dịch các chuỗi `Currency`, `Select currency`, `Loading...` còn sót.
3. Chuẩn hóa error handling để không render raw `error.message`.
4. Đồng nhất API/proxy cho review translation.
5. Bổ sung `aria-label`/`title` cho các control icon-only.
6. Chuẩn hóa format rating, date và currency bằng locale mapping.
7. Xác nhận contract backend cho product/category/brand: response đã localized hay là object đa ngôn ngữ.

## Kết luận

Static UI chính đã được phủ i18n tương đối tốt. Các vấn đề còn lại tập trung ở nhãn thông số, chuỗi admin, fallback khi translation lỗi, accessible labels và việc localization/format hóa dữ liệu động từ API/CMS.
