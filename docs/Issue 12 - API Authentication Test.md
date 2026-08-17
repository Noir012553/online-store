# Kiểm thử xác thực API

## Phạm vi

- Backend Express, MongoDB và JWT Bearer Token.
- Luồng đăng nhập, refresh token, profile, endpoint công khai và route phân quyền chỉ đọc.

## Kết quả đã xác minh

- Endpoint công khai và việc lấy dữ liệu theo ID hoạt động đúng trong lần kiểm thử.
- User token hợp lệ truy cập profile thành công.
- Một số token quản trị từng bị từ chối ở middleware `protect`; kết quả này không đủ để kết luận riêng về quyền vì lỗi xảy ra trước lớp phân quyền.
- Rate limit đăng nhập trả `429` như mong đợi và không được xem là lỗi Bearer token.

## Đối chiếu mã nguồn

- `tokenBlacklist` đã nạp `jsonwebtoken` trước khi gọi `jwt.decode()` trong `revokeToken()`; cần xác minh logout tạo bản ghi blacklist với thời hạn JWT hợp lệ trên môi trường triển khai.
- Middleware xác thực ghi log server theo từng giai đoạn xử lý, nhưng response công khai vẫn giữ thông báo `401` an toàn.

## Cần xác minh khi triển khai

- Xác minh logout thực sự tạo bản ghi blacklist với thời hạn JWT hợp lệ.
- Tất cả instance backend dùng cùng JWT access/refresh secrets.
- Refresh cookie được gửi đúng với các thuộc tính `HttpOnly`, `Secure` và domain/path phù hợp.
- Đăng nhập mới, tải lại trang, refresh token, logout và chặn quay lại trang bảo vệ đều hoạt động đúng.
- Không ghi token, cookie hay thông tin xác thực vào log client/server.

## Phối hợp xác minh

Issue này theo dõi kết quả kiểm chứng API và hạ tầng. Checklist thao tác phiên chi tiết — đăng nhập, refresh, tải lại trang, logout và Back — được duy trì tại `issue-13`; không sao chép lại để tránh hai nguồn trạng thái.

## Trạng thái

**Chưa hoàn tất.** Cần xác minh luồng blacklist khi logout, rồi kiểm tra cookie, secrets và hạ tầng nhiều instance tại môi trường triển khai. Không lưu URL, tài khoản, mật khẩu hoặc ID production trong repository.
