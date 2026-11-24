# Hướng dẫn chuyển luồng triển khai

## Mục tiêu

Tài liệu này mô tả hai mô hình triển khai của cửa hàng và cách chuẩn bị chuyển đổi an toàn:

1. **Luồng Cloudflare Tunnel**: frontend và backend chạy trên máy chủ hiện tại, được công khai qua Cloudflare Tunnel.
2. **Luồng Vercel + Render**: frontend chạy trên Vercel, backend chạy trên Render.

Mục tiêu vận hành là giữ hostname công khai ổn định và chuyển đồng bộ cả frontend lẫn API giữa hai luồng. Chỉ đổi biến môi trường ở frontend hoặc thêm hostname riêng lẻ không tạo ra cơ chế chuyển toàn bộ traffic.

## Trạng thái hiện tại

- Frontend Next.js nằm trong `online-store-frontend`.
- `online-store-frontend/next.config.ts` rewrite `/api/*` tới `NEXT_PUBLIC_API_BASE_URL`.
- Giá trị mặc định tại `online-store-frontend/src/config.ts` là `https://backend.manln.online`.
- Cloudflare Tunnel hiện phục vụ frontend/backend theo cấu hình đang chạy. Không thay đổi DNS, Tunnel ingress, hostname hoặc port trong quá trình chuẩn bị Vercel/Render.
- Provider Catalog có metadata cho Vercel, Render và Cloudflare Tunnel nhưng chưa tự deploy ứng dụng hay quản lý routing.
- Chưa có công tắc chuyển luồng production. Các bước ở tài liệu này là quy trình chuẩn bị/đề xuất, không phải thao tác đã được tự động hóa.

## Mô hình đích

| Chế độ | Frontend | Backend/API | DNS và hostname production |
| --- | --- | --- | --- |
| Cloudflare Tunnel | Frontend hiện tại trên máy chủ | Backend hiện tại qua Tunnel | Giữ tuyến hiện hành |
| Vercel + Render | Dự án Vercel, Root Directory `online-store-frontend` | Dịch vụ Render | Giữ hostname công khai; lớp điều phối chuyển traffic sang frontend Vercel |

Trong chế độ Vercel + Render, Vercel cần được build với `NEXT_PUBLIC_API_BASE_URL` trỏ tới URL backend Render phù hợp. Vercel rewrite `/api/*` tới backend đó. Không dùng URL Render giả định; lấy URL thực tế từ dịch vụ Render đã tạo.

## Các bước chuẩn bị an toàn

### 1. Giữ nguyên production hiện tại

- Không xóa, sửa hoặc thay thế DNS record đang phục vụ `manln.online`, `www.manln.online` hay `backend.manln.online`.
- Không đổi nameserver, Tunnel ingress, origin service hoặc port.
- Có thể dùng domain mặc định `*.vercel.app` để kiểm tra frontend Vercel; domain này chưa chuyển traffic production từ Cloudflare.
- Có thể dùng URL dịch vụ Render cấp (thường có dạng `https://<tên-dịch-vụ>.onrender.com`) để kiểm tra riêng backend; URL này không cần đổi DNS production.
- Ghi nhận cấu hình hiện tại và người có quyền rollback trước khi thay đổi routing.

### 2. Chuẩn bị staging riêng

- Tạo dịch vụ Render staging với cấu hình backend cần thiết, database staging riêng và secrets được nhập trực tiếp trong secret settings của nhà cung cấp.
- Tạo deployment Vercel Preview từ nhánh staging, đặt Root Directory là `online-store-frontend`.
- Cấu hình `NEXT_PUBLIC_API_BASE_URL` của Vercel Preview thành URL backend Render staging (URL `onrender.com` của dịch vụ staging), không dùng URL Render production trong bài kiểm thử.
- Không đưa token, secret, connection string hoặc giá trị biến môi trường nhạy cảm vào tài liệu, Git, log hay ảnh chụp.
- Xác nhận backend staging có health endpoint, CORS/cookie phù hợp và không dùng nhầm database production.

### 3. Kiểm thử cả luồng Vercel + Render

Trên URL Preview, kiểm tra tối thiểu:

- Trang chủ, danh mục, sản phẩm, ảnh và nội dung đa ngôn ngữ.
- Đăng nhập/đăng xuất, cookie, các trang quản trị và các API cần xác thực.
- Giỏ hàng, tạo đơn, tồn kho, VNPay/PayPal ở Sandbox và callback/webhook staging.
- Socket.IO, sitemap, upload và các request gọi trực tiếp backend.
- Log Vercel/Render không có lỗi 4xx/5xx bất thường; kiểm tra cold start và tính bền vững của file nếu dịch vụ dùng gói có giới hạn.

Frontend có một số luồng sử dụng `BACKEND_URL` trực tiếp ngoài các request `/api/*` (ví dụ URL ảnh và Socket.IO). Vì vậy chỉ đổi rewrite chưa đủ để xác nhận toàn bộ ứng dụng hoạt động trên Render; cần kiểm thử từng luồng và cấu hình build/runtime tương ứng.

## Cơ chế chuyển toàn bộ cần triển khai

Để có một thao tác chuyển đồng bộ, cần một lớp điều phối được kiểm soát (ví dụ Cloudflare Worker hoặc cơ chế routing tương đương) đặt trước hostname production. Lớp này phải có hai chế độ rõ ràng:

- **`tunnel`**: chuyển website tới frontend hiện tại; API và các dịch vụ liên quan tiếp tục dùng backend/Tunnel hiện tại.
- **`vercel-render`**: chuyển website tới frontend Vercel; API `/api/*` của frontend Vercel được rewrite tới backend Render.

Công tắc phải áp dụng một phiên bản cấu hình duy nhất cho cả frontend/API, có kiểm tra trước khi kích hoạt, khóa tránh hai thao tác đồng thời, ghi audit, health check sau chuyển và rollback tự động về chế độ trước nếu kiểm tra thất bại. Không cập nhật một nửa luồng hoặc cho hai backend cùng nhận traffic production ngoài kế hoạch.

Trước khi bật cơ chế này, phải xác định và kiểm tra cách chuyển tiếp `Host`, HTTPS/TLS, header, cookie, websocket, body upload, timeout, cache và các đường dẫn callback. Không tạo Worker route production hay chỉnh DNS chỉ dựa trên ví dụ trong tài liệu; cần kiểm thử trên hostname staging trước.

## Quy trình chuyển production sau khi đã có điều phối

1. Xác nhận cả hai stack khỏe mạnh, đúng database và đúng phiên bản ứng dụng.
2. Xem bản diff cấu hình routing: chế độ hiện tại, chế độ đích, hostname/origin bị tác động và các callback liên quan.
3. Xác nhận không có deploy/switch khác đang chạy; lưu lại phiên bản cấu hình để rollback.
4. Chuyển toàn bộ chế độ bằng một thao tác có xác nhận của quản trị viên.
5. Chờ health check xác nhận frontend và backend/API thuộc cùng chế độ đều đáp ứng.
6. Kiểm tra đăng nhập, đọc dữ liệu, tạo đơn thử và callback thanh toán Sandbox; theo dõi log và lỗi người dùng.
7. Nếu bất kỳ health check quan trọng nào thất bại, trả routing về phiên bản trước và xác nhận lại hệ thống cũ hoạt động.

Không coi việc API Cloudflare Tunnel còn kết nối là bằng chứng frontend Vercel/Render đã hoạt động, hoặc ngược lại.

## DNS, callback và rollback

- DNS là sổ định tuyến theo hostname; chỉ một cấu hình routing có hiệu lực cho một hostname tại một thời điểm. Giữ Cloudflare quản lý zone không đồng nghĩa mọi hostname phải trỏ tới cùng dịch vụ.
- Không xóa record của `backend.manln.online` khi chuyển frontend. Không thay DNS apex/`www` nếu chưa có routing layer và kế hoạch rollback được kiểm thử.
- Trước khi đổi backend production, xác nhận URL webhook PayPal/VNPay và các callback bên thứ ba đang tới backend có thể xác minh chữ ký và ghi nhận giao dịch. Không đổi callback trước khi backend đích sẵn sàng.
- Rollback bằng cách khôi phục phiên bản routing trước đó; không xóa dịch vụ hay record đang hoạt động để xử lý sự cố.
- Sau rollback, xác nhận frontend/API, đăng nhập, checkout và webhook hoạt động; giữ log/audit để điều tra nguyên nhân.

## Giới hạn phạm vi

Provider Catalog hiện chỉ lưu metadata/cấu hình provider; việc thêm Vercel, Render hoặc Cloudflare Tunnel ở đó không tự tạo deployment, đổi DNS hay bật công tắc routing. Tự động hóa các bước trên cần adapter backend, quyền provider tối thiểu, quản lý secrets, job nền có trạng thái, health check, audit và quy trình rollback được triển khai riêng.
