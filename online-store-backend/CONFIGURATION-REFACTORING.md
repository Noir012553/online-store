# Kế hoạch chuẩn hóa cấu hình

## Mục tiêu

Tách các giá trị cấu hình vận hành khỏi logic ứng dụng, tránh hard-code rải rác và giúp thay đổi theo môi trường development, staging hoặc production mà không sửa nghiệp vụ.

Không chuyển các hằng số nghiệp vụ, dữ liệu seed hoặc giá trị giao diện sang runtime config nếu chúng không cần thay đổi theo môi trường.

## Cấu trúc cấu hình

Backend sử dụng thư mục:

```text
online-store-backend/src/config/
```

Các nhóm cấu hình mục tiêu:

```text
src/config/
├── database.js       # MongoDB pool, timeout, retry và thao tác DB
├── server.js         # port, host, startup retry, shutdown
├── cors.js           # origin, method, header và credentials
├── rateLimits.js     # giới hạn request theo endpoint
├── uploads.js        # thư mục, dung lượng và loại file
├── integrations.js   # Redis, Cloudinary, VNPay, GHN, Cloudflare AI
├── mongoConfig.js    # cấu hình MongoDB dùng chung
└── mongoDns.js       # khởi tạo DNS cho MongoDB SRV
```

Frontend nên có cấu hình runtime dùng chung tại:

```text
online-store-frontend/src/config/runtime.ts
```

## Hiện trạng đã thực hiện

- `src/config/mongoConfig.js` đã được tạo.
- `mongooseOptions` được dùng chung bởi app và seed.
- Danh sách DNS fallback lấy từ `MONGO_DNS_SERVERS`.
- Không còn hard-code riêng DNS trong `mongoDns.js`.
- Báo cáo translation lấy thống kê động từ MongoDB.
- Phần trăm báo cáo không còn tạo `NaN%` khi không có dữ liệu.

## Cấu hình backend cần chuẩn hóa

### Ưu tiên cao

| Nhóm | Vị trí hiện tại | Nội dung |
| --- | --- | --- |
| Database | `src/config/mongoConfig.js`, `src/utils/mongooseUtils.js` | pool, timeout, retry, DB operation timeout |
| Server | `src/app.js` | port, host, startup retry, shutdown timeout |
| CORS | `src/app.js` | allowed origins, methods, headers, credentials |
| Rate limit | `src/middleware/rateLimitMiddleware.js` | window và max request theo endpoint |

### Ưu tiên trung bình

| Nhóm | Vị trí hiện tại | Nội dung |
| --- | --- | --- |
| Upload | `src/config/multerConfig.js` | thư mục, kích thước, MIME và extension |
| Integrations | `src/services/` | URL, timeout và tùy chọn Redis, VNPay, GHN, Cloudinary, AI |
| Translation jobs | `src/services/translationSeederHelper.js` | batch size, retry, delay, timeout |
| Swagger | `src/config/swagger.js` | URL server theo môi trường |

### Frontend

| Vị trí | Nội dung cần gom |
| --- | --- |
| `src/config.ts` | backend URL, API path và port |
| `next.config.ts` | rewrite destination, allowed origins |
| `src/lib/api.ts` | request timeout và cache TTL |
| `src/lib/socket.ts` | socket URL và reconnect policy |
| `src/pages/return.tsx` | số lần và khoảng thời gian polling |
| `src/components/checkout/Step3Payment.tsx` | payment feature switch và timeout |

## Các giá trị giữ trong code

Các giá trị sau là nghiệp vụ hoặc dữ liệu ứng dụng, không nên chuyển thành environment config:

- payment method enum trong model Order;
- danh sách category, seed data và nội dung banner;
- danh sách brand cần bảo toàn khi dịch;
- ngưỡng và công thức đánh giá chất lượng bản dịch;
- emoji, label và hằng số giao diện.

## Quy tắc cấu hình

1. Giá trị thay đổi theo môi trường phải lấy từ config hoặc environment variable.
2. Không đưa secret vào repository hoặc tài liệu Markdown.
3. Config phải được nạp sau `dotenv.config()`.
4. App và seed phải dùng cùng một config module khi chia sẻ kết nối MongoDB.
5. Config chỉ chứa giá trị và parsing cần thiết; logic nghiệp vụ vẫn nằm ở service/controller.
6. Với danh sách, dùng chuỗi phân tách bằng dấu phẩy trong environment variable và parse tại một nơi duy nhất.

## Biến môi trường MongoDB hiện tại

```env
MONGO_URI=<mongodb-connection-string>
MONGO_DNS_SERVERS=<dns-server-1>,<dns-server-2>
```

`MONGO_DNS_SERVERS` là tùy chọn. Khi không có biến này, ứng dụng sử dụng system resolver và báo lỗi rõ ràng nếu không thể phân giải MongoDB SRV.

## Thứ tự refactor đề xuất

1. Hoàn thiện `database.js`, `server.js`, `cors.js` và `rateLimits.js`.
2. Chuyển cấu hình upload và integration.
3. Chuẩn hóa runtime config cho frontend.
4. Chạy kiểm tra cú pháp và test backend/frontend sau mỗi nhóm thay đổi.
5. Không chuyển các hằng số nghiệp vụ chỉ vì chúng đang có dạng literal trong code.
