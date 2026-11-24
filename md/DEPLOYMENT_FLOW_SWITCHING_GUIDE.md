# Hướng dẫn chuyển luồng triển khai

## Mục tiêu

Tài liệu này mô tả các mô hình triển khai của cửa hàng và cách chuẩn bị chuyển đổi an toàn:

1. **Luồng Cloudflare Tunnel**: frontend và backend chạy trên máy chủ hiện tại, được công khai qua Cloudflare Tunnel.
2. **Luồng Vercel + Render**: frontend chạy trên Vercel, backend chạy trên Render.
3. **Luồng Netlify + Railway**: frontend chạy trên Netlify, backend chạy trên Railway; đây là một cặp nền tảng thay thế cần được kiểm thử riêng.

Mục tiêu vận hành là giữ hostname công khai ổn định và chuyển đồng bộ cả frontend lẫn API giữa các luồng. Chỉ đổi biến môi trường ở frontend hoặc thêm hostname riêng lẻ không tạo ra cơ chế chuyển toàn bộ traffic.

## Trạng thái hiện tại

- Frontend Next.js nằm trong `online-store-frontend`.
- `online-store-frontend/next.config.ts` rewrite `/api/*` tới `NEXT_PUBLIC_API_BASE_URL`.
- Giá trị mặc định tại `online-store-frontend/src/config.ts` là `https://backend.manln.online`.
- Một Cloudflare Tunnel tên `online-store` hiện có hai route ứng dụng: `manln.online` → `http://127.0.0.1:3000` (frontend) và `backend.manln.online` → `http://127.0.0.1:5000` (backend); DNS `cdn.manln.online` dùng R2. Không thay đổi DNS, Tunnel ingress, hostname hoặc port trong quá trình chuẩn bị các nền tảng khác.
- Provider Catalog có metadata cho Vercel, Render và Cloudflare Tunnel nhưng chưa tự deploy ứng dụng hay quản lý routing.
- Nếu Cloudflare Worker đứng trước `manln.online`, cần một hostname origin riêng trỏ trực tiếp tới frontend Tunnel; Worker không được forward về chính hostname production đang chạy Worker vì sẽ tạo vòng lặp. Chưa tạo hostname này.
- Chưa có công tắc chuyển luồng production. Các bước ở tài liệu này là quy trình chuẩn bị/đề xuất, không phải thao tác đã được tự động hóa.

## Mô hình đích

| Chế độ | Frontend | Backend/API | DNS và hostname production |
| --- | --- | --- | --- |
| Cloudflare Tunnel | Frontend hiện tại trên máy chủ | Backend hiện tại qua Tunnel | Giữ tuyến hiện hành |
| Vercel + Render | Dự án Vercel, Root Directory `online-store-frontend` | Dịch vụ Render | Giữ hostname công khai; lớp điều phối chuyển traffic sang frontend Vercel |
| Netlify + Railway | Site Netlify, thư mục publish/build theo cấu hình Next.js đã kiểm chứng | Dịch vụ Railway | Giữ hostname công khai; lớp điều phối chuyển traffic sang frontend Netlify |

Trong chế độ Vercel + Render, Vercel cần được build với `NEXT_PUBLIC_API_BASE_URL` trỏ tới URL backend Render phù hợp. Vercel rewrite `/api/*` tới backend đó. Không dùng URL Render giả định; lấy URL thực tế từ dịch vụ Render đã tạo.

Trong chế độ Netlify + Railway, cấu hình `NEXT_PUBLIC_API_BASE_URL` của frontend tới URL Railway staging/production tương ứng. Trước khi xem đây là phương án deploy được, xác nhận Netlify build adapter/runtime hỗ trợ các tính năng Next.js đang dùng và proxy/rewrite `/api/*` hoạt động đúng; không giả định hai nền tảng xử lý Next.js giống Vercel.

## Các bước chuẩn bị an toàn

### 1. Giữ nguyên production hiện tại

- Không xóa, sửa hoặc thay thế DNS record đang phục vụ `manln.online`, `www.manln.online` hay `backend.manln.online`.
- Không đổi nameserver, Tunnel ingress, origin service hoặc port.
- Có thể dùng domain mặc định `*.vercel.app` để kiểm tra frontend Vercel hoặc domain `*.netlify.app` do Netlify cấp để kiểm tra frontend Netlify; các domain này chưa chuyển traffic production từ Cloudflare.
- Có thể dùng URL staging do Render cấp (thường có dạng `https://<tên-dịch-vụ>.onrender.com`) hoặc URL public do Railway cấp để kiểm tra riêng backend; dùng chính URL hiện trong dashboard nhà cung cấp, không cần đổi DNS production.
- Ghi nhận cấu hình hiện tại và người có quyền rollback trước khi thay đổi routing.

### 2. Chuẩn bị candidate Vercel + Render

- Theo yêu cầu vận hành, mọi backend dùng cùng `MONGO_URI` production; không tạo database khác.
- Trước khi cấp `MONGO_URI` production cho một Preview/candidate deployment, phải bảo vệ preview và áp dụng read-only gate phía backend. Hiện chưa xác nhận có chế độ read-only như vậy; không nối Preview vào production API/database cho tới khi cơ chế này được triển khai và kiểm thử.
- Tạo candidate backend Render và frontend Vercel Preview từ nhánh phù hợp; frontend dùng Root Directory `online-store-frontend`. Lấy URL do từng dashboard cấp.
- Khi đã có read-only gate, cấu hình `NEXT_PUBLIC_API_BASE_URL` của Vercel Preview thành URL candidate Render; không cho candidate thực hiện mutation trên dữ liệu production.
- Kiểm thử riêng cách Vercel xử lý SSR, image optimization, rewrites/proxy `/api/*`, cookies và websocket; nếu tính năng nào không tương thích thì dừng trước khi gắn hostname production.
- Không đưa token, secret, connection string hoặc giá trị biến môi trường nhạy cảm vào tài liệu, Git, log hay ảnh chụp.

### 3. Kiểm thử candidate có quyền production tối thiểu

Chỉ sau khi read-only gate và giới hạn truy cập được xác minh, kiểm tra trên URL Preview/candidate:

- Các trang đọc dữ liệu, ảnh, nội dung đa ngôn ngữ, health endpoint và API GET cần thiết.
- Xác thực/cookie chỉ trong phạm vi đã phê duyệt; không tạo người dùng hoặc thay đổi trạng thái dữ liệu thật.
- Không chạy checkout, tạo đơn, thay tồn kho, upload ghi dữ liệu, seed, migration, gửi email hoặc thanh toán trên Preview.
- Kiểm tra Socket.IO, sitemap và URL trực tiếp backend ở chế độ không ghi.
- Theo dõi log của Vercel/Render; nếu có request mutation tới database production, dừng candidate và thu hồi quyền truy cập cho tới khi nguyên nhân được khắc phục.
- Chỉ chạy kiểm thử ghi có kiểm soát sau khi luồng production đã được chuyển và có xác nhận rõ ràng về tác động.

Frontend có một số luồng sử dụng `BACKEND_URL` trực tiếp ngoài các request `/api/*` (ví dụ URL ảnh và Socket.IO). Vì vậy chỉ đổi rewrite chưa đủ để xác nhận toàn bộ ứng dụng hoạt động trên backend Render hoặc Railway; cần kiểm thử từng luồng và cấu hình build/runtime tương ứng.

## Cơ chế chuyển toàn bộ cần triển khai

Để có một thao tác chuyển đồng bộ, cần một lớp điều phối được kiểm soát (ví dụ Cloudflare Worker hoặc cơ chế routing tương đương) đặt trước hostname production. Lớp này phải có các chế độ rõ ràng:

- **`tunnel`**: chuyển website tới frontend hiện tại; API và các dịch vụ liên quan tiếp tục dùng backend/Tunnel hiện tại.
- **`vercel-render`**: chuyển website tới frontend Vercel; API `/api/*` của frontend Vercel được rewrite tới backend Render.
- **`netlify-railway`**: chuyển website tới frontend Netlify; API `/api/*` được proxy tới backend Railway theo cấu hình đã kiểm thử.

Công tắc phải áp dụng một phiên bản cấu hình duy nhất cho cả frontend/API, có kiểm tra trước khi kích hoạt, khóa tránh hai thao tác đồng thời, ghi audit, health check sau chuyển và rollback tự động về chế độ trước nếu kiểm tra thất bại. Không cập nhật một nửa luồng hoặc cho nhiều backend cùng nhận traffic production ngoài kế hoạch.

### Nút dừng dịch vụ Tunnel

- Nút Super Admin tạo job cho thao tác cố định tương đương `npm run deployment:stop-tunnel-apps`; không nhận command, script path, service name hoặc port từ request.
- API chỉ tạo job có kiểu hành động allowlist và ghi audit. Runner WinSW độc lập lấy job, chạy script npm cố định và chỉ được phép dừng `LaptopStoreFrontend` cùng `LaptopStoreBackend`; không dừng service theo port và không dừng `LaptopStoreTunnel`.
- Preflight phải xác nhận frontend Vercel, backend Render và routing đích khỏe mạnh trước nút xác nhận cuối cùng. Job phải có ID, trạng thái, chống chạy trùng và kết quả để UI theo dõi qua Vercel + Render sau khi các service cũ đã dừng.
- Runner phải chạy ngoài frontend/backend bị dừng; job queue và job status cũng phải nằm ở control plane độc lập (không phụ thuộc backend Tunnel đang bị dừng). Quyền Windows và credential job queue được giới hạn tối thiểu. Không để backend API tự chạy shell/npm rồi tự dừng.
- Nút chỉ sẵn sàng sau khi URL/routing Vercel + Render đã cấu hình và kiểm thử. Runner chưa được cài hoặc preflight thất bại thì không gửi lệnh stop.

Trước khi bật cơ chế này, cần có URL đã xác minh cho frontend/backend Vercel + Render; một hostname origin riêng cho frontend Tunnel; và một hostname staging cho Worker. Phải kiểm tra cách chuyển tiếp `Host`, HTTPS/TLS, header, cookie, websocket, body upload, timeout, cache và các đường dẫn callback. Không tạo Worker route production hay chỉnh DNS chỉ dựa trên ví dụ trong tài liệu; cần kiểm thử trên hostname staging trước. Không gửi token/secret qua chat hoặc ghi vào Markdown.

## Quy trình chuyển production sau khi đã có điều phối

1. Xác nhận stack đích khỏe mạnh, dùng đúng `MONGO_URI` production và đúng phiên bản ứng dụng; candidate chỉ được ghi dữ liệu sau khi trở thành luồng production được chọn.
2. Xem bản diff cấu hình routing: chế độ hiện tại, chế độ đích, hostname/origin bị tác động và các callback liên quan.
3. Xác nhận không có deploy/switch khác đang chạy; lưu lại phiên bản cấu hình để rollback.
4. Bắt đầu cửa sổ bảo trì, chuyển đồng bộ cả `manln.online` (frontend) lẫn `backend.manln.online` (backend/API) sang Vercel + Render, rồi health-check cả hai hostname.
5. Admin xác nhận thao tác dừng. API tạo một job; runner WinSW độc lập gọi đúng script cố định để dừng `LaptopStoreFrontend` và `LaptopStoreBackend` cùng một lượt. Job giữ ID/trạng thái để UI Vercel + Render theo dõi.
6. Xác nhận hai service cũ đã dừng và frontend/backend mới vẫn khỏe; giữ `LaptopStoreTunnel` cùng cấu hình service cũ cho rollback.
7. Kiểm tra health, đăng nhập và các thao tác đọc trước; chỉ tạo đơn thử hoặc thao tác ghi trên production sau khi được phê duyệt rõ ràng, có phạm vi/đơn test đã định trước và có cách xử lý dữ liệu phát sinh.
8. Nếu routing hoặc health check thất bại, dùng runner khởi động lại cả frontend/backend cũ, trả routing về phiên bản trước và xác nhận lại hệ thống cũ hoạt động.

Không coi việc API Cloudflare Tunnel còn kết nối là bằng chứng frontend Vercel/Render hoặc Netlify/Railway đã hoạt động, hoặc ngược lại.

## DNS, callback và rollback

- DNS là sổ định tuyến theo hostname; chỉ một cấu hình routing có hiệu lực cho một hostname tại một thời điểm. Giữ Cloudflare quản lý zone không đồng nghĩa mọi hostname phải trỏ tới cùng dịch vụ.
- Không xóa record của `backend.manln.online` khi chuyển frontend. Không thay DNS apex/`www` nếu chưa có routing layer và kế hoạch rollback được kiểm thử.
- Trước khi đổi backend production, xác nhận URL webhook PayPal/VNPay và các callback bên thứ ba đang tới backend có thể xác minh chữ ký và ghi nhận giao dịch. Không đổi callback trước khi backend đích sẵn sàng.
- Rollback bằng cách khôi phục phiên bản routing trước đó; không xóa dịch vụ hay record đang hoạt động để xử lý sự cố.
- Sau rollback, xác nhận frontend/API, đăng nhập, checkout và webhook hoạt động; giữ log/audit để điều tra nguyên nhân.

## Giới hạn phạm vi

Provider Catalog hiện chỉ lưu metadata/cấu hình provider; metadata Vercel, Render hoặc Cloudflare Tunnel không tự tạo deployment, đổi DNS hay bật công tắc routing. Nếu bổ sung Netlify/Railway vào catalog thì điều đó cũng không tự tích hợp deploy. Tự động hóa các bước trên cần adapter backend, quyền provider tối thiểu, quản lý secrets, job nền có trạng thái, health check, audit và quy trình rollback được triển khai riêng.
