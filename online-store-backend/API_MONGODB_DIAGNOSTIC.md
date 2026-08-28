# Chẩn đoán lỗi API timeout và MongoDB

## 1. Phạm vi sự cố

Sự cố xảy ra khi chạy frontend bằng `npm start` với Next.js production server. Homepage và một số API trả lỗi:

```text
socket hang up
ECONNRESET
HTTP 530 / Cloudflare error 1033
```

Các endpoint bị ảnh hưởng:

- `/api/products`
- `/api/products/top/rated`
- `/api/products/featured/list`
- `/api/banners`

Frontend gọi API thông qua rewrite trong `online-store-frontend/next.config.ts:49-67`, chuyển tiếp `/api/*` tới backend `backend.manln.online`.

## 2. Triệu chứng ban đầu

Next.js ghi nhận:

```text
Failed to proxy https://backend.manln.online/api/products/... Error: socket hang up
code: ECONNRESET
```

Giao diện homepage hiển thị trạng thái không tải được sản phẩm.

`socket hang up` ở đây là lỗi kết nối HTTP/TCP giữa Next.js proxy và upstream backend. Đây không phải lỗi WebSocket Socket.IO của giao diện.

## 3. Kết quả kiểm tra Cloudflare One/WARP

Đã kiểm tra cùng các API khi Cloudflare One/WARP bật và tắt.

### Khi WARP bật

```text
Status update: Connected
Network: healthy
WinHTTP proxy: Direct access
```

Kết quả chính:

- `/api/products`: timeout sau khoảng 25 giây, `status=000`.
- `/api/products/featured/list`: `200`, khoảng 5,46 giây.
- `/api/products/top/rated`: timeout sau khoảng 25 giây, `status=000`.
- `/api/banners`: `200`, khoảng 2,71 giây.
- Local Next proxy: `200`, khoảng 4,35 giây.

### Khi WARP tắt

```text
Status update: Disconnected
Reason: Settings Changed
WinHTTP proxy: Direct access
```

Kết quả chính:

- `/api/products`: timeout sau khoảng 25 giây, `status=000`.
- `/api/products/featured/list`: `200`, khoảng 13,92 giây.
- `/api/products/top/rated`: timeout sau khoảng 25 giây, `status=000`.
- `/api/banners`: `200`, khoảng 1,18 giây.
- Local Next proxy: `200`, khoảng 5,30 giây.

### Kết luận về WARP

WARP có ảnh hưởng tới thời gian phản hồi ở một số lần đo, nhưng không phải nguyên nhân gốc:

- Bật hoặc tắt WARP đều làm `/api/products` và `/api/products/top/rated` timeout.
- `/api/banners` hoạt động ở cả hai trạng thái.
- Local Next proxy vẫn trả `200` với request featured.
- DNS và TCP 443 đều kết nối được.

Do đó không nên chỉ sửa frontend proxy hoặc bật/tắt WARP để xử lý sự cố.

## 4. Kết quả đo thời gian API

Đã chạy nhiều lần bằng `curl.exe` với thời gian tối đa 30 giây.

| Endpoint | Kết quả quan sát được |
| --- | --- |
| `/api/products?pageSize=10` | Timeout 30 giây hoặc trả 503 sau khoảng 21 giây |
| `/api/products/featured/list?pageSize=3` | `200`, khoảng 2,3–11,6 giây; có lần 503 sau khoảng 26 giây |
| `/api/products/top/rated` | `500` sau khoảng 20–26 giây hoặc timeout 30 giây |
| `/api/banners` | `200`, khoảng 0,67–2,71 giây |
| Local Next proxy featured | `200`, khoảng 4,35–5,30 giây |

Một lần gọi trực tiếp `top/rated` trả về:

```http
HTTP/1.1 500 Internal Server Error
```

```json
{
  "success": false,
  "message": "Lỗi khi lấy sản phẩm được đánh giá cao",
  "error": "Database operation timed out after 20000ms"
}
```

Điều này xác nhận backend đã nhận request nhưng không hoàn tất xử lý database trong thời gian cho phép.

## 5. Kiểm tra DNS và TCP MongoDB

Đã kiểm tra bản ghi SRV:

```powershell
Resolve-DnsName "_mongodb._tcp.cluster0.7pxhir8.mongodb.net" -Type SRV
```

Kết quả trả về đủ ba MongoDB Atlas node:

- `ac-24ykmxh-shard-00-00.7pxhir8.mongodb.net`
- `ac-24ykmxh-shard-00-01.7pxhir8.mongodb.net`
- `ac-24ykmxh-shard-00-02.7pxhir8.mongodb.net`

Đã kiểm tra TCP port `27017` tới cả ba node:

```text
TcpTestSucceeded: True
```

Điều này cho thấy:

- DNS SRV hiện phân giải được.
- Các node MongoDB hiện có thể truy cập ở tầng TCP.
- Không có bằng chứng về việc port 27017 bị firewall chặn hoàn toàn.

Tuy nhiên, kiểm tra TCP không xác nhận được MongoDB TLS handshake, authentication hoặc độ ổn định dài hạn.

## 6. Kiểm tra MongoDB ping

Đã chạy kiểm tra MongoDB thực tế bằng `mongoose` và không in `MONGO_URI`.

Kết quả 10 lần ping liên tiếp trên cùng connection:

```text
ping=1 OK 105ms
ping=2 OK 429ms
ping=3 OK 93ms
ping=4 OK 102ms
ping=5 OK 103ms
ping=6 OK 103ms
ping=7 OK 104ms
ping=8 OK 431ms
ping=9 OK 107ms
ping=10 OK 97ms
```

Kết luận:

- `MONGO_URI` hợp lệ tại thời điểm kiểm tra.
- TLS và authentication thành công.
- MongoDB phản hồi lệnh ping ổn định.
- Kết nối mạng MongoDB cơ bản không bị hỏng liên tục.

Một lệnh ping nhẹ không đại diện cho các truy vấn catalog, translation, category và currency mà API thực hiện.

## 7. Log backend chứng minh sự cố

Backend ghi nhận các lỗi sau trong lúc xử lý API:

```text
[DB_WARN] MongoDB disconnected, attempting reconnect...
querySrv ECONNREFUSED _mongodb._tcp.cluster0.7pxhir8.mongodb.net
MongoNetworkError: read ECONNRESET
MongoNetworkTimeoutError: connection ...:27017 timed out
```

Các lỗi trên xảy ra trước hoặc đồng thời với lỗi API:

```text
[PRODUCT_TOP_RATED] Error: Database operation timed out after 20000ms
```

Chuỗi lỗi được xác định:

```text
MongoDB connection/query gặp vấn đề
        ↓
Backend chờ database quá lâu
        ↓
Backend trả 500/503 hoặc không trả kịp
        ↓
Cloudflare Tunnel/Next.js đóng upstream socket
        ↓
Frontend thấy socket hang up / ECONNRESET
```

## 8. Nguyên nhân trong code backend

### `/api/products/top/rated`

Trong phiên bản cũ, route tại `src/controllers/productController.js:1271-1305` thực hiện:

1. Quét toàn bộ product với `isDeleted=false`.
2. Kiểm tra visibility dựa trên translation của nhiều ngôn ngữ.
3. Sau đó mới sort theo rating.
4. Cuối cùng mới `limit(3)`.

Cách xử lý này khiến một API chỉ cần 3 sản phẩm vẫn phải xử lý toàn bộ catalog.

### `/api/products`

Route tại `src/controllers/productController.js:634-648` cũng kiểm tra visibility của toàn bộ tập kết quả trước khi phân trang. Request `pageSize=100` làm chi phí truy vấn và dịch tăng mạnh.

### Homepage

Homepage gọi nhiều request sản phẩm, bao gồm request sản phẩm chính, request deal và request riêng cho từng category. Khi nhiều request chạy gần nhau, connection pool MongoDB có thể bị chờ hoặc các query chậm bị xếp hàng.

## 9. Thay đổi xử lý đã thực hiện ở local

### Backend

Trong `src/controllers/productController.js`:

- Giảm số candidate của featured endpoint.
- Dùng sort riêng cho nhánh `hasDeal` để tránh sort không phù hợp với truy vấn deal.
- Thêm `maxTimeMS` cho product query.
- Không đọc exchange rates khi sản phẩm đã cùng currency hiển thị.
- Tối ưu `top/rated` để chỉ lấy tối đa một nhóm candidate nhỏ trước khi kiểm tra visibility, thay vì quét toàn bộ catalog.

Trong `src/utils/mongooseUtils.js`:

- `withTimeout()` dọn timer sau khi operation hoàn tất.

### Frontend

Trong `src/lib/api.ts`:

- Không tự retry lần hai cho `/products/featured/list` khi backend trả 500/502/503/504.
- Không retry lần hai khi endpoint featured gặp lỗi transport như `ECONNRESET`.

Việc tắt retry giúp tránh nhân đôi tải khi backend đang quá tải.

## 10. Trạng thái kiểm thử code

- Kiểm tra cú pháp các file backend đã sửa: thành công.
- Frontend TypeScript và production compilation theo log đã cung cấp: thành công.
- Backend test suite trong một môi trường kiểm tra không chạy được do môi trường đó thiếu package `dotenv`; không phải lỗi assertion của test.
- Endpoint production vẫn trả timeout `20000ms` trong log, cho thấy backend đang chạy chưa chắc đã nhận các thay đổi local mới.

## 11. Kết luận cuối cùng

Đây không phải sự cố giao diện đơn thuần và cũng không phải lỗi WARP đơn thuần.

Nguyên nhân chính là sự kết hợp của:

1. Truy vấn backend quá nặng, đặc biệt với `/api/products` và `/api/products/top/rated`.
2. Kiểm tra translation/visibility trên quá nhiều sản phẩm và ngôn ngữ.
3. Nhiều request homepage chạy gần như đồng thời.
4. MongoDB connection/query có thời điểm bị reset hoặc timeout.
5. Backend không trả response kịp thời, khiến Cloudflare Tunnel và Next.js phát sinh `ECONNRESET` hoặc `socket hang up`.

## 12. Việc cần làm tiếp theo

1. Đảm bảo backend đang chạy đúng phiên bản code đã tối ưu.
2. Dừng backend cũ và khởi động lại sau khi MongoDB ping ổn định.
3. Kiểm tra backend không còn log `MongoDB disconnected`, `querySrv ECONNREFUSED` hoặc `MongoNetworkTimeoutError`.
4. Chạy lại API `top/rated`, `products` và `featured` ít nhất 5 lần liên tiếp.
5. Kiểm tra index MongoDB cho các truy vấn product, rating, deal và translation cache.
6. Nếu vẫn timeout dù MongoDB ping ổn định, tiếp tục đo từng stage backend: product query, visibility translation, localization và currency formatting.

Mục tiêu vận hành:

```text
/api/products/top/rated     < 2 giây
/api/products               < 3 giây
/api/products/featured/list < 3 giây ổn định
Không còn 500, 503, status=000 hoặc ECONNRESET
```
