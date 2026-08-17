# Audit: Đồng thời upload và đồng bộ Cloudinary

## Mục tiêu

Đánh giá độ an toàn và nhất quán của luồng upload khi có nhiều người dùng, admin và super-admin thao tác cùng lúc; đặc biệt là trường hợp upload, thay ảnh, xóa ảnh và đồng bộ dữ liệu với Cloudinary.

## Phạm vi đã kiểm tra

- Upload ảnh sản phẩm và banner qua API backend.
- Upload trực tiếp từ trình duyệt lên Cloudinary bằng chữ ký do backend cấp.
- Upload avatar người dùng và ảnh review vào thư mục `uploads` cục bộ.
- Các thao tác cập nhật, xóa mềm, xóa cứng và dọn ảnh Cloudinary.
- Giới hạn tốc độ, giới hạn dung lượng, phân quyền và cơ chế bảo vệ dữ liệu đồng thời.

## Hiện trạng

- Admin và super-admin có thể lấy chữ ký upload và upload trực tiếp từ frontend lên Cloudinary.
- API sản phẩm và banner cũng nhận file qua Multer, giữ file trong bộ nhớ rồi upload sang Cloudinary.
- Avatar người dùng và ảnh review vẫn được ghi vào ổ đĩa cục bộ trong thư mục `uploads`.
- Hệ thống có giới hạn dung lượng 5 MB cho ảnh, rate limit chung 100 request mỗi 15 phút theo IP và limiter upload 30 request mỗi 15 phút theo user đã xác thực hoặc IP cho endpoint cấp chữ ký/xác thực ảnh.
- Product và banner đã bật optimistic concurrency của Mongoose; backend trả lỗi xung đột khi hai admin lưu cùng bản ghi.
- Chưa có transaction MongoDB, distributed lock hoặc hàng đợi bền vững để retry dọn ảnh Cloudinary khi lỗi.

## Rủi ro khi có nhiều người dùng thao tác đồng thời

### 1. Ghi đè dữ liệu khi nhiều quản trị viên sửa cùng một bản ghi

Dù Product và Banner đã bật optimistic concurrency ở Mongoose, cần xác minh mọi endpoint cập nhật đều dùng phiên bản bản ghi đã đọc để phát hiện xung đột. Nếu một luồng cập nhật bỏ qua điều kiện phiên bản, hai admin vẫn có thể cùng đọc rồi lần lượt lưu thay đổi; lần lưu sau sẽ ghi đè thay đổi trước theo cơ chế "last write wins".

Tác động:

- Mất nội dung, cấu hình hoặc ảnh mà admin khác vừa cập nhật.
- Dữ liệu banner và bản dịch có thể không còn khớp với phiên bản mới nhất.

Vị trí liên quan:

- `online-store-backend/src/controllers/productController.js`
- `online-store-backend/src/controllers/bannerController.js:360-465`

### 2. Ảnh cũ bị xóa trước khi thay đổi dữ liệu được lưu thành công

Luồng thay ảnh hiện lưu banner trước rồi mới xóa ảnh cũ; ảnh mới được dọn nếu lưu thất bại. Tuy nhiên, nếu thao tác xóa ảnh cũ thất bại thì chưa có outbox/hàng đợi retry bền vững, nên vẫn có thể phát sinh ảnh mồ côi.

Tác động:

- Ảnh bị mất trên giao diện.
- Phát sinh ảnh mồ côi, tăng chi phí Cloudinary.
- Yêu cầu xóa trùng cùng một `publicId` và kết quả khó dự đoán.

Vị trí liên quan:

- `online-store-backend/src/controllers/bannerController.js:429-441`
- `online-store-backend/src/controllers/bannerController.js:502-518`

### 3. Xóa Cloudinary và xóa dữ liệu không có tính nguyên tử

Xóa cứng banner/sản phẩm thực hiện dọn file Cloudinary và xóa dữ liệu MongoDB thành các bước riêng. Nếu một bước thành công, bước còn lại thất bại hoặc bị đua với yêu cầu khác, Cloudinary và database sẽ không còn đồng bộ.

Tác động:

- Database trỏ đến ảnh không tồn tại.
- Ảnh không còn được tham chiếu nhưng không bị xóa.
- Một admin nhận kết quả thành công trong khi dữ liệu đã bị admin khác thay đổi.

Vị trí liên quan:

- `online-store-backend/src/controllers/bannerController.js:502-518`
- `online-store-backend/src/services/cloudinaryService.js:98-123`

### 4. Endpoint xác thực ảnh tin dữ liệu do trình duyệt gửi lên

`validateUploadedImage` hiện truy vấn Cloudinary để xác minh tài nguyên tồn tại, là image, thuộc thư mục cho phép, giới hạn kích thước/định dạng và URL khớp với `publicId`. Tuy nhiên, chưa có bản ghi upload tạm để chứng minh tài nguyên thuộc đúng tác nhân và mục đích.

Tác động:

- Không có bằng chứng sở hữu tài nguyên khi nhiều admin cùng upload.
- Có thể gắn nhầm hoặc tham chiếu một ảnh Cloudinary khác vào bản ghi.
- Khó dọn các upload dang dở khi request lưu sản phẩm/banner bị hủy hay thất bại.

Vị trí liên quan:

- `online-store-backend/src/controllers/cloudinaryController.js:98-135`
- `online-store-backend/src/services/cloudinaryService.js:179-207`
- `online-store-frontend/src/hooks/useCloudinaryUpload.ts:35-188`

### 5. Limiter upload chưa quản lý quota và tải đồng thời

Endpoint cấp chữ ký và xác thực ảnh đã dùng limiter riêng 30 request/15 phút, với khóa theo user đã xác thực hoặc IP. Tuy vậy, limiter này chưa tách ngưỡng theo loại endpoint/role, chưa quản lý quota Cloudinary và chưa giới hạn số upload đang chạy. Nhiều user hoặc nhiều IP vẫn có thể đồng thời tạo tải lớn lên Cloudinary.

Tác động:

- Một role hoặc endpoint có nhu cầu khác vẫn dùng cùng một ngưỡng, dễ bị chặn nhầm trong đợt thao tác hàng loạt.
- Không kiểm soát được số upload đồng thời, chi phí và quota Cloudinary.
- Khó phân biệt hành vi bất thường với thao tác hợp lệ từ admin/super-admin.

Vị trí liên quan:

- `online-store-backend/src/middleware/rateLimitMiddleware.js:117-124`
- `online-store-backend/src/routes/cloudinaryRoutes.js:14-23`

### 6. Dùng bộ nhớ và thao tác file đồng bộ dưới tải cao

Ảnh sản phẩm/banner qua backend được Multer giữ toàn bộ trong RAM trước khi gửi Cloudinary. Ảnh cục bộ được xóa bằng `fs.unlinkSync`, làm chặn event loop. Với nhiều request cùng lúc, các thao tác này có thể làm backend chậm, hết bộ nhớ hoặc tăng thời gian phản hồi.

Tác động:

- Tăng độ trễ và nguy cơ lỗi upload hàng loạt.
- Một tiến trình backend bị ảnh hưởng sẽ tác động đến các API khác.
- Thư mục `uploads` cục bộ không phù hợp nếu ứng dụng chạy nhiều instance mà không có shared storage.

Vị trí liên quan:

- `online-store-backend/src/config/multerConfig.js:52-87`
- `online-store-backend/src/utils/fileCleanup.js:11-36`

## Mức độ ưu tiên

| Ưu tiên | Vấn đề | Lý do |
| --- | --- | --- |
| P0 | Đồng bộ database và Cloudinary khi thay/xóa ảnh | Có thể mất ảnh hoặc tạo dữ liệu không nhất quán ngay khi hai admin thao tác cùng lúc. |
| P0 | Kiểm chứng quyền sở hữu upload trực tiếp | Cần ngăn việc gắn/xóa nhầm tài nguyên Cloudinary và quản lý upload dang dở. |
| P1 | Phát hiện xung đột khi cập nhật sản phẩm/banner | Ngăn mất dữ liệu do ghi đè giữa admin và super-admin. |
| P1 | Hàng đợi dọn tài nguyên và cơ chế retry | Bảo đảm các lỗi tạm thời từ Cloudinary không làm lệch dữ liệu lâu dài. |
| P1 | Rate limit, quota và giới hạn upload đồng thời theo tài khoản | Bảo vệ quota Cloudinary và tránh chặn nhầm theo IP dùng chung. |
| P2 | Chuyển thao tác file cục bộ sang bất đồng bộ/shared storage | Giảm chặn event loop và hỗ trợ triển khai nhiều instance. |

## Hướng xử lý đề xuất

1. Ghi một bản ghi upload tạm ở backend trước khi cấp chữ ký, gồm người tạo, thư mục, trạng thái, thời hạn và mã upload duy nhất. Sau upload, backend phải xác minh `publicId` với Cloudinary và chỉ chấp nhận ảnh thuộc bản ghi đó.
2. Duy trì optimistic concurrency control hiện có cho product và banner: mọi endpoint cập nhật phải dùng phiên bản bản ghi đã đọc, trả lỗi xung đột để người dùng tải lại dữ liệu thay vì ghi đè.
3. Lưu thay đổi database trước theo transaction/điều kiện phiên bản; chỉ đưa việc xóa ảnh cũ vào outbox hoặc hàng đợi nền có retry và idempotency key. Không xóa ảnh cũ trước khi bản ghi mới được xác nhận.
4. Thiết kế việc xóa Cloudinary theo hướng idempotent: cùng một `publicId` có thể được xử lý lặp lại an toàn, có log trạng thái và lịch quét các ảnh mồ côi.
5. Mở rộng limiter hiện có theo endpoint và role; bổ sung quota theo user/role cùng giới hạn số upload đang chạy, đồng thời giữ fallback theo IP khi chưa xác thực để chống lạm dụng.
6. Không đưa file lớn vào RAM khi backend nhận upload; stream file lên Cloudinary hoặc dùng direct upload có kiểm chứng ở backend. Thay `unlinkSync` bằng API bất đồng bộ và chuyển avatar/review sang shared object storage nếu triển khai nhiều instance.
7. Theo dõi các chỉ số: số upload đang chạy, lỗi Cloudinary, retry, số ảnh mồ côi, xung đột cập nhật, thời gian upload và tỷ lệ request bị limiter chặn.

## Thứ tự triển khai còn lại

Optimistic concurrency và xác minh tài nguyên Cloudinary hiện có là nền tảng; cần kiểm thử chúng, không triển khai một cơ chế ghi đè thứ hai.

1. Tạo upload claim có thời hạn trước khi cấp chữ ký, gồm owner, mục đích, thư mục, trạng thái và mã claim; bắt buộc claim đó khi xác thực/gắn `publicId` vào product hoặc banner.
2. Đã đưa yêu cầu dọn ảnh cũ vào outbox bền vững sau khi cập nhật database thành công; worker dùng idempotency theo `publicId`, lease và retry có giới hạn.
3. Mở rộng limiter hiện có thành quota và giới hạn upload đồng thời theo user/role, tách ngưỡng cho endpoint chữ ký, validate và upload, đồng thời giữ fallback theo IP.
4. Thay luồng lưu file local bằng I/O bất đồng bộ và shared object storage trước khi chạy nhiều instance.
5. Kiểm thử cạnh tranh: hai admin sửa cùng bản ghi, claim hết hạn, upload bị hủy, Cloudinary lỗi tạm thời, retry lặp và nhiều upload đồng thời từ cùng user.

## Cổng triển khai

- Không cho phép gắn `publicId` chỉ dựa trên dữ liệu do trình duyệt gửi; backend phải kiểm tra claim còn hiệu lực, đúng owner và đúng mục đích.
- Không xóa ảnh đang được tham chiếu trước khi thay đổi database được xác nhận.
- Không chạy nhiều instance khi avatar/review còn phụ thuộc vào ổ đĩa cục bộ hoặc chưa có quy trình dọn file dùng chung.

## Tiêu chí hoàn thành

- Hai admin sửa cùng một product/banner không thể âm thầm ghi đè dữ liệu của nhau.
- Mỗi ảnh được tham chiếu phải được backend xác minh là upload hợp lệ của đúng tác nhân và đúng mục đích.
- Thất bại ở Cloudinary hoặc database không làm mất ảnh đang dùng và có thể được khôi phục qua retry.
- Upload hàng loạt không gây tăng bộ nhớ không kiểm soát, chặn event loop hoặc vượt quota không được phát hiện.
- Chạy nhiều instance vẫn bảo đảm avatar/review và ảnh Cloudinary có thể truy cập, dọn dẹp và truy vết nhất quán.

## Trạng thái

**Đang hoàn thiện xác minh.** Direct upload đã có ownership claim, validate theo claim, quota/concurrency theo user/role và outbox/retry Cloudinary. Avatar/review vẫn còn local-storage path; cần kiểm thử runtime và đánh giá shared storage khi triển khai nhiều instance.
