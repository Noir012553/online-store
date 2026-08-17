# Báo cáo lỗi xác thực và an toàn dữ liệu phiên

## Tóm tắt

Lỗi `GET /api/users/profile 401` xuất hiện khi access token chỉ tồn tại trong memory bị mất sau khi tải lại trang hoặc khi token hết hạn. Frontend hiện refresh access token bằng refresh token trong cookie `HttpOnly` trước khi gọi profile, tự retry một lần khi gặp `401`, rồi xóa session memory và chuyển về `/login` nếu refresh thất bại.

Không lưu access token, refresh token hoặc snapshot user vào `localStorage`. Luồng authentication đã được gia cố về cleanup request, event listener và trạng thái khởi tạo profile. Build frontend đã thành công; còn cần xác minh cookie và JWT secrets trên production.

## Trạng thái

**Đã xử lý frontend và kiểm tra build.** Cần xác minh lại trên môi trường production bằng một phiên đăng nhập hợp lệ.

## Hiện tượng

Frontend phát sinh request:

```text
GET /api/users/profile 401 Unauthorized
```

Request xuất hiện trong luồng `getMe()` khi ứng dụng khởi tạo phiên đăng nhập.

## Phạm vi kiểm tra

- Frontend: `online-store-frontend`
- Backend: `online-store-backend`
- API liên quan: `/api/users/profile`, `/api/users/refresh`, `/api/users/login`
- Cơ chế xác thực: access token dạng Bearer và refresh token trong cookie `HttpOnly`
- Kiểm tra build: `npm run build`

## Nguyên nhân kỹ thuật có thể xảy ra

Endpoint profile được bảo vệ bởi middleware `protect` và yêu cầu header:

```http
Authorization: Bearer <access-token>
```

Access token của frontend chỉ tồn tại trong memory. Sau khi tải lại trang, token memory bị mất; frontend phải gọi `/api/users/refresh` để lấy token mới từ refresh cookie trước khi gọi profile.

Nếu refresh cookie không được gửi, hết hạn, bị revoke hoặc các instance backend dùng JWT secret không đồng nhất, `/api/users/profile` sẽ trả về `401`.

Backend hiện gom nhiều lỗi xác thực thành cùng một response `401`, gồm:

1. JWT không hợp lệ hoặc hết hạn.
2. JWT được ký bằng secret khác với secret dùng để verify.
3. Token đã bị revoke.
4. User trong token không tồn tại.
5. User đã bị đánh dấu `isDeleted`.
6. Request không có Bearer token.

## Thay đổi đã thực hiện

### Frontend authentication

- Giữ access token chỉ trong memory.
- Giữ refresh token trong cookie `HttpOnly`.
- Không lưu access token, refresh token hoặc user snapshot vào `localStorage`.
- Logout và sự kiện `auth:logout` xóa access token memory và state React; backend đồng thời revoke access token và xóa refresh cookie.
- Khi refresh thất bại hoặc request retry tiếp tục trả `401`, frontend xóa session memory, phát sự kiện logout và chuyển về `/login` với đường dẫn hiện tại được encode an toàn.
- AuthProvider hủy cập nhật state từ request khởi tạo cũ, xóa token khi unmount và luôn gỡ event listener.
- Profile chờ `isInitialized` trước khi hiển thị trạng thái yêu cầu đăng nhập, tránh hiển thị sai trong lúc refresh đang chạy.
- Giữ cleanup cho refresh promise, request deduplication, timer và event listener.

Các file liên quan:

- `online-store-frontend/src/lib/context/AuthContext.tsx`
- `online-store-frontend/src/lib/api.ts`
- `online-store-frontend/src/pages/profile.tsx`

### Lý do không dùng localStorage

Không lưu access token hoặc snapshot user vào `localStorage` vì:

- Dữ liệu tồn tại lâu hơn vòng đời tab/trang.
- JavaScript chạy trong trang có thể đọc dữ liệu này nếu xảy ra XSS.
- Snapshot user có thể bị cũ sau khi tài khoản thay đổi.
- Thông tin phiên không cần thiết phải được persist ở client.

## Kiểm tra memory và vòng đời request

- Access token được thay thế bằng token mới khi refresh, không tạo danh sách token tích lũy.
- `refreshPromise` được đặt lại sau khi refresh hoàn tất.
- Request pending được xóa trong `.finally()` sau khi hoàn thành.
- Timestamp deduplication cũng được xóa cùng request.
- AuthProvider dùng cờ hủy cục bộ để bỏ qua kết quả request sau unmount hoặc trong React Strict Mode.
- Event listener `auth:logout` được gỡ khi `AuthProvider` unmount.
- Timer redirect trong profile được xóa khi component unmount.
- Không persist thông tin xác thực trong browser storage.

## Kết quả kiểm tra

```text
npm ci: PASS
npm run build: PASS
TypeScript compilation: PASS
git diff --check: PASS
```

Build chỉ còn cảnh báo `NODE_ENV` đang dùng giá trị không chuẩn; cảnh báo này không liên quan trực tiếp đến lỗi `401`.

## Checklist production

- [ ] Đăng nhập lại sau khi triển khai frontend mới.
- [ ] Kiểm tra response `/api/users/refresh` trả `200` và có `accessToken`.
- [ ] Kiểm tra cookie `refreshToken` có thuộc tính `HttpOnly`, `Secure` ở production và `Path=/`.
- [ ] Xác nhận domain frontend và backend cho phép cookie được gửi theo mô hình proxy hiện tại.
- [ ] Xác nhận mọi instance backend dùng cùng `JWT_ACCESS_SECRET` hoặc `JWT_SECRET`.
- [ ] Xác nhận mọi instance backend dùng cùng `JWT_REFRESH_SECRET` nếu cấu hình riêng.
- [ ] Kiểm tra `GET /api/users/profile` được gửi sau khi refresh thành công.
- [ ] Không ghi access token, refresh token, cookie hoặc thông tin xác thực vào log trình duyệt/server.
- [ ] Kiểm tra logout xóa cookie refresh ở response và xóa token memory ở frontend.
- [ ] Xác nhận user thường được đưa về `/` hoặc đường dẫn công khai hiện tại sau logout.
- [ ] Xác nhận admin và super admin được đưa về `/login` sau logout.
- [ ] Xác nhận dùng nút Back sau logout không quay lại được trang quản trị đã bảo vệ.

## Cách xác minh sau triển khai

1. Xóa cookie phiên cũ của domain ứng dụng.
2. Đăng nhập bằng tài khoản hợp lệ.
3. Kiểm tra `/api/users/login` trả `200`.
4. Kiểm tra request `/api/users/profile` có Bearer token và trả `200`.
5. Tải lại trang.
6. Kiểm tra `/api/users/refresh` trả `200` trước request profile.
7. Đăng xuất rồi kiểm tra các request profile tiếp theo không còn dùng phiên cũ.

## Kết luận

Frontend không persist dữ liệu user hoặc token vào `localStorage`; các dữ liệu không nhạy cảm như ngôn ngữ, giỏ hàng và coupon vẫn có thể dùng storage theo chức năng riêng. Nếu lỗi `401` vẫn xảy ra ngay sau lần đăng nhập mới, cần điều tra cookie refresh và cấu hình JWT giữa các instance production thay vì thêm dữ liệu xác thực vào client storage.
