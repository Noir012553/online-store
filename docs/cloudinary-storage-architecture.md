# Kiến trúc lưu trữ ảnh với Cloudinary

## Mục tiêu

Tài liệu này định nghĩa hướng triển khai upload ảnh cho hệ thống có nhiều người dùng, bao gồm ảnh sản phẩm, banner, avatar và ảnh đính kèm review.

Mục tiêu chính:

- Lưu file ảnh tập trung trên Cloudinary.
- Không phụ thuộc vào ổ đĩa cục bộ của backend.
- Giữ quyền kiểm soát upload ở backend.
- Hỗ trợ nhiều instance backend và lượng người dùng lớn.
- Theo dõi được ai đã upload, thay thế hoặc xóa ảnh.
- Hạn chế ảnh mồ côi, lạm dụng upload và chi phí ngoài dự kiến.

## Kiến trúc khuyến nghị

```text
Browser
  |
  | 1. Gọi backend để xin upload claim và chữ ký tạm thời
  v
Backend API
  |
  | 2. Kiểm tra user, role, folder, mục đích, quota và concurrency
  v
Browser ----------------------> Cloudinary
        3. Direct upload có chữ ký
                    |
                    | 4. Backend validate publicId, URL và claim
                    v
                MongoDB
        URL + publicId + metadata + audit log
```

Backend không nhận và giữ toàn bộ file ảnh trong thời gian dài. Backend chỉ chịu trách nhiệm cấp quyền upload, xác thực kết quả và lưu thông tin nghiệp vụ.

## Phân loại thư mục Cloudinary

Mỗi loại ảnh dùng một folder cố định:

```text
laptop-store/admins/      # Ảnh sản phẩm do admin upload
laptop-store/banners/     # Ảnh banner
laptop-store/users/       # Avatar người dùng
laptop-store/reviewers/   # Ảnh đính kèm review
```

`publicId` nên được backend tạo bằng claim duy nhất, không lấy nguyên giá trị tùy ý từ trình duyệt:

```text
laptop-store/{folder}/{claimId}
```

Cách này giúp tránh ghi đè file, truy vết được upload và ràng buộc tài nguyên với đúng user.

## Luồng upload an toàn

1. Frontend gửi yêu cầu đến `/api/cloudinary/signature`.
2. Backend xác thực access token và lấy role của user.
3. Backend kiểm tra folder có hợp lệ với role và mục đích hay không.
4. Backend tạo `CloudinaryUploadClaim` với owner, folder, purpose, trạng thái và thời hạn.
5. Backend tạo chữ ký chỉ từ các tham số upload hợp lệ.
6. Frontend upload trực tiếp đến Cloudinary.
7. Frontend gửi kết quả upload về `/api/cloudinary/validate`.
8. Backend kiểm tra claim còn hạn, đúng owner, đúng `publicId` và đúng URL.
9. Backend truy vấn metadata Cloudinary để kiểm tra resource type, kích thước, định dạng và folder.
10. Chỉ sau khi validate thành công, URL và `publicId` mới được gắn vào user, product, banner hoặc review.

Không được bỏ qua bước validate chỉ vì Cloudinary đã trả về HTTP 200.

## Tham số môi trường

Chỉ backend được phép đọc secret:

```text
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
```

`CLOUDINARY_API_SECRET` không được đưa vào frontend, local storage, response API hoặc log. Frontend chỉ nhận `cloud_name`, `api_key`, timestamp, chữ ký và các tham số upload cần thiết.

## Dữ liệu lưu trong MongoDB

Tài nguyên nghiệp vụ chỉ cần lưu liên kết tới Cloudinary:

```js
{
  image: "https://res.cloudinary.com/...",
  imagePublicId: "laptop-store/banners/claim-id"
}
```

Không lưu file binary trong MongoDB. Với lịch sử thao tác, nên có collection audit riêng:

```js
{
  actorId: ObjectId,
  actorRole: "admin",
  action: "upload",
  resourceType: "banner",
  resourceId: ObjectId,
  cloudinaryPublicId: "laptop-store/banners/claim-id",
  metadata: {
    previousPublicId: null,
    bytes: 245678,
    format: "webp"
  },
  createdAt: Date
}
```

Các action tối thiểu gồm `upload`, `replace`, `delete`, `validate_failed` và `attach_failed`.

## Xử lý ảnh cũ và ảnh mồ côi

Khi thay ảnh:

1. Validate ảnh mới.
2. Cập nhật document nghiệp vụ với `publicId` mới.
3. Ghi audit log.
4. Đưa `publicId` cũ vào outbox dọn dẹp.
5. Worker xóa ảnh cũ trên Cloudinary với retry và idempotency.

Không xóa ảnh cũ trước khi bản ghi mới được lưu thành công. Nếu người dùng upload xong nhưng không lưu form, claim hết hạn và worker dọn tài nguyên chưa được gắn vào nghiệp vụ.

## Khả năng mở rộng cho lượng người dùng lớn

Một triệu tài khoản không đồng nghĩa với một triệu upload đồng thời. Các giới hạn cần quản lý là:

- Số upload đang chạy theo user.
- Số upload theo role trong một khoảng thời gian.
- Dung lượng tối đa mỗi file.
- Tổng quota theo user hoặc tenant.
- Tần suất cấp chữ ký và validate.
- Kích thước ảnh sau xử lý.
- Chi phí lưu trữ và băng thông Cloudinary.

Backend nên dùng rate limit và quota theo user/role, đồng thời giữ fallback theo IP cho request chưa xác thực. Các truy vấn claim cần có index theo `ownerId`, `status` và `expiresAt`.

MongoDB cần dùng pagination khi đọc audit log hoặc danh sách ảnh. Không trả toàn bộ lịch sử upload trong một request.

## Avatar và ảnh review

Avatar và ảnh review cũng nên chuyển sang cùng cơ chế direct upload Cloudinary thay vì lưu lâu dài trong `uploads/`.

Sau khi migration hoàn tất:

- `uploads/` không còn là nơi lưu ảnh chính.
- Có thể giữ thư mục rỗng cho file tạm nếu route còn cần.
- Không commit file người dùng upload vào Git.
- Chỉ xóa phụ thuộc local storage sau khi đã kiểm tra toàn bộ route và dữ liệu cũ.
- Dữ liệu ảnh cũ cần được migrate sang Cloudinary và cập nhật URL, `publicId` trong MongoDB.

## Kiểm tra định dạng và nội dung

Backend phải kiểm tra tại boundary:

- MIME type cho phép.
- Phần mở rộng và format thực tế từ metadata Cloudinary.
- Kích thước file tối đa.
- Chiều rộng và chiều cao hợp lệ.
- `resource_type` phải là `image`.
- URL phải khớp với resource đã truy vấn bằng `publicId`.
- `publicId` phải thuộc folder được cấp cho claim.

Không dùng tên file do người dùng gửi để tạo đường dẫn local hoặc `publicId` trực tiếp.

## Quan sát và vận hành

Nên theo dõi các chỉ số sau:

- Tỷ lệ cấp chữ ký thành công.
- Tỷ lệ upload Cloudinary lỗi theo status/error code.
- Tỷ lệ validate thất bại.
- Số claim đang `issued`, `validating`, `validated` và `failed`.
- Số ảnh chờ xóa trong outbox.
- Số lần retry và claim hết hạn.
- Dung lượng lưu trữ và băng thông Cloudinary.
- Tỷ lệ request bị quota hoặc rate limit.
- Thời gian upload trung bình và p95.

Log chỉ nên chứa claim ID, user ID đã được phép log, action và error code. Không ghi API secret, access token, refresh token hoặc nội dung nhạy cảm của người dùng.

## Lộ trình triển khai

### Giai đoạn 1: Ổn định direct upload

- Giữ chữ ký đúng với các tham số Cloudinary thực sự cần ký.
- Kiểm tra claim theo owner, folder, purpose và thời hạn.
- Giữ giới hạn kích thước, rate limit, quota và concurrency.
- Kiểm thử upload thành công, claim hết hạn và upload bị hủy.

### Giai đoạn 2: Đồng nhất avatar và review

- Chuyển route avatar và review sang direct upload.
- Validate kết quả bằng cùng ownership claim.
- Migrate các file local đang được tham chiếu.
- Cập nhật document MongoDB với URL và `publicId` Cloudinary.

### Giai đoạn 3: Audit và dọn dẹp

- Thêm audit log cho upload, replace, delete và lỗi validate.
- Dùng outbox cho việc xóa ảnh cũ.
- Chạy worker retry có lease và idempotency.
- Dọn claim hết hạn và ảnh mồ côi theo lịch.

### Giai đoạn 4: Kiểm thử tải

- Kiểm thử nhiều upload đồng thời từ cùng user.
- Kiểm thử nhiều role và nhiều instance backend.
- Kiểm thử Cloudinary timeout, lỗi tạm thời và retry.
- Kiểm tra quota, chi phí và băng thông trước khi mở rộng traffic.

## Tiêu chí hoàn thành

- Không có ảnh nghiệp vụ mới nào phụ thuộc vào ổ đĩa local của backend.
- Mỗi ảnh được gắn vào dữ liệu đều có claim hợp lệ và đúng owner.
- Không có secret Cloudinary ở frontend hoặc log.
- Thay ảnh không làm mất ảnh đang được tham chiếu.
- Ảnh cũ và upload dang dở có cơ chế retry/dọn dẹp.
- Audit log xác định được ai đã thực hiện hành động nào và vào thời điểm nào.
- Upload hàng loạt không vượt quota hoặc làm backend hết bộ nhớ.
- Hệ thống hoạt động nhất quán khi chạy nhiều instance.
