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
- Việc giảm số request sản phẩm theo category vẫn là hướng tối ưu tiếp theo nếu homepage tiếp tục nặng.

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

### Hướng khắc phục

- Thống nhất contract giữa cache reader và writer.
- Phân biệt rõ bản dịch đã tạo, bản dịch chờ duyệt và bản dịch đã approved.
- Thêm cơ chế reservation hoặc upsert atomic theo `hashKey` để chống hai request cùng dịch một text.

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

### Hướng khắc phục

- Khi nhận 429, đọc `Retry-After` và ngừng retry cho đến khi hết thời gian chờ.
- Bảo đảm chỉ có một luồng xử lý unauthorized/refresh trên toàn bộ tab hiện tại.
- Không gọi refresh lại nếu refresh request trước đó đã thất bại và phiên đã bị đánh dấu unauthorized.
- Kiểm tra lại key theo IP khi chạy sau proxy/tunnel để tránh nhiều client dùng chung một bucket không mong muốn.

## 5. Background translation khi thêm ngôn ngữ

### Biểu hiện

Sau khi tạo ngôn ngữ, request tạo language đã trả response nhưng log Cloudflare AI vẫn tiếp tục chạy.

### Nguyên nhân đã xác định

Backend dùng background job sau `POST /api/languages`:

- Phase 1 clone và dịch static UI strings.
- Phase 2 dịch sản phẩm, bao gồm tên, mô tả và spec.
- Phase 3 cập nhật trạng thái ngôn ngữ thành `isReady=true`.

Job chạy sau khi response đã trả về nên việc tiếp tục xuất hiện log không có nghĩa request HTTP đang bị treo.

### Lưu ý

- Startup seeder static hiện chỉ đọc JSON và upsert database; bản thân bước seed này không gọi Cloudflare AI.
- Log `All 9 languages ready` chỉ cho biết các language record đã sẵn sàng, không khẳng định toàn bộ dynamic content đã được dịch.
- Nếu tiến trình backend restart giữa background job, các tác vụ đang chạy có thể bị gián đoạn và cần cơ chế job bền vững để tiếp tục an toàn.

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

Nếu Flash Sale cần áp dụng cho mọi danh mục, cần lấy và lọc toàn bộ sản phẩm có deal đang hoạt động, thay vì giới hạn theo hai category laptop. Nên giữ section có trạng thái rỗng hoặc thông báo phù hợp nếu yêu cầu giao diện luôn hiển thị tiêu đề Flash Sale.

## 7. Kiểm thử hiện tại

- Đã kiểm tra cú pháp file backend liên quan đến spec-key translation.
- Đã kiểm tra diff không có lỗi whitespace.
- Frontend build và backend test đã được khởi chạy nhưng bị dừng thủ công trước khi hoàn tất; cần chạy lại riêng để có kết quả đầy đủ.
