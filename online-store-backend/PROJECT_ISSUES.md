# Các vấn đề đã ghi nhận trong dự án

Tài liệu này ghi lại các lỗi và hiện tượng đã gặp khi chạy online store. Không lưu secret, token hoặc địa chỉ IP cụ thể.

## 1. Homepage có cảm giác reload hoặc tải lại liên tục

### Biểu hiện

- Trang chủ có cảm giác tự F5 hoặc liên tục cập nhật nội dung.
- Network/log xuất hiện nhiều request lấy sản phẩm, banner và bản dịch.
- Không tìm thấy lệnh `window.location.reload()` hoặc `router.reload()` trong luồng trang chủ.

### Nguyên nhân đã xác định

- Homepage gọi nhiều request sản phẩm: danh sách chính, nhóm deal và từng category.
- Hai `useEffect` trước đây cùng fetch homepage hero banner khi component mount.
- React Strict Mode trong môi trường development có thể mount/cleanup/mount lại effect để phát hiện side effect.
- Thay đổi locale, currency hoặc danh sách category làm effect tải sản phẩm chạy lại.

### Trạng thái xử lý

- Đã gộp hai effect fetch banner thành một effect, tránh request banner trùng khi mount.
- Đã gộp việc lấy Flash Sale thành một request active-deal toàn hệ thống và chạy song song với request sản phẩm chính.
- Homepage vẫn có request riêng cho từng category và từng slot banner; đây là tối ưu tiếp theo nếu cần giảm fan-out sâu hơn.

## 2. Homepage vô tình kích hoạt Cloudflare AI translation

### Biểu hiện

Log có các request dịch tuần tự sang 8 ngôn ngữ phụ, ví dụ tổng số request tăng từ `1` đến `32`.

### Nguyên nhân đã xác định

- Khi backend đọc sản phẩm, `localizeProductSpecFields()` xử lý các spec key.
- Spec key chưa có cache được đăng ký và cơ chế `warmDynamicTranslation()` tự gọi Cloudflare AI cho từng ngôn ngữ.
- Đây là hoạt động trong đường đọc storefront, nên chỉ cần mở hoặc tải lại homepage cũng có thể phát sinh AI request.
- Cache attempt của cơ chế này nằm trong memory process; khi backend restart, trạng thái attempt bị mất.

### Trạng thái xử lý

- Dynamic spec-key translation đã chuyển sang chế độ opt-in.
- Đã bổ sung import/cache bền vững cho `SpecKeyTranslationCache`; khi bật opt-in, bản dịch hợp lệ được upsert vào database.
- Mặc định storefront không tự gọi Cloudflare AI. Chỉ bật khi cấu hình rõ:

```text
ENABLE_DYNAMIC_SPEC_KEY_TRANSLATION=true
```

- Các nhãn tĩnh và fallback vẫn được dùng khi dynamic translation không bật.

## 3. Cache bản dịch động không thống nhất trạng thái

### Biểu hiện

Một text có thể bị gọi Cloudflare AI lại dù đã có bản ghi translation cache.

### Nguyên nhân cần xử lý

- Endpoint `/api/translations/translate` đọc cache với điều kiện `status=success` và `qualityStatus=approved`.
- Khi ghi bản dịch thành công, bản ghi không truyền `qualityStatus`, nên schema có thể để mặc định `pending`.
- Lần request sau không chấp nhận bản ghi `pending`, dẫn đến cache miss và gọi AI lại.
- Kiểu đọc/ghi này cũng có race condition nếu hai request giống nhau chạy đồng thời.

### Trạng thái xử lý

- Đã thống nhất writer với reader: bản dịch thành công được ghi `status=success` và `qualityStatus=approved`.
- Hash cache đã bao gồm `sourceLang`, tránh dùng nhầm bản dịch khi cùng text/target nhưng khác ngôn ngữ nguồn.
- Đã chuyển ghi cache sang upsert theo `hashKey` và thêm promise lock trong cùng process để tránh các request trùng gọi AI đồng thời; nhiều instance vẫn cần reservation/distributed lock dùng chung nếu muốn loại bỏ hoàn toàn race.
- Endpoint vẫn cần được cân nhắc bảo vệ quyền truy cập nếu không muốn client public chủ động dùng `useCache=false`.

## 4. `429 RATE_LIMIT_TOKEN_REFRESH` ở `/api/users/refresh`

### Biểu hiện

Client nhận response:

```text
HTTP 429
code: RATE_LIMIT_TOKEN_REFRESH
message: Quá nhiều yêu cầu
retryAfter: khoảng 3102–3103 giây
```

### Nguyên nhân đã xác định

- Backend giới hạn refresh token ở mức 30 lần mỗi giờ theo user hoặc IP.
- Frontend đã gom các request refresh đồng thời trong một promise, nhưng nhiều tab, nhiều request sau khi access token hết hạn hoặc một client retry liên tục vẫn có thể vượt giới hạn.
- Đây là rate limit phía backend, không phải lỗi cache trình duyệt.

### Ảnh hưởng

- Refresh token thất bại.
- Frontend xóa access token trong memory và chuyển người dùng về trang đăng nhập.
- Nếu một luồng request tiếp tục dùng token hết hạn, có thể tạo cảm giác ứng dụng bị chuyển trang hoặc tải lại liên tục.

### Trạng thái xử lý

- Frontend đã đọc `Retry-After` khi refresh nhận 429, tạm ngừng refresh trong thời gian server yêu cầu và không logout nhầm do rate limit.
- Trong cùng tab, frontend tiếp tục gom các refresh đồng thời thành một promise.
- Rate limiter hiện ưu tiên user id giải mã từ refresh cookie, fallback về IP khi chưa có cookie; race giữa nhiều tab, shared store cho nhiều backend instance và cơ chế rotation grace period vẫn chưa được xử lý triệt để.
- Kiểm tra lại IP fallback khi chạy sau proxy/tunnel để tránh nhiều client dùng chung một bucket không mong muốn.

## 5. Background translation khi thêm ngôn ngữ

### Biểu hiện

Sau khi tạo ngôn ngữ, request tạo language đã trả response nhưng log Cloudflare AI vẫn tiếp tục chạy.

### Nguyên nhân đã xác định

Backend dùng background job sau `POST /api/languages`:

- Phase 1 clone và dịch static UI strings.
- Phase 2 dịch sản phẩm, bao gồm tên, mô tả và spec.
- Phase 3 cập nhật trạng thái ngôn ngữ thành `isReady=true`.

Job chạy sau khi response đã trả về nên việc tiếp tục xuất hiện log không có nghĩa request HTTP đang bị treo.

### Trạng thái xử lý và lưu ý

- Startup seeder static hiện chỉ đọc JSON và upsert database; bản thân bước seed này không gọi Cloudflare AI.
- Phase 1/2 thất bại hoặc có field lỗi/rate limit sẽ không còn được đánh dấu `isReady=true`; language cũng chỉ được kích hoạt sau khi hoàn tất.
- Language seeder không còn tự chuyển language đang setup dở thành ready sau restart.
- Log `All 9 languages ready` chỉ cho biết các language record đã sẵn sàng, không khẳng định toàn bộ dynamic content đã được dịch.
- Job vẫn thực thi trong process, nhưng khi backend restart startup sẽ tìm các language có `isReady=false`, đã có `setupStartedAt` và chưa hoàn tất để tự xếp lại job.
- Job setup dùng distributed lock theo language để tránh nhiều backend instance xử lý trùng khi Redis khả dụng; nếu Redis không khả dụng sẽ dùng fallback memory trong instance hiện tại.
- Phase 2 hiện đã đồng bộ các bản ghi dịch approved sang `ProductCatalogTranslationCache` và chỉ đánh dấu language ready sau bước này thành công.

## 6. Flash Sale không hiển thị trên homepage

### Biểu hiện

- Khu vực bên dưới nút `Xem tất cả sản phẩm` không có section Flash Sale.
- Homepage chuyển trực tiếp xuống nhóm tiện ích như giao hàng, bảo hành, hỗ trợ và thanh toán.
- Không có lỗi do ảnh upload; section không xuất hiện vì điều kiện render không được thỏa mãn.

### Nguyên nhân đã xác định

Section chỉ được render khi danh sách deal có sản phẩm:

```tsx
{dealProducts.length > 0 && (
  <section>{/* Flash Sale */}</section>
)}
```

Danh sách `dealProducts` hiện được xây dựng từ các sản phẩm thuộc nhóm `Laptop Gaming` và `Laptop Văn phòng`, sau đó chỉ giữ sản phẩm có deal đang hoạt động:

- Discount lớn hơn 0.
- Chưa quá thời gian kết thúc.
- Được backend xác nhận đủ điều kiện hiển thị storefront.

Vì vậy sản phẩm có deal trong các nhóm `Bàn phím`, `Chuột` hoặc `Tai nghe` hiện không được đưa vào Flash Sale. Sản phẩm laptop cũng có thể bị loại nếu deal hết hạn hoặc chưa đủ dữ liệu bản dịch theo điều kiện backend.

### Hướng khắc phục

Đã chuyển homepage sang request active deal trên toàn bộ danh mục. Backend lọc `deal.discount > 0` và `deal.endTime` hợp lệ trước khi giới hạn candidate/phân trang; endpoint này không còn ép `featured=true`. Section vẫn có thể ẩn khi không có active deal; nếu yêu cầu giao diện luôn hiển thị tiêu đề Flash Sale thì cần thêm empty state.

## 7. Kiểm thử hiện tại

- Đã kiểm tra cú pháp các file backend liên quan đến language setup, translation cache, rate limit và product translation.
- Đã kiểm tra diff không có lỗi whitespace.
- Backend suite `i18n` đã chạy thành công: 4 test files, gồm `test-languages-flow.js`, `test-translation-api.js`, `translationProductCache.test.js` (12 tests) và `specKeyTranslationCache.test.js` (6 tests).
- Frontend production build chưa chạy theo yêu cầu; chưa có thay đổi frontend trong lần xử lý này.
