# Tổng kết các vấn đề đã xử lý

Tài liệu này tổng hợp những thay đổi đã áp dụng và các vấn đề đã được chẩn đoán trong quá trình làm việc trên Laptop Store. Những mục chỉ mới được phân tích sẽ được ghi rõ, không xem là đã khắc phục hoàn toàn.

## Thay đổi đã áp dụng

### Logo và favicon

- Cắt bỏ phần lề trắng thừa của logo, tạo asset `online-store-frontend/public/assets/branding/logo-cropped.png` để logo hiển thị lớn và rõ hơn.
- Cập nhật logo ở header, footer và trang đăng nhập sang asset đã cắt; giữ cách co giãn theo kích thước màn hình.
- Thay favicon của website bằng logo Laptop Store. Favicon của website khác biểu tượng trong giao diện Builder Visual Editor.

### Responsive trang About

- Điều chỉnh hero của trang About từ chiều cao cố định theo viewport sang chiều cao tối thiểu có padding, phù hợp hơn với nội dung và màn hình khác nhau.

### Chuẩn hóa một số Tailwind utility

- Thay các giá trị tùy ý bằng utility chuẩn khi có giá trị tương đương, ví dụ `min-w-[900px]` thành `min-w-225`.
- Giữ lại các biểu thức `calc()`, selector hoặc giá trị đặc thù khi không có utility chuẩn tương đương.
- Typecheck frontend đã chạy thành công ở lần kiểm tra trước. Không chạy `npm run build`.

### Hoàn tác thay đổi ngoài ý muốn ở hero trang chủ

- Chiều cao hero trang chủ từng bị thay đổi do hiểu nhầm nhận xét “dài quá” là nói về giao diện.
- Thay đổi đó đã được hoàn tác; class ban đầu tại `online-store-frontend/src/components/HomeContent.tsx` được kiểm tra lại.

## Vấn đề backend và vận hành đã được chẩn đoán

### Cloudflare Workers AI và bản dịch

- Xác định HTTP `429` là giới hạn từ Workers AI tại thời điểm gọi; token còn hoạt động và có quyền đọc danh sách model không chứng minh quota Neurons còn lại.
- Kiểm tra 13 cấu hình: cả 13 token đều hoạt động và đọc được danh sách model; có 12 Account ID khác nhau vì slot 10 và 11 dùng cùng một account.
- Endpoint đã kiểm tra không cung cấp số Neurons còn lại. Cần xem usage/quota trong Cloudflare Dashboard; không có quota chính xác nào được xác nhận qua lệnh kiểm tra token.
- Log có nhiều lỗi rate limit và có cả lỗi phản hồi AI không hợp lệ (`CLOUDFLARE_RESPONSE_INVALID`, thiếu `result.response`); không phải mọi lỗi đều là 429.
- Các bản dịch hết retry được ghi nhận là `failed_rate_limit` hoặc `failed_error`, không tự động được chạy lại ngay. Có luồng retry riêng.
- Con số khoảng 4.367/4.704 bản ghi cần chú ý là trạng thái được báo trong log, không tự nó chứng minh có bản ghi trùng hoặc xác nhận số sản phẩm duy nhất còn thiếu.
- Ước tính 0,5–1 triệu Neurons cho khoảng 600 sản phẩm chỉ là khoảng dự trù sơ bộ cho phần dịch sản phẩm. Với 8 ngôn ngữ đích, có khoảng 4.800 cặp sản phẩm-ngôn ngữ trước khi tính độ dài và số trường. Đây không phải số đo quota thực tế và chưa bao gồm review, category hay nội dung khác.

### Giới hạn upload R2

- Phân biệt được giới hạn do cấu hình ứng dụng (`R2_MAX_UPLOAD_COUNT`, `R2_MAX_UPLOAD_BYTES`) với usage/quota hiển thị trong Cloudflare Dashboard.
- Giá trị được người dùng cung cấp là 5.000 lượt upload và 8 GiB; không có bằng chứng trong phiên rằng giới hạn đã được tăng hoặc các logo thương hiệu đã được upload lên R2.

### Seeder, crawler và bảo vệ dữ liệu

- Xác định `npm run seed` chạy chế độ đầy đủ, nhưng product pipeline chỉ bỏ qua crawler khi có điều kiện phù hợp như `--skip-scrape`, dữ liệu đầu vào chỉ định hoặc file sản phẩm hiện có hợp lệ; có thể gọi crawler khi không tìm được file phù hợp.
- Lượt chạy được xem trong log đã thực sự bắt đầu `scrape:all`. Để chạy seed mà không scrape lại, đã xác định tùy chọn `npm run seed -- --skip-scrape`.
- Product import dùng kiểu upsert nên không đồng nghĩa với xóa toàn bộ sản phẩm. Tuy nhiên, review seeder có gọi `Review.deleteMany({})` trước khi tạo lại review.
- Kiểm tra `npm run clear` cho thấy lệnh này xóa dữ liệu các collection MongoDB, index, tài nguyên R2 của dự án và file upload cục bộ. Đã khuyến nghị không chạy lệnh này để xử lý lỗi dịch hoặc rate limit.

### Cloudflared tunnel

- Chẩn đoán `spawn UNKNOWN` là do `cloudflared.exe` trong thư mục làm việc thực chất là Git LFS pointer dạng văn bản, không phải file thực thi.
- Người dùng đã tải binary Windows chính thức thay thế. Chưa có kết quả `--version` hoặc xác nhận `npm run tunnel` chạy thành công, nên chưa ghi nhận tunnel đã được khắc phục hoàn toàn.

## Những việc chưa hoàn tất hoặc chưa xác nhận

- Chưa xác nhận quota Neurons còn lại của các tài khoản Cloudflare; trạng thái token/API không thay thế được kiểm tra usage.
- Chưa xác nhận kết quả cuối cùng của lượt seed thứ ba hoặc số bản dịch được hoàn tất sau lượt đó.
- Chưa xác nhận tunnel hoạt động sau khi tải binary cloudflared.
- Chưa thực hiện upload logo thương hiệu lên R2 hoặc cập nhật dữ liệu thương hiệu.
- Chưa xác nhận giới hạn `R2_MAX_UPLOAD_COUNT` đã được thay đổi.
- Chưa có ảnh chụp xác nhận trực quan cuối cùng cho các thay đổi responsive.

## Phạm vi an toàn

- Không ghi token, API key hoặc giá trị bí mật vào tài liệu này.
- Không chạy `npm run clear`.
- Không chạy `npm run build`.
- Các nhận định về quota và số lượng bản dịch được giữ ở mức phù hợp với log đã xem; không coi số liệu ước tính là kết quả đo.
