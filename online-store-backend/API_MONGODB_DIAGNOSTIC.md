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

## 10. Cập nhật triển khai sau khi debug

Các thay đổi dưới đây đã được áp dụng sau khi test local cho thấy request product có thể treo khoảng 45 giây dù MongoDB đã `readyState=1`.

### 10.1. Ngăn startup race trong `src/app.js`

Đã thêm cờ `startupReady` để phân biệt MongoDB đã kết nối với toàn bộ backend đã khởi tạo xong.

- API chỉ đi qua `requireDatabase` khi MongoDB đang connected và startup/seed đã hoàn tất.
- `startupReady` được đặt `true` sau khi hoàn tất seed, resume pending language setup, migration và scheduler initialization.
- Khi MongoDB disconnect, `startupReady` được đặt lại `false`.
- Request trong lúc startup không còn chạy vào controller product khi database mới chỉ ở trạng thái `connecting`.

Thay đổi này xử lý lỗi:

```text
readyState: 2
[API_DEBUG] database:blocked
HTTP 503
```

### 10.2. Giới hạn và rút gọn query translation trong `src/services/translationHelper.js`

Các query translation cache liên quan tới visibility và product overlay đã được cập nhật:

- Thêm projection, chỉ lấy các field cần thiết thay vì hydrate toàn bộ translation document.
- Thêm `maxTimeMS(5000)` để MongoDB chủ động dừng query quá lâu.
- Bọc query bằng `withTimeout(..., 7000)` để backend không chờ vô hạn.
- Áp dụng cho:
  - `ProductCatalogTranslationCache` dùng trong storefront visibility.
  - `LiveTranslationCache` dùng cho legacy fallback.
  - Product translation overlay.

Mục tiêu là giảm kích thước dữ liệu truyền qua Mongoose và tránh tình trạng query translation giữ connection quá lâu.

### 10.3. Giới hạn query category trong `src/services/categoryLocalizationService.js`

Query `CategoryCatalogTranslationCache` đã được cập nhật với:

```text
projection: entityId, name, description
maxTimeMS: 5000ms
application timeout: 7000ms
```

Category localization không còn được phép chờ vô hạn khi cache translation gặp vấn đề.

### 10.4. Bảo vệ product query trong `src/controllers/productController.js`

Đã cập nhật các query product:

- Product visibility scan có `maxTimeMS(10000)` và application timeout 12 giây.
- Product query sau khi visibility-filter có `maxTimeMS(10000)` và application timeout 12 giây.

Các thay đổi này không thay đổi nghiệp vụ lọc sản phẩm hoặc thứ tự phân trang; chúng chỉ giới hạn thời gian database được phép xử lý.

### 10.5. Cập nhật unit test mock

Mock query trong các test translation/category đã được cập nhật để hỗ trợ chain Mongoose mới:

```text
.select().maxTimeMS().lean()
```

Không thay đổi các kỳ vọng nghiệp vụ của test.

### 10.6. Lý do chưa thêm index mới

MongoDB Atlas `explain("executionStats")` cho thấy:

```text
topRated:          4ms, IXSCAN → FETCH → SORT
translationCache:  8ms, IXSCAN → FETCH
products:          IXSCAN trên isDeleted_1
```

Do đó chưa thêm index mới một cách mù quáng. Bottleneck đo được nằm ở toàn bộ helper/Mongoose visibility pipeline, không nằm ở thời gian execution của query MongoDB thô.

## 11. Trạng thái kiểm thử code

- Kiểm tra cú pháp các file backend đã sửa: thành công.
- Frontend TypeScript và production compilation theo log đã cung cấp: thành công.
- Backend test suite trong một môi trường kiểm tra không chạy được do môi trường đó thiếu package `dotenv`; không phải lỗi assertion của test.
- Các test dưới đây được thực hiện bằng PowerShell và Node.js inline, không tạo file diagnostic mới.

### 11.1. Đo trực tiếp production bằng PowerShell

Đã đo 5 lần các endpoint production `https://backend.manln.online` với timeout client 35 giây:

| Endpoint | Kết quả | Thời gian quan sát được |
| --- | --- | --- |
| `/api/products?pageSize=10` | 0/5 thành công; 4 lần transport timeout, 1 lần HTTP 503 | khoảng 20–35 giây |
| `/api/products/top/rated` | 0/5 thành công; 2 lần HTTP 500, 3 lần transport timeout | khoảng 20–35 giây |
| `/api/products/featured/list?pageSize=3` | 5/5 HTTP 200 | khoảng 3,0–10,0 giây; trung bình khoảng 4,7 giây |
| `/api/banners` | 5/5 HTTP 200 | khoảng 0,6–21,6 giây; trung bình bị kéo lên bởi một lần chậm |

Một response production `top/rated` trả về:

```json
{
  "success": false,
  "message": "Lỗi khi lấy sản phẩm được đánh giá cao",
  "error": "Database operation timed out after 20000ms"
}
```

Production cũng từng trả Cloudflare error `1033`. Lỗi này cho thấy Cloudflare Tunnel không có connector hoạt động tại thời điểm kiểm tra; nó là vấn đề deployment/tunnel riêng với lỗi query backend.

### 11.2. Kiểm tra backend local sau khi MongoDB và seed hoàn tất

Backend local kết nối thành công tới MongoDB Atlas:

```text
[MONGO_DEBUG] event:connected
[MONGO_DEBUG] connect:mongoose-resolved
[MONGO_DEBUG] connect:ready
readyStateName: 'connected'
```

Các tác vụ khởi tạo cũng hoàn tất:

```text
[SEED] Translations seeded successfully
[SEED] Brands seeded successfully
[SEED] Currency and Exchange Rates seeded successfully
[SEED] Languages seeded successfully
[ExchangeRateScheduler] Cập nhật thành công: 0 tỷ giá
```

Health check local:

```text
Test-NetConnection localhost -Port 5000
TcpTestSucceeded: True
```

Sau khi MongoDB đã ở `readyState=1` và seed hoàn tất, kết quả API local là:

| Endpoint | Kết quả local | Thời gian quan sát được |
| --- | --- | --- |
| `/api/products/featured/list?pageSize=3&lang=en` | HTTP 200 | khoảng 4,0–5,0 giây ở server; PowerShell khoảng 8,5 giây |
| `/api/products/top/rated?lang=en` | không gửi response trong 45 giây | backend log khoảng 42,9 giây; client timeout khoảng 46,5 giây |
| `/api/products?pageSize=1` | không gửi response trong 45 giây | backend log khoảng 45,0 giây; client timeout khoảng 46,7 giây |
| `/api/banners` | HTTP 200 | khoảng 0,6 giây trong lần kiểm tra gần nhất |

Trong log của hai request bị treo có dạng:

```text
[API_DEBUG] request:start ... mongoReadyState: 1
[API_DEBUG] request:close ... headersSent: false writableEnded: false
```

`status: 200` trong log `request:close` không chứng minh request thành công; đây là status mặc định vì backend chưa gửi header/response khi client đóng kết nối.

Một request chạy trước khi MongoDB kết nối xong từng bị chặn như sau:

```text
mongoReadyState: 2
[API_DEBUG] database:blocked
status: 503
```

Đây là startup race riêng. Nó đã được loại trừ khỏi các test timeout sau khi chờ `connect:ready` và toàn bộ seed hoàn tất.

### 11.3. Kiểm tra query và index bằng MongoDB Atlas qua Mongoose

Query `explain` read-only trên database `online-store` cho kết quả:

```json
{
  "candidateCount": 30,
  "topRated": {
    "executionTimeMillis": 4,
    "totalKeysExamined": 557,
    "totalDocsExamined": 557,
    "nReturned": 30,
    "stages": ["SORT", "FETCH", "IXSCAN"]
  },
  "translationCache": {
    "executionTimeMillis": 8,
    "totalKeysExamined": 270,
    "totalDocsExamined": 240,
    "nReturned": 240,
    "stages": ["FETCH", "IXSCAN"]
  }
}
```

Query visibility product sử dụng index:

```text
indexName: isDeleted_1
stage: IXSCAN → FETCH
```

Các kết quả này cho thấy MongoDB Atlas không mất hàng chục giây để thực thi các query thô và không có bằng chứng hiện tại cho thấy thiếu index product là nguyên nhân trực tiếp.

### 11.4. Đo từng stage của flow `top/rated`

Đã chạy diagnostic trực tiếp bằng Mongoose:

```text
mongo.connect                         OK
1.product.candidates                  OK, 1.359 giây, 30 candidate
2.visibility.translation-cache        OK, 17.057 giây
3.product.details                     diagnostic error sau 200 ms
```

Stage thứ ba của diagnostic bị lỗi vì script inline chưa đăng ký model `Category` trước khi gọi `populate('category')`:

```text
Schema hasn't been registered for model "Category"
```

Đây là lỗi của script diagnostic, không phải kết luận rằng production thiếu model `Category`.

Điểm đáng chú ý là query `explain` translation cache chỉ báo 8 ms, trong khi toàn bộ helper `getStorefrontVisibleProductIds()` mất 17 giây. Vì vậy cần tách riêng thời gian lấy dữ liệu qua Mongoose, chờ connection pool, deserialize document và vòng lặp kiểm tra visibility; không thể chỉ nhìn vào `executionTimeMillis` của MongoDB.

### 11.5. Memory và cấu hình runtime

Health check local đã trả:

```json
{
  "status": "critical",
  "heapUsedMB": "60.43",
  "heapTotalMB": "64.50",
  "heapPercent": "93.7",
  "rssMB": "82.51"
}
```

Đây là dấu hiệu áp lực heap cao và có thể làm tăng thời gian garbage collection, nhưng chưa đủ để kết luận là nguyên nhân duy nhất.

Production health response cũng từng báo:

```json
"environment": "development"
```

Production cần được kiểm tra lại cấu hình `NODE_ENV` và cách deploy. Đây có thể làm thay đổi logging/runtime, nhưng chưa phải bằng chứng trực tiếp cho timeout query.

## 12. Kết luận cập nhật

Đã xác nhận đây không phải sự cố frontend đơn thuần, cũng không phải lỗi WARP đơn thuần.

Các kết luận đã có bằng chứng:

1. Backend local và MongoDB Atlas có thể kết nối thành công.
2. Startup race tồn tại: backend mở port và nhận request trước khi MongoDB/seed hoàn tất.
3. Sau khi startup hoàn tất, `/api/products/top/rated` và `/api/products` vẫn treo khoảng 45 giây.
4. MongoDB query thô cho top-rated và translation cache chạy nhanh và có sử dụng index.
5. Featured chỉ xử lý 3 candidate nên vẫn trả HTTP 200, dù mất khoảng 4–5 giây.
6. Stage `getStorefrontVisibleProductIds()` trong diagnostic end-to-end mất khoảng 17 giây, là điểm nghi vấn lớn nhất hiện tại.
7. `withTimeout()` chỉ ngắt việc chờ ở Node.js, không đảm bảo hủy query MongoDB đang chạy; các request timeout có thể tiếp tục gây áp lực lên connection pool.
8. Production còn có sự cố Cloudflare Tunnel `1033`, cần xử lý riêng sau khi backend ổn định.

Nguyên nhân chính hiện được khoanh vùng là sự kết hợp của:

1. Visibility/translation pipeline xử lý product trước khi API hoàn tất.
2. `/api/products` thực hiện visibility scan trước phân trang.
3. Một số bước translation/cache không có timeout hoặc projection đủ chặt.
4. Connection pool có thể bị chờ khi nhiều query timeout không được hủy thực sự.
5. Heap runtime cao có thể làm tăng độ trễ.
6. Production có thể chưa chạy đúng phiên bản code tối ưu hoặc đang cấu hình `NODE_ENV` không phù hợp.

Chưa thể tuyên bố 100% stage MongoDB cụ thể nào gây treo cho tới khi diagnostic được chạy lại với model `Category` đã đăng ký và có timing riêng cho từng query/helper.

## 13. Việc cần làm tiếp theo

1. Không tiếp tục bắn nhiều request nặng bằng PS1 khi backend còn request treo.
2. Chạy lại diagnostic stage sau khi thêm `require('./src/models/Category')` vào script inline.
3. Đo riêng các bước:
   - `ProductCatalogTranslationCache.find()`;
   - vòng lặp `hasValidProductTranslation()`;
   - `LiveTranslationCache.find()`;
   - `SpecKeyTranslationCache.find()`;
   - `CategoryCatalogTranslationCache.find()`;
   - `populate('category')`.
4. Chạy lại PS1 sau khi restart backend để so sánh trước và sau tối ưu.
5. Kiểm tra connection pool thực tế và các query còn chạy sau khi client timeout.
6. Kiểm tra production đã deploy đúng code tối ưu và đổi `NODE_ENV=production`.
7. Khắc phục Cloudflare Tunnel `1033`, sau đó đo lại production.
8. Chỉ thêm index mới sau khi có `explain` chứng minh query cần index đó.

Các thay đổi projection và `maxTimeMS` đã được áp dụng ở local; cần xác nhận hiệu quả trên production sau khi deploy đúng phiên bản.

Mục tiêu vận hành:

```text
/api/products/top/rated     < 2 giây
/api/products               < 3 giây
/api/products/featured/list < 3 giây ổn định
Không còn 500, 503, status=000, 1033 hoặc ECONNRESET
```
