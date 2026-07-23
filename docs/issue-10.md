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
