
## Mục tiêu

Tài liệu này hướng dẫn chuyển media nội dung của trang About sang Cloudinary và chuẩn bị phương án phân phối MP3/video bằng cùng một media service.

Phạm vi không bao gồm ảnh ở navbar/footer. Phần ảnh gồm 4 ảnh team static và toàn bộ 8 avatar reviewer dynamic trong nguồn dữ liệu; video hero không được tính vào nhóm ảnh nhưng cần được tối ưu riêng vì có thể ảnh hưởng lớn đến lần tải đầu tiên.

## Hiện trạng cần xử lý

Trang About hiện có:

- 4 ảnh team static đang dùng đường dẫn local `/images/team/team-1.jpg` đến `/images/team/team-4.jpg`.
- 8 avatar reviewer dynamic trong pool dữ liệu review; mỗi lần About có thể hiển thị 3 avatar khác nhau. Các avatar hiện có thể đến từ Pexels, Cloudinary hoặc nguồn fallback.
- 1 video nền hero.
- Các ảnh navbar/footer nằm ngoài phạm vi migration này.

Sau migration:

- 4 ảnh team static phải dùng URL Cloudinary thống nhất.
- Cả 8 avatar reviewer trong pool dynamic phải dùng URL Cloudinary, để mọi tổ hợp 3 avatar trả về bởi API đều không còn phụ thuộc vào Pexels hoặc URL ngoài Cloudinary.
- Không hardcode chỉ 3 avatar đang hiển thị tại một thời điểm; phải kiểm tra toàn bộ pool reviewer trong cơ sở dữ liệu/seed data.

## Điều kiện Cloudinary

1. Tạo hoặc chọn đúng Product Environment trong Cloudinary.
2. Xác nhận gói hiện tại và theo dõi các chỉ số `storage`, `bandwidth`, `transformations` và `credits` trong Dashboard.
3. Không đưa `CLOUDINARY_API_SECRET` vào frontend, Git, local storage, response API hoặc log.
4. Backend hiện đã có các biến cấu hình:

```text
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
```

Chỉ backend được phép đọc cả ba biến. Frontend chỉ nhận URL media đã được backend kiểm tra hoặc nhận thông tin chữ ký tạm thời cho direct upload.

## Quy ước thư mục và public ID

Dùng folder riêng cho nội dung About:

```text
laptop-store/about/team/team-1
laptop-store/about/team/team-2
laptop-store/about/team/team-3
laptop-store/about/team/team-4
laptop-store/about/reviewers/reviewer-1
laptop-store/about/reviewers/reviewer-2
laptop-store/about/reviewers/reviewer-3
laptop-store/about/reviewers/reviewer-4
laptop-store/about/reviewers/reviewer-5
laptop-store/about/reviewers/reviewer-6
laptop-store/about/reviewers/reviewer-7
laptop-store/about/reviewers/reviewer-8
laptop-store/about/hero/about-hero
laptop-store/about/audio/about-music
```

Không dùng tên file do người dùng gửi làm `public_id` trực tiếp. Backend phải duy trì danh sách 12 public ID cố định được phép cho About (4 team và 8 reviewer), ghi nhận URL sau khi upload thành công, và map từng avatar reviewer trong pool dữ liệu về đúng public ID tương ứng.

## Upload 4 ảnh team

Thực hiện upload đủ 4 ảnh sau vào đúng public ID. Nguồn là các ảnh đang được trang About sử dụng; cần tải bản gốc về vùng quản lý nội bộ và kiểm tra quyền sử dụng trước khi upload.

| Nguồn hiện tại | Public ID Cloudinary bắt buộc |
|---|---|
| `https://manln.online/images/team/team-1.jpg` | `laptop-store/about/team/team-1` |
| `https://manln.online/images/team/team-2.jpg` | `laptop-store/about/team/team-2` |
| `https://manln.online/images/team/team-3.jpg` | `laptop-store/about/team/team-3` |
| `https://manln.online/images/team/team-4.jpg` | `laptop-store/about/team/team-4` |

Trong Cloudinary Console:

1. Mở đúng **Product Environment** và vào **Media Library**.
2. Chọn **Upload**, chọn từng ảnh gốc, rồi đặt folder `laptop-store/about/team`.
3. Tại trường **Public ID**, nhập lần lượt `team-1`, `team-2`, `team-3`, `team-4`; không giữ tên file gốc nếu tên đó khác public ID yêu cầu.
4. Không bật overwrite nếu public ID đã tồn tại mà chưa kiểm tra bản ghi hiện tại. Nếu cần thay ảnh, ghi nhận URL và metadata cũ trước, sau đó mới xác nhận overwrite.
5. Sau mỗi lần upload, kiểm tra tài nguyên có đúng `resource_type=image`, đúng public ID đầy đủ và có `secure_url`.
6. Ghi lại `secure_url`, format, width, height và bytes vào bản ghi migration. Chỉ đánh dấu ảnh hoàn tất khi cả 4 public ID đều tồn tại và truy vấn được từ Cloudinary.

Không đưa `CLOUDINARY_API_SECRET` vào frontend, tài liệu, lệnh shell chia sẻ hoặc log. Nếu upload tự động thay vì Console, chỉ chạy từ backend/migration job có quyền đọc secret và vẫn phải giữ nguyên 4 public ID ở trên.

## Quy trình upload ảnh About

1. Tải 4 ảnh team và 8 avatar reviewer từ nguồn quản lý nội bộ hoặc nguồn công khai đã kiểm tra quyền sử dụng.
2. Kiểm tra MIME type, định dạng thực tế, kích thước file và kích thước pixel của từng file.
3. Upload 4 ảnh team vào `about/team` và 8 avatar reviewer vào `about/reviewers` theo danh sách public ID cố định.
4. Ghi lại `public_id`, `secure_url`, format, width, height và bytes của đủ 12 ảnh.
5. Tạo URL delivery có transformation tự động.
6. Thay nguồn ảnh team trong component About bằng URL Cloudinary đã kiểm tra.
7. Cập nhật toàn bộ 8 avatar trong pool review/nguồn dữ liệu dynamic sang URL Cloudinary tương ứng; không chỉ cập nhật 3 bản ghi đang hiển thị.
8. Xác minh không còn URL Pexels, đường dẫn local hoặc URL avatar ngoài Cloudinary trong toàn bộ pool reviewer.
9. Chỉ dọn file local sau khi cả 12 bản ghi và component mới đã được xác nhận hoạt động.
10. Kiểm tra trang ở desktop, tablet và mobile; sau đó kiểm tra Network và Lighthouse.

Không xóa bản local hoặc URL cũ trước khi bản ghi và component mới đã được xác nhận hoạt động. Nếu ảnh được lưu trong MongoDB, lưu cả URL và `public_id` để có thể thay hoặc xóa đúng tài nguyên.

## Transformation khuyến nghị

Dùng URL delivery có tự động chọn định dạng và chất lượng:

```text
https://res.cloudinary.com/<cloud_name>/image/upload/f_auto,q_auto,w_640/laptop-store/about/team/team-1
```

Cho màn hình lớn có thể dùng width 1200:

```text
https://res.cloudinary.com/<cloud_name>/image/upload/f_auto,q_auto,w_1200/laptop-store/about/team/team-1
```

Yêu cầu:

- Dùng `f_auto,q_auto` cho ảnh giao diện.
- Chọn `w_640` hoặc `w_1200` theo kích thước hiển thị thực tế, không tải ảnh lớn hơn cần thiết.
- Dùng `srcSet`/`sizes` hoặc cơ chế tương đương của Next.js để trình duyệt chọn đúng biến thể.
- Ảnh ngoài viewport đầu tiên phải lazy-load.
- Chỉ preload ảnh hero thực sự hiển thị ngay khi mở trang.
- Giữ tỷ lệ và cách crop hiện tại; không đổi style hoặc bố cục chỉ vì migration.

Không tạo hàng loạt biến thể thủ công nếu URL transformation động đã đáp ứng nhu cầu. Việc tạo transformation không cần thiết làm tăng chi phí và khó kiểm soát quota.

## MP3 và video hero

Cloudinary có thể lưu và phân phối MP3; trong SDK Cloudinary, audio thường được xử lý với `resource_type: "video"`. Có thể lưu MP3 trong:

```text
laptop-store/about/audio/about-music
```

Khi upload MP3:

- Kiểm tra `resource_type`, MIME type và dung lượng ở backend.
- Dùng bitrate phù hợp, thường 96–128 kbps cho nhạc nền hoặc audio thông thường.
- Gán `Content-Type: audio/mpeg` khi delivery nếu hệ thống yêu cầu.
- Không tự động phát audio nếu yêu cầu trình duyệt hoặc trải nghiệm người dùng không cho phép.

Với video hero:

- Upload vào `laptop-store/about/hero/about-hero`.
- Dùng `q_auto` và độ phân giải phù hợp, ưu tiên 720p nếu không cần 1080p.
- Tạo poster ảnh nhẹ từ video.
- Không chặn lần render đầu bằng video lớn; dùng `preload="metadata"` hoặc trì hoãn tải theo hành vi hiển thị.
- Cân nhắc poster tĩnh trên mạng chậm hoặc thiết bị mobile.

Video và MP3 có thể tiêu thụ bandwidth lớn hơn nhiều so với 12 ảnh About, nên phải theo dõi riêng trong Dashboard.

## Bảo mật upload

Luồng upload được khuyến nghị là direct upload có chữ ký:

```text
Frontend → Backend xin claim/chữ ký → Cloudinary upload
Frontend → Backend validate public_id/URL → lưu dữ liệu
```

Backend phải kiểm tra:

- User, role và mục đích upload.
- Folder được phép.
- Claim còn hạn và đúng owner.
- `public_id` khớp folder và claim.
- `resource_type`, MIME type, format và kích thước.
- URL trả về khớp với tài nguyên đã truy vấn trên Cloudinary.

Không dùng unsigned upload mở rộng cho người dùng không xác thực nếu không có giới hạn rõ ràng. Không đặt API secret trong biến có tiền tố `NEXT_PUBLIC_`.

## Kiểm tra quota và chi phí

Trước khi triển khai:

1. Ghi nhận số liệu hiện tại trong Cloudinary Dashboard.
2. Ghi lại bytes của 4 ảnh team và 8 avatar reviewer sau khi tối ưu, cùng kích thước video/MP3.
3. Kiểm tra một lượt tải trang thực tế để biết bandwidth của ảnh, video và audio.
4. Xem riêng storage, bandwidth, transformations và credits sau khi test.
5. Đặt cảnh báo usage nếu gói Cloudinary hỗ trợ.
6. Kiểm tra lại sau 24 giờ và sau một chu kỳ billing.

Ước tính 12 ảnh thường không đáng kể nếu dùng `f_auto,q_auto`, resize theo viewport và lazy-load. Không kết luận quota chỉ dựa trên số lượng file; traffic và dung lượng video/MP3 mới là yếu tố có thể làm tăng usage nhanh.

## Checklist nghiệm thu

- [ ] 4 ảnh team static và cả 8 avatar reviewer dynamic đều có `public_id` và URL Cloudinary.
- [ ] Không còn URL Pexels, URL avatar ngoài Cloudinary hoặc đường dẫn local trong toàn bộ pool 8 reviewer và 4 ảnh team.
- [ ] API testimonials có thể trả về bất kỳ 3 reviewer nào mà cả 3 avatar đều dùng URL Cloudinary.
- [ ] Ảnh được delivery bằng `f_auto,q_auto` và kích thước phù hợp.
- [ ] Ảnh ngoài viewport dùng lazy loading.
- [ ] Hero video có poster và không chặn render đầu tiên.
- [ ] MP3, nếu dùng, có MIME type và bitrate phù hợp.
- [ ] Cloudinary secret chỉ tồn tại ở backend/environment deploy.
- [ ] Backend validate ownership, folder, format, kích thước và resource type.
- [ ] URL và `public_id` được lưu đủ để replace/delete.
- [ ] Đã kiểm tra Network, Lighthouse, desktop, tablet và mobile.
- [ ] Đã ghi nhận usage trước và sau test.
- [ ] Không phát sinh ảnh mồ côi sau migration.

## Tiêu chí hoàn thành

Migration được xem là hoàn tất khi 4 ảnh team static và toàn bộ 8 avatar reviewer dynamic hiển thị đúng từ Cloudinary ở các breakpoint, không có secret ở frontend, video không làm chậm render đầu tiên, và usage sau kiểm thử nằm trong giới hạn gói Cloudinary đang dùng.

## Ghi nhận hiện trạng quản lý nhân viên

Qua rà soát giao diện và API hiện tại:

- Chưa có entity hoặc module riêng cho `employee`/`staff`; tài khoản nội bộ hiện dùng chung model `User` với các role `user`, `admin` và `super-admin`.
- Super Admin đã được phép quản lý tài khoản qua màn `online-store-frontend/src/pages/admin/usersAdmin.tsx`, gồm danh sách, tìm kiếm, lọc role, tạo, sửa, xóa mềm, khôi phục và xóa vĩnh viễn.
- Backend giới hạn các API quản lý user cho `super-admin` tại `online-store-backend/src/routes/userRoutes.js`.
- Model `User` đã có trường `profileImage`, và luồng upload avatar cá nhân đã dùng Cloudinary.
- Màn quản trị đã hiển thị avatar trong danh sách và cho Super Admin upload/thay ảnh tài khoản qua claim Cloudinary; ảnh cũ được đưa vào cleanup outbox.
- Đã sửa lỗi nạp dữ liệu ở `online-store-frontend/src/pages/admin/editUser/[id].tsx`: API `GET /api/users/:id` trả trực tiếp object user.
- Quyền quản lý nhân viên được giữ ở mức **chỉ Super Admin** trên cả frontend và backend; Admin thường không được xem hoặc gọi các API quản lý user.

Phạm vi quản lý nhân viên có ảnh đã hoàn tất trong mã nguồn. Không tạo entity nhân viên riêng trừ khi nghiệp vụ cần thêm thông tin nhân sự ngoài tài khoản hệ thống.

## Tiến độ triển khai

**Cập nhật lần cuối:** 2026-07-30

### Đã hoàn thành trong mã nguồn

- [x] Đã khai báo đủ 4 public ID team, 8 public ID reviewer, hero video và audio trong `src/config/aboutMedia.js`.
- [x] API About trả URL Cloudinary với `f_auto,q_auto`, các biến thể `w_640`/`w_1200` và `srcSet` cho 4 ảnh team.
- [x] API testimonials chỉ chọn review thuộc pool 8 reviewer, có `avatarPublicId` đúng và avatar là URL Cloudinary.
- [x] Seed reviewer map toàn bộ 8 avatar vào public ID Cloudinary tương ứng, không chỉ 3 avatar đang hiển thị.
- [x] Giao diện About dùng URL media từ backend; ảnh team và avatar dùng lazy-load, `srcSet`/`sizes`; video dùng poster và `preload="metadata"`.
- [x] Script migration dùng public ID cố định, không ghi đè tài nguyên đã tồn tại, xác minh metadata sau upload và dừng nếu thiếu reviewer trong database.
- [x] Secret Cloudinary chỉ được đọc ở backend; không có biến `NEXT_PUBLIC_CLOUDINARY_API_SECRET`.
- [x] Kiểm tra cú pháp migration script và `git diff --check` đã đạt.

### Chưa thể xác nhận trong môi trường hiện tại

- [ ] Chạy migration thật để upload/xác minh 4 ảnh team và 8 avatar reviewer trên Product Environment Cloudinary.
- [ ] Ghi nhận `secure_url`, format, width, height và bytes thực tế của 12 ảnh.
- [ ] Upload và kiểm tra hero video; MP3 chỉ thực hiện nếu sản phẩm thực sự sử dụng audio nền.
- [ ] Xác minh dữ liệu MongoDB production có đủ cả 8 reviewer sau migration.
- [ ] Chạy build frontend và test backend; hiện môi trường chưa cài dependencies (`next` và `dotenv` không tồn tại).
- [ ] Kiểm tra Network, Lighthouse, desktop/tablet/mobile và usage Cloudinary trước/sau kiểm thử.

### Điều kiện để đánh dấu hoàn tất

1. Cài dependencies cho `online-store-frontend` và `online-store-backend`.
2. Cung cấp các biến backend `MONGO_URI`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` trong môi trường deploy/migration; không đưa secret vào frontend hoặc Git.
3. Nếu có video, cung cấp `ABOUT_HERO_SOURCE` và chạy `npm run migrate:about-media` từ backend.
4. Kiểm tra kết quả migration, API `/api/products/about/media`, API testimonials và giao diện About ở các breakpoint.
5. Ghi nhận usage Cloudinary và chỉ đánh dấu checklist nghiệm thu sau khi các bước trên đạt.
