# Kế hoạch xử lý lỗi trang chi tiết sản phẩm

## Mục tiêu

Khôi phục trang:

`/product/6a8ddbbbc9c4e6879f6c9f3674?tab=description`

Trang cần hiển thị đúng sản phẩm hoặc thông báo lỗi chính xác, không phát sinh request dịch thừa và không lặp vô hạn việc refresh token.

## Hiện trạng và bằng chứng

- Request chi tiết sản phẩm trả `404`:
  - `/api/products/6a8ddbbbc9c4e6879f6c9f3674?lang=vi&locale=vi-VN&currencyCode=VND`
- Request translation trả `400` với mã `TRANSLATION_PRODUCT_TARGET_INVALID`:
  - `/api/products/6a8ddbbbc9c4e6879f6c9f3674/translations?lang=vi`
- Request `/api/users/refresh` lặp lại và nhận `429 RATE_LIMIT_TOKEN_REFRESH`.
- UI hiện rơi vào nhánh lỗi `Không tìm thấy sản phẩm` / `Lỗi tải sản phẩm` trong `src/pages/product/[id].tsx`.
- Route sản phẩm dùng dynamic segment `[id]`; request được thực hiện trong `src/pages/product/[id].tsx:134-204`.
- API client tạo URL chi tiết sản phẩm tại `src/lib/api.ts:717-733`.
- Hook dịch sản phẩm được khởi tạo tại `src/pages/product/[id].tsx:78` và gọi endpoint tại `src/hooks/useProductTranslation.ts:13-34`.
- Backend xác thực product ID và ngôn ngữ trong `online-store-backend/src/controllers/translationController.js:167-181`.
- Backend định nghĩa route chi tiết và translation tại `online-store-backend/src/routes/productRoutes.js:115-148`.

## Phạm vi điều tra và triển khai dự kiến

### 1. Xác minh nguyên nhân 404 của sản phẩm

- Lấy một ID sản phẩm chắc chắn đang tồn tại từ API danh sách sản phẩm và đối chiếu với ID trong URL.
- Kiểm tra sản phẩm có bị soft-delete, không thuộc storefront visibility, hoặc thuộc database/environment khác hay không.
- Đối chiếu cấu hình proxy frontend với backend đang phục vụ request để loại trừ việc preview trỏ nhầm môi trường.
- Kiểm tra response body của endpoint 404 để phân biệt ID sai, sản phẩm không tồn tại và sản phẩm bị ẩn.
- Không biến lỗi 404 thành dữ liệu giả hoặc tự đổi sang một sản phẩm khác.

### 2. Đồng bộ vòng đời request ở trang sản phẩm

- Giữ điều kiện chờ `router.isReady`, `id` và trạng thái hydration trước khi gọi API.
- Chỉ cho phép request translation chạy khi product ID hợp lệ và sản phẩm gốc đã tải thành công.
- Khi request sản phẩm gốc trả 404, hủy/bỏ qua translation và related-products/reviews của request đó.
- Đảm bảo chuyển giữa các ID sản phẩm không để response cũ ghi đè state mới.
- Giữ nguyên query `tab` hợp lệ để người dùng vẫn quay lại tab mô tả sau khi dữ liệu tải thành công.

### 3. Xử lý chuẩn hóa ngôn ngữ cho translation

- Đối chiếu `lang=vi`, `req.lang` và danh sách mã ngôn ngữ được backend chấp nhận.
- Xác định vì sao request có `lang=vi` lại đi vào nhánh `product_target_invalid` thay vì trả translation hoặc `404 translation not available`.
- Sửa tại lớp tạo request hoặc middleware ngôn ngữ nếu có sai lệch giữa mã locale dạng `vi`, `vi-VN` và mã ngôn ngữ nội bộ.
- Không bỏ qua toàn bộ lỗi translation một cách im lặng nếu đó là lỗi cấu hình hoặc lỗi endpoint; chỉ fallback về dữ liệu nguồn khi product gốc đã tồn tại và fallback đó được xác định là hợp lệ.

### 4. Chặn vòng lặp refresh token và giảm nhiễu 429

- Kiểm tra quan hệ giữa `AuthContext` khởi tạo phiên tại `src/lib/context/AuthContext.tsx:54-101` và cơ chế tự refresh tại `src/lib/api.ts:175-239`, `src/lib/api.ts:395-458`.
- Xác định request nào đang nhận `401` liên tục và vì sao refresh token không được xác lập hoặc bị gọi lại sau khi đã rate-limit.
- Giữ cơ chế chống refresh đồng thời hiện có, đồng thời bảo đảm trạng thái rate-limit khiến các request tiếp theo dừng retry trong khoảng `Retry-After`.
- Không refresh token cho request public hoặc biến lỗi xác thực thành lỗi tải sản phẩm nếu request sản phẩm không yêu cầu đăng nhập.
- Khi phiên hết hạn thật sự, chuyển sang trạng thái guest một lần và tránh điều hướng/dispatch logout lặp lại.

### 5. Cải thiện trạng thái lỗi hiển thị

- Phân biệt tối thiểu các trạng thái: đang tải, sản phẩm không tồn tại/không còn hiển thị, lỗi mạng/backend.
- Giữ nút quay lại danh sách sản phẩm như hiện tại.
- Không hiển thị lỗi translation hoặc lỗi refresh token như nguyên nhân chính khi sản phẩm gốc đã xác định là 404.
- Giữ nguyên style hiện có của trang và các breakpoint responsive.

## Kiểm thử sau khi triển khai

1. Mở trực tiếp một product ID hợp lệ với `tab=description`; xác nhận tên, ảnh, mô tả, thông số và translation hiển thị.
2. Mở ID không tồn tại và ID đã soft-delete; xác nhận UI báo không tìm thấy sản phẩm, không gọi translation lặp lại.
3. Refresh trực tiếp URL dynamic route và chuyển qua lại giữa các tab.
4. Kiểm tra ngôn ngữ `vi` và một ngôn ngữ khác được hỗ trợ.
5. Kiểm tra phiên guest, phiên hợp lệ và phiên hết hạn; xác nhận không có chuỗi `/users/refresh` 429 lặp lại.
6. Kiểm tra request bị hủy khi rời trang hoặc đổi sang sản phẩm khác nhanh.
7. Chạy kiểm tra TypeScript/build và kiểm tra log dev server sau khi hoàn tất.

## Tiêu chí hoàn thành

- Product ID hợp lệ tải được từ đúng backend/environment.
- Product ID không hợp lệ cho trạng thái lỗi rõ ràng, không tạo request translation thừa.
- Translation không còn trả lỗi 400 do sai chuẩn hóa ngôn ngữ hoặc ID chưa sẵn sàng.
- Không còn vòng lặp refresh token gây `429` khi người dùng chỉ xem trang sản phẩm.
- Không thay đổi ngoài phạm vi luồng chi tiết sản phẩm, translation và auth recovery.
