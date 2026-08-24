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

- `src/lib/context/LanguageContext.tsx:349-405` hỗ trợ fallback text tùy chọn; các call site không truyền fallback vẫn có thể trả nguyên `keyPath` nếu namespace chưa tải hoặc API translation lỗi.
- Namespace được tải bất đồng bộ sau khi component render, nên các màn hình quan trọng vẫn cần truyền fallback text phù hợp.
- `src/lib/translationService.ts:81-89` bắt lỗi network và trả object rỗng; cơ chế fallback cache đã có nhưng cần bảo đảm namespace được lưu đầy đủ.

## Kế hoạch và trạng thái triển khai

### Đã hoàn thành

- [x] Truyền và render `specLabels` trong `SpecsTable`.
- [x] Dịch các chuỗi currency/loading trong các vị trí admin đã kiểm tra, gồm `ProductForm`.
- [x] Chuẩn hóa các toast/message admin và review để không render trực tiếp raw `error.message`; mã lỗi chưa có bản dịch dùng thông báo generic.
- [x] Đồng nhất API/proxy cho review translation qua `API_BASE_PATH` `/api`.
- [x] Bổ sung `aria-label`/`title` cho carousel, account, quantity, quick view, review stars, social links và Google Maps.
- [x] Chuẩn hóa fallback format currency cho order/product và format rating, thời gian, số liệu monitoring bằng locale.
- [x] Chuẩn hóa brand động trong search bằng `getTranslatedValue(...)`, không dùng brand làm translation key.

### Vấn đề mới ghi nhận — Dynamic spec key

- Catalog `specKeyTranslations` và `specKeyTranslationCache` vẫn là nguồn label chuẩn; seed không tự phát hiện hoặc dịch concept mới từ nguồn hàng.
- Đã bổ sung alias/catalog cho `mau_sac`, `kieu_tai_nghe` và `tuong_thich`; các key này hiện được canonicalize thành `color`, `headphoneType` và `compatibility` thay vì hiển thị raw.
- Không nên yêu cầu cập nhật JSON và chạy seed cho từng sản phẩm. Seed chỉ cần chạy khi thêm concept/alias mới hoặc cần đồng bộ lại cache.
- Đã tự động hóa bước phát hiện/đăng ký trong import và request localization qua `src/services/specKeyTranslationService.js` và model `src/models/SpecKeyRegistry.js`; lỗi ghi registry không làm hỏng import.
- Unknown key được lưu dạng canonical key, source key quan sát được và trạng thái `pending`; locale không mặc định được đưa vào dynamic translation/cache, còn locale mặc định dùng fallback human-readable.
- Các key mới phải được sanitize an toàn và giữ value domain nguyên trạng; chỉ label/key được đưa qua quy trình dịch.

### Còn lại / cần xác nhận

- [ ] Bổ sung fallback text cho các call site `t(...)` quan trọng còn trả key khi namespace lỗi.
- [x] Tự động phát hiện và đăng ký unknown spec key trong pipeline import/request thay vì phụ thuộc vào seed thủ công.
- [ ] Hoàn thiện worker/queue duyệt và dịch chuẩn label pending cho locale mặc định, sau đó cập nhật `SpecKeyTranslationCache` mà không cần thao tác thủ công.
- [x] Bổ sung alias/canonical key và label catalog cho `mau_sac`, `kieu_tai_nghe`, `tuong_thich`.
- [ ] Xác nhận backend luôn trả product/category/brand theo locale hoặc object đa ngôn ngữ; tiếp tục normalize các route chưa truyền locale đầy đủ.
- [ ] Kiểm tra contract snapshot tên sản phẩm trong order: giữ tên tại thời điểm đặt hàng hay thay đổi theo locale hiện tại.
- [ ] Rà soát các chuỗi message chủ động trả từ API/CMS để phân biệt dữ liệu domain hợp lệ với UI message cần dịch.

### Kiểm tra đã thực hiện

- [x] `npx tsc --noEmit` đạt sau các thay đổi.
- [x] `npm test` đạt 10/10 bài test offline.
- [x] `git diff --check` không phát hiện lỗi whitespace.
- [x] Syntax backend và catalog 9 locale đã được kiểm tra sau khi thêm registry.
- [ ] Không chạy lại `npm run build` frontend theo yêu cầu; lần chạy trước đã qua bước TypeScript nhưng bị dừng ở bước tạo production bundle.
- [ ] Backend i18n test chưa chạy được vì môi trường `online-store-backend` hiện thiếu package `dotenv`.

## Kết luận

Static UI chính và các hạng mục P1 đã được phủ i18n tốt hơn: spec labels, currency/loading, error UI, accessibility labels và locale formatting đã được triển khai. Phần còn lại chủ yếu là fallback text tại các call site chưa đầy đủ và xác nhận contract localization của backend/CMS.
