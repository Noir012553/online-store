# Issue 10 — Rà soát hard-coded chưa hỗ trợ i18n

## Phạm vi và tiêu chí

- Đã rà soát `online-store-frontend/src` và `online-store-backend/src`.
- Dự án **đã có i18n**: frontend dùng `t(...)`/`LanguageContext`; backend dùng `getMessage(lang, key)` và các file `src/locales/*`.
- Báo cáo chỉ liệt kê literal có thể tới người dùng (UI, `message`, `error`, exception được middleware trả về, email), hoặc literal động được dùng để quyết định bản dịch/fallback. Không tính route, tên biến, log dev thuần túy, key i18n hợp lệ như `address.type.invalid`.
- Một số API có thể chủ yếu dành cho admin/dev vẫn được ghi nhận, vì response hiện có thể bị hiển thị trực tiếp hoặc dùng bởi client khác.

## Tóm tắt

| Mức độ | Số nhóm | Ý nghĩa |
|---|---:|---|
| Cao | 10 | Error/response ở luồng API, checkout, thanh toán, vận chuyển; người dùng có thể nhận tiếng Anh/tiếng Việt cố định. |
| Trung bình | 12 | Admin UI, thao tác quản trị, import/export, các fallback có thể lộ literal/key. |
| Thấp | 4 | Endpoint test/debug hoặc thông báo trạng thái dev. |

> Một nhóm có thể gồm nhiều literal cùng một ngữ cảnh. Tổng số literal/điểm gọi thực tế cao hơn số nhóm trên.

---

## A. Frontend

### A1. Thông báo phân quyền hard-code — Trung bình

- **Vị trí:** `online-store-frontend/src/lib/permissions.ts:55-66`
- **Literal:** `Only super admins can manage users`, `Only super admins can manage currencies`, `Admins can manage translations`, `Only admins can manage products/orders/customers/coupons/banners`.
- **Vấn đề:** `getAccessDeniedMessage()` luôn trả tiếng Anh, không nhận locale và không gọi `t()`.
- **Ảnh hưởng:** Mọi popup/tooltip/thông báo từ chối quyền sẽ không theo ngôn ngữ giao diện.
- **Hướng xử lý:** Thay mapping literal bằng translation key, lấy chuỗi qua i18n tại nơi render hoặc truyền translator/locale vào hàm.

### A2. Nhãn và tooltip vai trò quản trị hard-code — Trung bình

- **Vị trí:** `online-store-frontend/src/components/admin/RoleBadge.tsx:10-34,43-47`
- **Literal:** `Super Admin`, `Admin`, `User`, `Full access to all features`, `Can manage core features`, `Limited access`.
- **Vấn đề:** `label` và `description` được render trực tiếp; `description` còn là giá trị thuộc tính `title` nên dễ bị bỏ sót khi kiểm tra UI.
- **Hướng xử lý:** Lưu translation key trong `roleConfig`, gọi `t()` cho cả nhãn và tooltip.

### A3. Placeholder/hint của form tiền tệ chưa qua i18n — Trung bình

- **Vị trí:** `online-store-frontend/src/components/admin/CurrencyForm.tsx:124-156`
- **Literal:** `VND, USD, EUR...`, `ISO 4217`, `₫, $, €...`.
- **Vấn đề:** Cùng form đã dùng `t()` cho label và một placeholder, nhưng ba nội dung trên vẫn cố định.
- **Hướng xử lý:** Bổ sung key admin tương ứng. Với ví dụ mã/ký hiệu có thể giữ dữ liệu minh họa, nhưng hint `ISO 4217` vẫn cần chuỗi locale.

### A4. Placeholder tỷ giá cố định — Thấp

- **Vị trí:** `online-store-frontend/src/components/admin/ExchangeRateForm.tsx:169-180`
- **Literal:** `0.000041`.
- **Vấn đề:** Không phải câu chữ; là giá trị mẫu cố định. Ở locale dùng quy ước dấu phẩy thập phân, ví dụ này dễ gây hiểu sai.
- **Hướng xử lý:** Dùng định dạng số theo locale hoặc bỏ placeholder nếu không cần thiết.

### A5. Mapping lỗi checkout dựa vào câu tiếng Anh — Cao

- **Vị trí:** `online-store-frontend/src/components/checkout/Step5OrderReview.tsx:113-125`
- **Literal:** `Email already in use`, `Insufficient stock`, `No order items`.
- **Vấn đề:** UI cố tìm *nội dung tiếng Anh* của `Error.message` để trả key dịch. Nếu backend đổi language theo `req.lang`, chuyển sang key, hay chỉ thay câu chữ, mapping không còn khớp và UI rơi vào lỗi chung `create_order`.
- **Ảnh hưởng:** Lỗi cụ thể ở bước đặt hàng bị mất hoặc sai theo locale.
- **Hướng xử lý:** Backend trả error code/key ổn định (ví dụ `ORDER_INSUFFICIENT_STOCK`); frontend map theo code, không map theo câu đã dịch.

### A6. Fallback sản phẩm/category là key thô — Trung bình

- **Vị trí:** `online-store-frontend/src/lib/adapters.ts:116-151`
- **Literal:** `product_unnamed`, `product_category_laptop`.
- **Vấn đề:** Adapter gán key dạng i18n vào `name`, `category`, `categoryName` nhưng không dịch tại đây và không có bằng chứng bảo đảm mọi renderer sẽ gọi `t()` trước khi hiển thị. Người dùng có thể thấy key thô khi dữ liệu thiếu.
- **Hướng xử lý:** Lưu fallback mang tính dữ liệu (`null`/mã nội bộ) rồi dịch tại render layer, hoặc xác nhận mọi nơi render các trường này đều resolve key.

---

## B. Backend — response/error nghiệp vụ

### B1. Translation API còn nhiều response hard-code — Cao

- **Vị trí:** `online-store-backend/src/controllers/translationController.js`.
- **Literal và dòng:**
  - `Invalid translation namespace` — `45-50`
  - `Translations not found for language: ...` — `66-71`
  - `Target language (targetLang) is required` — `141-146`
  - `Source language (sourceLang) is required` — `148-153`, `331-334`
  - `Text to translate is required and must be a non-empty string` — quanh `154-160`
  - `Unsupported source language: ...` — `166-168`, `355-357`
  - `Unsupported target language: ...` — `238-240`
  - `limit must be an integer between 1 and 500` và `A valid dynamic entity type is required` — `1041-1052`
  - `Dynamic retranslation failed` — `1083-1088`
  - `Translation not found`, `Translation soft deleted`, `Translation hard deleted`, `Translation restored`, `Translation created` — `1366-1489`
  - `Language code is required` — `1506-1510`, `1605-1609`, `1704-1708`, `1764-1768`
  - `Bulk translations completed` — `1576-1580`
  - `hashKey and translatedText are required` — `1815-1819`
  - `Language (lang) is required`, `Language not supported: ...` — `2283-2287`, `2398-2402`.
- **Vấn đề:** Controller quản lý chính nội dung dịch nhưng nhiều nhánh không dùng `getMessage()`; một response cùng endpoint có thể lẫn tiếng Anh và bản dịch.
- **Hướng xử lý:** Chuẩn hóa mọi `message`/validation error thành `getMessage(resolvedLang, key, params)` và trả `code` ổn định cho client.

### B2. Xác thực người dùng trả exception không dịch — Cao

- **Vị trí:** `online-store-backend/src/controllers/userController.js`.
- **Literal/dòng:** `Token and new password are required` (`416-422`), `Verification token is required` (`457-463`), `User not found` (`499-505`, `605-610`), `Refresh token is required` (`587-594`), `Invalid refresh token` (`635-644`), `Test email endpoint is not available in production` (`652-657`), `Google Client ID is not configured` (`743-745`).
- **Vấn đề:** Đây đều có thể qua error middleware thành response API. File này đã dùng `getMessage()` ở các nhánh cạnh đó, nên hành vi locale đang không nhất quán.
- **Ghi chú:** Các message success `Test email sent successfully!` (`672-674`) và `User created successfully by admin` (`890-892`) cũng chưa dịch.

### B3. Luồng order/currency chưa hỗ trợ dịch — Cao

- **Vị trí:** `online-store-backend/src/controllers/orderController.js:261-345,385-394`.
- **Literal:** `currencyCode is required`, `currencyCode must reference an active currency`, `Currency exchange rates are temporarily unavailable` (nhiều nhánh), `Currency configuration is temporarily unavailable` (nhiều nhánh), `Product base currency is missing or invalid`, `Coupon is missing currencyCode`.
- **Vấn đề:** Các lỗi này phát sinh trong checkout và ảnh hưởng trực tiếp khả năng tạo đơn. Một số lỗi coupon gần đó đã dùng `getMessage()`, nhưng các lỗi currency thì không.
- **Hướng xử lý:** Thêm key `order`/`currency` có interpolation cho mã tiền tệ nếu cần; chuyển message lỗi thành code/key thống nhất.
- **Thành công/xóa chưa dịch:** `Order deleted` (`908-910`) và `Order permanently deleted` (`1112-1114`).

### B4. Coupon validation còn literal — Cao

- **Vị trí:** `online-store-backend/src/controllers/couponController.js:543-570`.
- **Literal:** `Order amount must be at least ${minimumOrderAmount} ${normalizedOrderCurrencyCode}`, `Percentage discount cannot exceed 100`, `Coupon does not apply to the selected products`.
- **Vấn đề:** Có số tiền/mã tiền tệ động nhưng không nội địa hóa định dạng số hoặc thông điệp.
- **Hướng xử lý:** Dùng key có tham số số/mã; client hoặc formatter locale xử lý số tiền.

### B5. Vận chuyển/GHN còn lỗi hard-code — Cao

- **Vị trí:** `online-store-backend/src/controllers/shipmentController.js`.
- **Literal/dòng:** `Invalid insurance value` (`102-104`), `Currency exchange rates are temporarily unavailable` (`107-110`, `251-254`), `GHN returned an invalid shipping fee` (`228-232`), `Invalid shipping fee conversion` (`245-248`), `Order currency data is unavailable` (`277-280`).
- **Vấn đề:** Là lỗi dùng trong tạo shipment; đang trộn với các lỗi `getMessage(req.lang, 'shipment.*')` đã được dịch trong cùng controller.
- **Hướng xử lý:** Bổ sung các key `shipment` và không để error provider nguyên văn đi thẳng tới UI.

### B6. Service shipping có exception tiếng Anh — Cao

- **Vị trí:** `online-store-backend/src/services/shippingService.js:7-25`.
- **Literal:** `Selected shipping provider is unavailable`, `Selected shipping service is unavailable`.
- **Vấn đề:** Service nhận `lang` nhưng không dùng để tạo lỗi; caller khó bảo đảm localize được.
- **Hướng xử lý:** Service trả error code thay vì câu chữ, controller dịch bằng `lang` đã có.

### B7. Service tỷ giá có exception tiếng Anh — Cao

- **Vị trí:** `online-store-backend/src/services/exchangeRateService.js:77-220`.
- **Literal:** `Exchange rate does not exist` (`79-81`, `119-122`, `178-182`), `Exchange rate from ${fromCode} to ${toCode} not found` (`103-107`), `From currency and to currency must be different` (`129-131`), `Exchange rate from ... already exists` (`142-146`), `Amount must not be negative` (`197-200`), `Currency ${toCode} does not exist` (`218-220`).
- **Vấn đề:** Các message có dữ liệu động nhưng không có cơ chế locale; error có thể lộ trực tiếp qua controller.
- **Hướng xử lý:** Service trả typed/code error + params (`fromCode`, `toCode`); controller resolve key theo ngôn ngữ request.

### B8. Payment webhook/payment service có response hard-code — Cao

- **Vị trí:**
  - `online-store-backend/src/controllers/paymentController.js:174-205,242-275`
  - `online-store-backend/src/services/paymentService.js:203-324,512-516`
- **Literal:** `Missing signature in webhook`, `Webhook processed`, `Payment ${paymentId} not found`, `Gateway "${gateway}" is not supported`, `Order ${transactionInfo.orderId} not found`, `Payment reconciliation failed`, `Webhook already processed`, `Webhook processed successfully`, `Refund processed successfully`.
- **Vấn đề:** Response của gateway/IPN và lịch sử payment chưa thống nhất locale. Các câu `Payment ... not found` có interpolation trực tiếp, không phải key.
- **Hướng xử lý:** Response nghiệp vụ trả `code` và localized `message`; endpoint webhook nội bộ vẫn nên có code để client không phụ thuộc câu chữ.

### B9. Banner CRUD translation chưa dịch — Trung bình

- **Vị trí:** `online-store-backend/src/controllers/bannerController.js:646-682,517-519`.
- **Literal:** `Translation not found`, `Translation deleted`, `Banner permanently deleted`.
- **Vấn đề:** Nhánh banner translation bypass `getMessage()` trong khi `banner not found` gần đó đã dùng i18n.

### B10. Product/category và product model — Trung bình

- **Vị trí:**
  - `online-store-backend/src/controllers/productController.js:373-380,562-570,848-850,907-909`
  - `online-store-backend/src/models/Product.js:188-190`
- **Literal:** `A valid category is required`, `The selected category does not exist` (mỗi câu lặp ở create/update), `Product permanently deleted`, `Lỗi khi lấy sản phẩm được đánh giá cao`, `Price must be a positive number (> 0), got {VALUE}`.
- **Vấn đề:** Trộn tiếng Việt/Anh; validation message trong model không phải i18n key nên không thể localize theo request một cách đáng tin cậy.
- **Hướng xử lý:** Model trả code/key tương tự các model đã dùng key (`Currency`, `Address`); controller/error middleware resolve theo `req.lang`.

### B11. Upload Cloudinary trả lỗi tiếng Anh — Trung bình

- **Vị trí:** `online-store-backend/src/controllers/cloudinaryController.js:20-126`.
- **Literal:** `Invalid folder`, `Invalid image metadata`, `publicId and url are required`, `Invalid image dimensions`, `File too large`, `Invalid image format`.
- **Vấn đề:** Các response validation upload trực tiếp chưa qua `getMessage()`.

### B12. Import/export sản phẩm trộn tiếng Việt và hard-code — Trung bình

- **Vị trí:** `online-store-backend/src/controllers/productImportController.js`.
- **Literal/dòng:** `File buffer is missing` (`220-222`), `Format không được hỗ trợ: ${format}` (`565-567`, `844-846`, `949-951`), `Hướng dẫn import sản phẩm` (`886-888`), `limit phải là số nguyên từ 1 đến 10000` (`957-959`), `Lỗi khi export products` (`1071-1073`), `Lỗi khi lấy export statistics` (`1279-1281`).
- **Vấn đề:** API import/export đa ngôn ngữ nhưng response bị khóa tiếng Việt hoặc tiếng Anh; `error.message` gốc còn được trả ra trong một số nhánh.
- **Liên quan:** `CSVAdapter.js:82-89` (`No products found in CSV`, `CSV parse error: ...`), `JSONAdapter.js:38-45` (`JSON parse error: ...`), `productImportValidator.js:190-192` (`Deal must be a JSON object`). Các error này có thể bubble lên controller.

### B13. Rate limit hard-code tiếng Việt — Cao

- **Vị trí:** `online-store-backend/src/middleware/rateLimitMiddleware.js:30-31,56-57`.
- **Literal:** `Quá nhiều yêu cầu đăng ký. Vui lòng thử lại sau 1 giờ.`, `Quá nhiều request. Vui lòng thử lại sau 15 phút.`
- **Vấn đề:** Middleware chạy trước controller và không dùng request locale; người dùng không phải tiếng Việt vẫn luôn thấy tiếng Việt.
- **Hướng xử lý:** Cấu hình handler của rate limiter trả error code hoặc resolve qua language middleware; tránh trộn `yêu cầu` và `request`.

### B14. Validation middleware có `getMessage` nhưng không dùng — Cao

- **Vị trí:** `online-store-backend/src/middleware/validationMiddleware.js:6-24`.
- **Literal:** `Validation failed`.
- **Vấn đề:** `getMessage` đã được import ở dòng 7 nhưng `message` vẫn hard-code ở dòng 18. Đây là lỗi i18n rõ ràng và nhất quán có thể đã bị bỏ sót.

### B15. Health/analytics/static status responses — Thấp

- **Vị trí:**
  - `online-store-backend/src/controllers/healthController.js:41-50`
  - `online-store-backend/src/routes/analyticsRoutes.js:130-131`
  - `online-store-backend/src/app.js:478-488`
- **Literal:** `Only admins can reset stats`, `Cloudflare stats reset successfully`, `Analytics cache cleared`, `Static files status`.
- **Vấn đề:** Các endpoint quản trị/debug trả câu cố định tiếng Anh. Nếu UI admin hiển thị trực tiếp, chúng không theo locale.

---

## C. Email và dữ liệu động

### C1. Email OTP có câu tiếng Việt cố định — Trung bình

- **Vị trí:** `online-store-backend/src/services/emailService.js:252-261`.
- **Literal:** `Mã OTP của bạn: ${otp}`.
- **Vấn đề:** HTML và subject đã dùng `getMessage(emailLang, 'email.otp')`, nhưng bản text fallback lại luôn là tiếng Việt; email client chỉ hiển thị text sẽ không được dịch.
- **Hướng xử lý:** Bổ sung trường `otpText` (hoặc interpolation) trong `email.otp`, dùng cùng `msg` cho cả HTML/text.

### C2. Lỗi và trạng thái email service chưa dịch — Trung bình

- **Vị trí:** `online-store-backend/src/services/emailService.js:73-75,130-132,147-149,204-206,221-223,266-268,281-284`.
- **Literal:** `Email disabled (dev mode)` (lặp 4 lần), `Failed to send verification/reset password/OTP email: ...`.
- **Vấn đề:** Service nhận `lang` nhưng các status/error không dùng locale. Các lỗi này có thể trở thành response ở endpoint user/newsletter.
- **Hướng xử lý:** Lỗi kỹ thuật nên được log kèm nguyên nhân, còn API chỉ trả code/key đã dịch; status dev không nên lộ literal cho UI.

### C3. Dynamic content: không nên map theo câu đã dịch — Cao

- **Vị trí:** `Step5OrderReview.tsx:113-125` (đã nêu A5), cùng các service backend ở B6/B7/B8.
- **Vấn đề:** Dynamic error chứa biến như currency/gateway/ID được ghép bằng template literal. Câu chữ là giao thức ngầm giữa server và client, gây vỡ khi dịch hoặc đổi wording.
- **Hướng xử lý chuẩn:** API trả cấu trúc ví dụ `{ code: 'CURRENCY_NOT_FOUND', params: { code } }`; message được dịch từ code bằng locale request hoặc frontend. Không parse `message.includes(...)`.

---

## D. Ngoài phạm vi UI chính nhưng cần quyết định

Các literal sau phần lớn là abstract adapter, script/seed, test hoặc lỗi cấu hình server. Không ưu tiên localize cho khách hàng, nhưng cần tránh cho chúng rò ra API nếu có thể:

- `online-store-backend/src/adapters/carrierAdapters.js:8-25,230-232`: các `... must be implemented`, `GHN trackShipment not yet implemented`.
- `online-store-backend/src/utils/generateToken.js:11-17`: `JWT access/refresh secret is not configured`.
- `online-store-backend/src/app.js:310-312`: `VND must be configured before migrating coupon currencies`.
- `online-store-backend/src/seeds/*` và `src/scripts/*`: nhiều lỗi CLI/seed như `Source language ... is required`, `No products provided`, `MONGO_URI not set...`.
- `online-store-backend/src/services/cloudflareAiService.js:425-435`: alert kỹ thuật (`No Cloudflare configurations found`, hướng dẫn `.env`); không nên dịch cho khách hàng hoặc trả public.
- `online-store-backend/src/routes/paymentRoutes.js:212-626`: các endpoint test trả `Complete flow test finished`, `Signature test successful`, `Webhook test completed/failed`, `Test webhook payload generated` và note tiếng Anh. Chỉ cần i18n nếu được expose trong UI admin.

---

## Đề xuất thứ tự xử lý

1. **Tạo contract lỗi ổn định** cho API: `code`, `params`, `message`; client không được phụ thuộc text lỗi.
2. **Sửa các luồng khách hàng:** checkout/order, shipment, payment, user authentication, rate limit và validation middleware.
3. **Sửa controller translation:** đây là nơi dễ tạo response lẫn ngôn ngữ nhất dù dự án đã có i18n.
4. **Sửa email text fallback** và các status/error có thể đi ra response.
5. **Sửa admin UI:** quyền, RoleBadge, CurrencyForm; sau đó review mọi `placeholder`, `title`, toast và empty state.
6. **Chuẩn hóa model/service:** trả key/code thay vì literal tiếng Anh; resolve message ở boundary có `req.lang`.

## Cách kiểm chứng sau khi sửa

- Gọi cùng API với ít nhất `vi`, `en` và một locale không-Latin; kiểm tra `message` và interpolation.
- Test error path checkout: thiếu `currencyCode`, hết hàng, coupon sai, tỷ giá không có, shipping provider/service không có.
- Test reset password, verify email, refresh token, upload ảnh và import CSV/JSON.
- Render admin ở từng locale, kiểm tra `title`, placeholder và fallback dữ liệu thiếu; không chỉ kiểm tra text hiển thị chính.
- Assert client xử lý `code` thay vì `message.includes(...)`.

---

## Cập nhật xác minh mã nguồn

Đã đối chiếu lại các hạng mục ưu tiên cao của báo cáo với mã nguồn hiện tại:

- `online-store-backend/src/middleware/validationMiddleware.js` đã trả `code: 'VALIDATION_FAILED'` và dùng `getMessage(req.lang, 'common.error_request_title')`; phát hiện B14 trong phần audit ban đầu không còn đúng.
- `online-store-backend/src/middleware/rateLimitMiddleware.js` đã dùng handler chung, trả mã lỗi ổn định theo từng limiter và lấy thông điệp theo `req.lang` qua `getMessage(req.lang, 'errors.too_many_requests_title')`; phát hiện B13 và E.B1 không còn đúng.
- `online-store-frontend/src/components/admin/RoleBadge.tsx` đã dùng `labelKey` và `descriptionKey` với `t(...)`; phát hiện A2 không còn đúng.
- Đã xóa `getAccessDeniedMessage()` khỏi `online-store-frontend/src/lib/permissions.ts` vì helper chứa literal tiếng Anh này không có consumer. Không còn API helper nào có thể trả các chuỗi này; phát hiện A1 được đóng.
- `CurrencyForm.tsx` vẫn còn placeholder ký hiệu tiền tệ `₫, $, €...`. Đây là dữ liệu minh họa đa ngôn ngữ, không phải câu văn hiển thị theo locale; giữ nguyên để không thay đổi giao diện hoặc nội dung gốc.

Các mục khác trong báo cáo vẫn cần được xác minh và xử lý riêng theo phạm vi đã nêu.

---

## E. Phát hiện bổ sung khi rà soát lại
## Phạm vi và tiêu chí

- Tài liệu này là phần **bổ sung** cho `docs/issue-10-internationalization-audit.md`, không lặp lại các nhóm đã được nêu rõ trong báo cáo đó.
- Đã rà soát lại literal có thể đi tới người dùng: UI, fallback của UI, exception/response API, `message`, `hint` và trạng thái có thể bị client hiển thị.
- Không tính route, tên biến, log phát triển thuần túy, nội dung test/seed/script, hoặc i18n key hợp lệ không hiển thị trực tiếp.
- Các lỗi được chia thành **static** (câu cố định) và **dynamic** (câu ghép biến hoặc dùng câu chữ làm giao thức xử lý lỗi).

## Tóm tắt

| Mức độ | Số nhóm mới | Ý nghĩa |
|---|---:|---|
| Cao | 3 | Làm hỏng contract lỗi đa ngôn ngữ hoặc trả thông báo API cố định trong luồng vận hành. |
| Trung bình | 5 | Fallback/nhãn UI và response admin chưa theo locale. |
| Thấp | 2 | Endpoint debug/test có thể lộ chuỗi cố định khi được mở trong UI admin. |

> Số lượng là theo nhóm ngữ cảnh. Một nhóm có thể có nhiều literal/điểm gọi.

---

## A. Frontend

### A1. Fallback UI của quản lý bản dịch banner bị khóa tiếng Việt — Trung bình

- **Vị trí:** `online-store-frontend/src/components/admin/BannerTranslationManager.tsx:247,278,341`.
- **Literal:** `Ngôn ngữ được hỗ trợ`, `Click nút "Thêm dịch thuật" để bắt đầu`, `Các ngôn ngữ chưa được dịch:`.
- **Loại:** Static fallback và UI text render trực tiếp.
- **Vấn đề:** Hai chuỗi đầu là fallback sau `t(...)`; chuỗi ở dòng 341 render trực tiếp. Khi locale không phải tiếng Việt hoặc thiếu key, admin vẫn thấy tiếng Việt cố định.
- **Ảnh hưởng:** Màn hình quản lý bản dịch tự mâu thuẫn với mục tiêu đa ngôn ngữ, đặc biệt ở empty state và phần coverage.
- **Hướng xử lý:** Dùng key dịch cho cả ba chuỗi; không fallback sang literal trong JSX. Nếu cần fallback, fallback phải lấy từ locale mặc định trong kho i18n.

### A2. Lỗi/thông báo của Cloudinary client còn literal tiếng Anh — Trung bình

- **Vị trí:** `online-store-frontend/src/hooks/useCloudinaryUpload.ts:39,112,115,120`.
- **Literal:** `Failed to get signature`, `Invalid response from Cloudinary`, `Upload failed: ${xhr.statusText}`, `Upload failed`.
- **Loại:** Dynamic exception path.
- **Vấn đề:** Các exception này hiện được catch và toast bằng key ở hook, nhưng `getSignature`/`uploadToCloudinary` là API được export. Nếu được tái sử dụng hoặc lỗi được bubble trước catch, consumer có thể nhận tiếng Anh hoặc `statusText` từ provider.
- **Ảnh hưởng:** Thông điệp provider không theo locale và không ổn định; `xhr.statusText` còn khác nhau giữa trình duyệt/provider.
- **Hướng xử lý:** Chuẩn hóa lỗi thành code nội bộ (ví dụ `UPLOAD_SIGNATURE_FAILED`, `UPLOAD_PROVIDER_REJECTED`) và resolve text ở boundary UI; chỉ log chi tiết provider cho mục đích chẩn đoán.

### A3. Translation service ném validation bằng câu tiếng Anh — Trung bình

- **Vị trí:** `online-store-frontend/src/lib/translationService.ts:51,92-96,114,120,138,144`.
- **Literal:** `Failed to fetch translations: ${response.statusText}`, `Target language (targetLang) is required`, `Source language (sourceLang) is required` và các error code dạng chuỗi `translation_failed_error`, `translation_service_error`, `fetch_translations_error`, `load_translations_error`.
- **Loại:** Static và dynamic exception path.
- **Vấn đề:** Service nằm trong luồng static/dynamic translation nhưng vừa ném literal tiếng Anh, vừa dùng key-like string làm `Error.message`. Cơ chế này không truyền locale và khuyến khích caller hiển thị hoặc so khớp trực tiếp `error.message`.
- **Ảnh hưởng:** Lỗi validate/HTTP có thể rò text tiếng Anh; contract lỗi không đủ rõ để đảm bảo mọi caller dịch đúng.
- **Hướng xử lý:** Ném structured error `{ code, params }` thay vì câu text hoặc key trong `Error.message`; UI map `code` sang `t(...)`.

### A4. Fallback tạo review có thể lộ i18n key thô — Trung bình

- **Vị trí:** `online-store-frontend/src/lib/api.ts:1226-1228`.
- **Literal:** `review_creation_failed`.
- **Loại:** Static fallback/key thô.
- **Vấn đề:** Khi API review thất bại nhưng không có `errorData.message`, client ném literal key qua `Error.message`. Không có bằng chứng tại đây rằng mọi caller sẽ resolve key trước khi render.
- **Ảnh hưởng:** Người dùng có thể thấy `review_creation_failed` thay vì thông báo theo locale.
- **Hướng xử lý:** Trả code có cấu trúc từ API layer và chỉ dịch tại nơi render/toast; không dùng i18n key làm câu lỗi mặc định.

### A5. Mapping checkout vẫn phụ thuộc message tiếng Anh từ server — Cao

- **Vị trí:** `online-store-frontend/src/components/checkout/Step5OrderReview.tsx:113-125`.
- **Literal:** `Email already in use`, `Insufficient stock`, `No order items`.
- **Loại:** Dynamic contract lỗi.
- **Vấn đề bổ sung:** Đây không chỉ là hard-code; `includes(...)` biến bản dịch tiếng Anh thành giao thức giữa backend và frontend. Backend đã có `req.lang`, nên khi backend bắt đầu trả localized message, mapping này chắc chắn sai.
- **Ảnh hưởng:** Người dùng checkout có thể chỉ nhận lỗi chung `create_order`, dù backend đã trả nguyên nhân chính xác.
- **Hướng xử lý:** API trả `code` ổn định cùng `params`; frontend map theo `code`, tuyệt đối không parse câu đã dịch.

---

## B. Backend — response/error nghiệp vụ

### B1. Rate limit còn năm thông báo chưa được báo cáo đầy đủ — Cao

- **Vị trí:** `online-store-backend/src/middleware/rateLimitMiddleware.js:15,43,78,95,110,123`.
- **Literal:**
  - `Quá nhiều lần đăng nhập thất bại. Vui lòng thử lại sau 15 phút.`
  - `Quá nhiều yêu cầu reset mật khẩu. Vui lòng thử lại sau 1 giờ.`
  - `Quá nhiều yêu cầu tạo đơn hàng. Vui lòng thử lại sau 1 giờ.`
  - `Quá nhiều yêu cầu thanh toán. Vui lòng thử lại sau 1 giờ.`
  - `Quá nhiều cập nhật giỏ hàng. Vui lòng thử lại sau 1 phút.`
  - `Quá nhiều yêu cầu làm mới token. Vui lòng thử lại sau 1 giờ.`
- **Loại:** Static API response.
- **Vấn đề:** Báo cáo trước mới nêu một phần limiter. Toàn bộ limiter này trả tiếng Việt cố định; middleware không resolve `req.lang` và các luồng liên quan gồm login, reset password, order, payment, cart và refresh token.
- **Ảnh hưởng:** Người dùng locale khác luôn nhận tiếng Việt; frontend cũng không có code lỗi ổn định để tự dịch.
- **Hướng xử lý:** Dùng custom handler trả `code` (ví dụ `RATE_LIMIT_ORDER_CREATE`) và thời lượng retry; controller/UI resolve message theo locale. Không dùng literal trong config `message`.

### B2. Đồng bộ dữ liệu địa điểm trả success/error không theo locale — Trung bình

- **Vị trí:** `online-store-backend/src/controllers/shippingProviderController.js:439-452`.
- **Literal:** `Location data synced successfully`; nhánh lỗi chuyển thẳng `error.message`.
- **Loại:** Static success response và dynamic leaked error.
- **Vấn đề:** Endpoint thao tác dữ liệu location trả message tiếng Anh cố định khi thành công và có thể trả nguyên văn lỗi hệ thống/provider khi thất bại.
- **Ảnh hưởng:** Admin UI hoặc consumer khác không thể hiển thị nhất quán, đồng thời raw error có thể không phù hợp để hiện cho người dùng.
- **Hướng xử lý:** Trả `code`/số liệu sync trong API; localized message resolve theo `req.lang`. Giữ chi tiết lỗi ở log server, không đưa `error.message` trực tiếp ra response.

### B3. Debug payment status có fallback/hint tiếng Anh — Thấp

- **Vị trí:** `online-store-backend/src/routes/paymentRoutes.js:73-88,105-110`.
- **Literal:** `✅ SET`, `❌ NOT SET`, `❌ No payment gateways configured`, `If no gateways are configured, check environment variables in PaymentService.js`, `Example: { "orderId": "..." }`.
- **Loại:** Static debug response.
- **Vấn đề:** Endpoint đã lấy `paymentLang` và dịch một phần `status`, nhưng fallback status và `hint` vẫn hard-code. Kết quả là cùng một JSON trộn nội dung dịch/chưa dịch.
- **Ảnh hưởng:** Nếu debug/status được hiển thị trong admin UI, người dùng locale khác thấy tiếng Anh; ký hiệu trạng thái cũng đang gắn cứng vào chuỗi kỹ thuật.
- **Hướng xử lý:** Dùng key cho status/hint hoặc xác định endpoint là internal-only và không render trực tiếp. Giữ giá trị trạng thái dạng boolean/code, để UI tự biểu diễn.

### B4. Các endpoint payment test còn nhiều response/hint không dịch — Thấp

- **Vị trí:** `online-store-backend/src/routes/paymentRoutes.js:212-213,346,369-370,413-414,499-514,625-627,665-682,718`.
- **Literal:** `Complete flow test finished`, `No products found. Please seed database first (npm run seed)`, `Signature test successful`, `No unpaid orders found. Create one first.`, `Webhook test completed`, `Webhook test failed`, `Test webhook payload generated`, cùng các `hint` như `Copy orderId ...`, `Run: npm run seed`.
- **Loại:** Static debug/test response; một vài nhánh ghép lỗi động qua `error.message`.
- **Vấn đề:** Báo cáo trước chỉ nêu nhóm test endpoint tổng quát. Rà soát lại cho thấy nhiều literal success/error/hint cụ thể vẫn không đi qua `getMessage(paymentLang, ...)`, dù file đã dùng cơ chế này ở các nhánh khác.
- **Ảnh hưởng:** Các công cụ admin/test consumer nhận JSON trộn ngôn ngữ và có thể lệ thuộc text lỗi.
- **Hướng xử lý:** Nếu endpoint còn được expose ngoài CLI nội bộ, trả `code`, `details` cấu trúc và i18n toàn bộ `message`/`hint`; nếu chỉ là dev tool, chặn môi trường và không dùng response này cho UI production.

### B5. Static-file status trả câu tiếng Anh cố định — Thấp

- **Vị trí:** `online-store-backend/src/app.js:478-488`.
- **Literal:** `Static files status`.
- **Loại:** Static status response.
- **Vấn đề:** Application root/health API đã có cơ chế `getMessage(lang, 'api.backendRunning')`, nhưng endpoint status này bypass i18n.
- **Ảnh hưởng:** Công cụ quản trị hoặc client gọi trực tiếp endpoint thấy ngôn ngữ không nhất quán.
- **Hướng xử lý:** Nếu endpoint hiển thị cho người dùng, dùng key i18n hoặc trả status code thuần dữ liệu; nếu là debug-only, giới hạn rõ quyền truy cập và không coi `message` là UI copy.

---

## C. Quy tắc xử lý chung

1. API nên trả tối thiểu `{ code, params }`; `message` chỉ là bản trình bày theo locale, không phải contract để frontend parse.
2. Không viết fallback literal sau `t(...)` trong JSX. Key thiếu phải được phát hiện ở kiểm thử/linter hoặc fallback qua locale mặc định trong kho bản dịch.
3. Không đưa `error.message` từ provider/hệ thống thẳng vào response UI. Log chi tiết ở server và trả code đã chuẩn hóa cho client.
4. Với debug/test endpoint còn có UI admin, tách trạng thái dữ liệu (`configured: false`, `reasonCode`) khỏi copy hiển thị, để frontend tự dịch.

## Cách kiểm chứng sau khi sửa

- Render `BannerTranslationManager` ở ít nhất `vi`, `en` và một locale khác; kiểm tra empty state, coverage và danh sách ngôn ngữ thiếu.
- Ép lỗi signature/upload Cloudinary, tạo review thất bại và lỗi checkout; xác nhận UI map từ `code`, không dùng `Error.message.includes(...)`.
- Vượt từng limiter: login, reset password, create order, payment, cart và refresh token; xác nhận `code` nhất quán và message theo `Accept-Language`/`req.lang`.
- Gọi các payment debug endpoint và sync location ở nhiều locale; xác nhận không còn literal/hint tiếng Anh hoặc raw `error.message` trong JSON user-facing.

---

## Tiến độ triển khai

### Đã hoàn tất

- Checkout không còn phân tích lỗi bằng `error.message.includes(...)`; frontend map lỗi theo mã ổn định.
- Error API có trường `code`; các lỗi tạo đơn chính đã có mã như `ORDER_NO_ITEMS`, `ORDER_INSUFFICIENT_STOCK`, `ORDER_CURRENCY_REQUIRED`, `ORDER_CURRENCY_NOT_FOUND` và `ORDER_RATES_UNAVAILABLE`.
- Rate-limit trả response có mã lỗi, thông báo theo locale và thời gian thử lại.
- Validation middleware trả thông báo qua hệ thống i18n và mã `VALIDATION_FAILED`.
- Các nhánh lỗi currency còn lại trong `orderController` đã dùng contract mã lỗi và `getMessage()`: `ORDER_RATES_UNAVAILABLE`, `ORDER_PRODUCT_CURRENCY_INVALID`, `ORDER_COUPON_CURRENCY_INVALID`; giữ nguyên HTTP `503`, `422`, `400` tương ứng.
- Đã kiểm tra cú pháp `orderController.js` và `git diff --check`: đạt.
- Đã xóa helper phân quyền không sử dụng chứa literal tiếng Anh; `RoleBadge` tiếp tục dùng key dịch cho cả nhãn và tooltip.

### Còn lại

- Chuẩn hóa các controller/service payment, shipment, translation, user và currency chưa dùng `getMessage()`.
- Hoàn thiện i18n cho email fallback, admin UI, banner translation và import/export.
- Thay các lỗi provider/raw `error.message` bằng `code` và `params` ở toàn bộ API.
- Chạy đầy đủ backend test và frontend build sau khi môi trường cài đủ dependencies (`dotenv`, `next`).

## Cập nhật kiểm thử gần nhất

- Đã chạy `node --check` cho `validationMiddleware.js` và `rateLimitMiddleware.js`: **đạt**.
- Đã chạy `npm test` tại `online-store-frontend`: **10/10 kiểm tra đạt**.
- Chưa thể chạy `npm run build` và `npm run check:emoji` tại frontend vì môi trường chưa có dependency đã khai báo: lệnh báo thiếu lần lượt module `next` và `typescript`.
- Không cài hoặc thay đổi dependency chỉ để vượt kiểm tra; cần cài đúng dependencies của frontend trước khi xác minh build và kiểm tra emoji.
