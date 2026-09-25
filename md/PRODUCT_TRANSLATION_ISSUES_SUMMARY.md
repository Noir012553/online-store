# Tổng hợp sự cố dịch sản phẩm và trạng thái xử lý

Tài liệu này ghi lại các vấn đề đã trao đổi trong phiên, thay đổi liên quan trong code và các giới hạn chưa được xác minh bằng chạy thật. Không có yêu cầu chạy seed, gọi dịch Cloudflare thật, triển khai production hoặc chạy build trong phần kiểm tra được ghi lại ở đây.

## 1. Trạng thái bản dịch hiển thị mâu thuẫn

### Triệu chứng

UI từng hiển thị đồng thời trạng thái `Approved`, có chỉnh sửa thủ công và có validation errors.

### Xử lý trong code

- Validator áp dụng danh sách lỗi không chặn khi tạo `validationErrors`; các lỗi còn lại ngăn trạng thái `approved`.
- Các test liên quan dùng cấu hình validation, enum schema và language inventory thay vì cố định tên sản phẩm/điểm số.
- Badge chỉnh sửa thủ công được điều khiển bởi `manualFields`. Trạng thái này được giữ lại có chủ đích khi retranslate và các field đó bị bỏ qua, nên badge có thể vẫn còn sau khi dịch lại.

### Còn cần xác minh

Nếu lần retranslate mới vẫn trả `pending` và validation errors, đó có thể là kết quả validator mới chứ không phải state UI cũ. Cần đối chiếu mã lỗi cụ thể với bản dịch API trả về.

## 2. `npm run retranslate` báo không có bản dịch

### Nguyên nhân

Phiên bản CLI ban đầu chỉ truy vấn `LiveTranslationCache`, yêu cầu điểm thấp hoặc `validationErrors` không rỗng. Nó không thấy lỗi chỉ nằm trong `ProductCatalogTranslationCache`; đồng thời các record có status retry nhưng chưa có quality score/validation errors cũng có thể bị bỏ qua.

### Thay đổi được thực hiện

- CLI được mở rộng để tìm record lỗi/retry, chất lượng cần dịch lại, điểm dưới ngưỡng hoặc có validation errors ở cả `LiveTranslationCache` và `ProductCatalogTranslationCache`.
- Catalog entry được dịch qua cùng luồng dịch sản phẩm dùng cho thao tác admin, giữ `manualFields`, và chạy tuần tự trong CLI.
- Kết quả dry-run hiển thị riêng số record trong product catalog và field cache.
- Dịch sản phẩm vẫn dùng Cloudflare làm provider cuối; LibreTranslate chỉ có thể dùng làm bản nháp nếu được bật. CLI dừng khi nhận diện quota/rate limit, báo số record còn lại và kết thúc lỗi.

### Phạm vi còn giới hạn

`retranslate` xử lý record lỗi/incomplete đã tồn tại trong các cache; nó không tự tạo ma trận bản dịch còn thiếu cho mọi sản phẩm/ngôn ngữ. Nếu dry-run vẫn báo 0 ở cả hai collection, cần dùng luồng tạo/backfill bản dịch phù hợp thay vì kỳ vọng retranslate tự tạo record mới.

## 3. Trạng thái sau khi bấm “Dịch lại” và sau khi refresh

### Hook/state frontend

Trong `online-store-frontend/src/pages/admin/translationsDynamic.tsx`:

- Sau khi lưu hoặc retranslate, frontend cập nhật state từ response rồi refetch status từ API.
- `statusFetchRequestRef` ngăn response GET cũ ghi đè kết quả mới.
- Toast phân biệt dịch hoàn tất nhưng vẫn còn status/validation issues.

### Ý nghĩa của các badge

- `Có nội dung chỉnh sửa thủ công`: còn `manualFields`; đây là dấu hiệu nội dung được giữ lại, không đồng nghĩa request retranslate thất bại.
- `Đang chờ xử lý` và `Có lỗi kiểm tra`: phản ánh `qualityStatus`/`validationErrors` lưu trong cache nếu API GET sau refresh vẫn trả như vậy. Frontend refetch không thể tự làm các lỗi validation biến mất.
- `technicalDescription`, `descriptionImages` (alt text) và `promotions` được dịch trong luồng sản phẩm; hiện không phải điều kiện trong phép tính `storefrontReady`.

### Còn cần xác minh

Chưa có response body thực tế của POST retranslate và GET status cho cùng product ID/ngôn ngữ. Do đó chưa thể xác định validation code nào còn tồn tại hay liệu request trên máy người dùng đang chạy đúng bản backend/frontend đã cập nhật.

## 4. Lỗi `refreshStorefrontReadiness is not defined`

### Nguyên nhân và sửa

Khi tách logic dịch lại sản phẩm sang service dùng chung, import `refreshStorefrontReadiness` bị bỏ nhầm dù `saveProductTranslation` vẫn gọi hàm này. Import đã được khôi phục trong `online-store-backend/src/controllers/translationController.js`. Syntax check và diff check sau sửa đã qua; chưa có kiểm tra API end-to-end trên máy người dùng.

## 5. Ý nghĩa điều kiện `storefrontReady`

`productController` lọc sản phẩm công khai theo `isDeleted: false` và `storefrontReady: true`; còn có các điều kiện truy vấn khác như featured/deal tùy route.

Readiness hiện yêu cầu:

- Sản phẩm nguồn có `name` và `brand`.
- Với mọi ngôn ngữ được hỗ trợ ngoài ngôn ngữ mặc định, cache có `status: success`, `qualityStatus: approved`, `sourceHash` khớp nguồn hiện tại.
- Bản dịch có `name`/`brand`; `description` nếu mô tả nguồn có nội dung; và đủ các spec có giá trị ở nguồn.

`technicalDescription`, alt text của `descriptionImages` và text trong `promotions` hiện không nằm trong điều kiện này. Đây là policy hiện tại trong code, chưa có quyết định trong phiên về việc có nên đưa chúng vào readiness.

## 6. MongoDB Atlas timeout ở export worker

Log trước đó có `ReplicaSetNoPrimary` và `MongoNetworkTimeoutError` khi kết nối tới host shard Atlas. `EXPORT_JOB_WORKER` poll định kỳ và có thể là nơi ghi lỗi khi topology đang mất primary; log phù hợp với vấn đề khả dụng/kết nối Atlas hoặc mạng hơn là lỗi dịch thuật.

Chưa sửa code cho lỗi này. Cần kiểm tra cluster health, Atlas IP Access List, DNS và outbound port 27017 từ chính máy chạy backend. Không chia sẻ `MONGO_URI` trong log/ticket công khai.

## 7. Kiểm tra đã chạy và giới hạn

- `node --check` cho các file backend đã sửa và `git diff --check` đã qua ở các lượt sửa tương ứng.
- Unit tests không chạy được trong môi trường làm việc vì thiếu `mongoose`; frontend typecheck cũng không khả dụng vì thiếu TypeScript.
- Dev server trong workspace chưa có dev command/proxy được cấu hình nên không xác minh browser được.
- Không chạy `npm run build`, seed, API dịch thật, kiểm tra database từ máy người dùng hoặc thao tác production.

## 8. Các bước xác minh an toàn tiếp theo

1. Trên đúng bản code đã cập nhật, chạy `npm run retranslate -- --dry-run` để xem số record ở hai cache.
2. Khi bấm retranslate trên UI, đối chiếu status/errors/timestamp trong response POST với GET status ngay sau đó và sau refresh.
3. Nếu POST và GET đều trả `pending`, xem chính xác `validationErrors`; xử lý lỗi nội dung/validator thay vì xóa state frontend.
4. Nếu mục tiêu là dịch các cặp sản phẩm/ngôn ngữ hoàn toàn chưa có cache, xác định riêng luồng backfill/generation; không mặc định coi đó là retranslation.
5. Chỉ bổ sung `technicalDescription`, ảnh mô tả và khuyến mãi vào điều kiện `storefrontReady` sau khi xác nhận đây là yêu cầu nghiệp vụ.
