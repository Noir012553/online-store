## Triệu chứng hiện tại

Backend và lệnh seed không thể phân giải bản ghi SRV của MongoDB Atlas:

```text
querySrv ECONNREFUSED _mongodb._tcp.cluster0.7pxhir8.mongodb.net
```

Lỗi xảy ra trong quá trình truy vấn DNS SRV, trước bước xác thực MongoDB hoặc truy cập cơ sở dữ liệu.

## Môi trường

- Backend: `online-store-backend`
- MongoDB driver: Mongoose trong các dependency của backend
- Hostname cụm Atlas: `cluster0.7pxhir8.mongodb.net`
- Adapter Wi-Fi: `Realtek 8822CE Wireless LAN 802.11ac PCI-E NIC`
- Mạng: `Minh Thanh 5G`

Tài liệu này không ghi lại thông tin đăng nhập hoặc secret trong connection string.

## Các bước đã hoàn thành

### 1. Kiểm tra adapter mạng đang hoạt động

```powershell
Get-NetAdapter | Where-Object {$_.Status -eq "Up"} | Format-Table -AutoSize Name, InterfaceDescription, Status
```

Kết quả: adapter đang hoạt động có tên `Wi-Fi`.

### 2. Thiết lập DNS IPv4

```powershell
Set-DnsClientServerAddress -InterfaceAlias "Wi-Fi" -ServerAddresses ("1.1.1.1","8.8.8.8")
```

Lệnh đã hoàn thành mà không báo lỗi.

### 3. Xóa bộ nhớ đệm DNS của Windows

```powershell
ipconfig /flushdns
```

Kết quả:

```text
Successfully flushed the DNS Resolver Cache.
```

### 4. Kiểm tra DNS resolver mặc định của Windows

```powershell
nslookup -type=SRV _mongodb._tcp.cluster0.7pxhir8.mongodb.net
```

Kết quả ban đầu: không nhận được phản hồi từ máy chủ DNS Google IPv6 đang được cấu hình (`2001:4860:4860::8888`).

### 5. Kiểm tra trực tiếp qua DNS Cloudflare

```powershell
nslookup -type=SRV _mongodb._tcp.cluster0.7pxhir8.mongodb.net 1.1.1.1
```

Kết quả: nhận được phản hồi thành công với cả ba đích SRV của Atlas:

- `ac-24ykmxh-shard-00-00.7pxhir8.mongodb.net:27017`
- `ac-24ykmxh-shard-00-01.7pxhir8.mongodb.net:27017`
- `ac-24ykmxh-shard-00-02.7pxhir8.mongodb.net:27017`

Điều này xác nhận Atlas có thể truy cập thông qua DNS Cloudflare và hostname là hợp lệ.

### 6. Cấu hình DNS Cloudflare cho IPv4 và IPv6

```powershell
Set-DnsClientServerAddress -InterfaceAlias "Wi-Fi" -ServerAddresses ("1.1.1.1","1.0.0.1","2606:4700:4700::1111","2606:4700:4700::1001")
```

DNS resolver IPv6 vẫn không trả về phản hồi.

### 7. Tạm thời tắt IPv6 trên adapter Wi-Fi

```powershell
Disable-NetAdapterBinding -Name "Wi-Fi" -ComponentID ms_tcpip6
```

Sau khi xóa bộ nhớ đệm, lệnh `nslookup` thông thường đã hoạt động qua `1.1.1.1` và trả về cả ba đích SRV của Atlas.

### 8. Kiểm tra trực tiếp việc phân giải DNS bằng Node.js

Khi không ghi đè DNS, Node.js thất bại:

```powershell
node -e "require('dns').promises.resolveSrv('_mongodb._tcp.cluster0.7pxhir8.mongodb.net').then(console.log).catch(err => console.error(err))"
```

Kết quả: `querySrv ECONNREFUSED`.

Khi cấu hình DNS Cloudflare trực tiếp bên trong Node.js, cùng một truy vấn đã thành công:

```powershell
node -e "const dns=require('dns'); dns.setServers(['1.1.1.1','1.0.0.1']); dns.promises.resolveSrv('_mongodb._tcp.cluster0.7pxhir8.mongodb.net').then(console.log).catch(console.error)"
```

Kết quả: trả về cả ba đích SRV của Atlas.

### 9. Kiểm tra Mongoose với `.env` của dự án

Một kết nối Mongoose trực tiếp sử dụng dotenv, DNS Cloudflare và cùng các tùy chọn kết nối như ứng dụng đã thành công:

```powershell
node -e "require('dotenv').config(); const dns=require('dns'); dns.setServers(['1.1.1.1','1.0.0.1']); const mongoose=require('mongoose'); mongoose.connect(process.env.MONGO_URI,{maxPoolSize:10,minPoolSize:5,serverSelectionTimeoutMS:8000,socketTimeoutMS:45000,connectTimeoutMS:8000,retryWrites:true,w:'majority',family:4}).then(()=>{console.log('CONNECTED');return mongoose.disconnect()}).catch(err=>{console.error(err.message);process.exitCode=1})"
```

Kết quả:

```text
CONNECTED
```

Điều này xác nhận connection string trong `.env`, thông tin đăng nhập MongoDB, IP access của Atlas, DNS override và các tùy chọn Mongoose có thể hoạt động cùng nhau trong một tiến trình tối giản.

### 10. Chạy ứng dụng và lệnh seed

`npm start` tiếp tục báo lỗi `querySrv ECONNREFUSED`.

`npm run seed` cũng thất bại với cùng lỗi SRV:

```text
Seeding failed with error: querySrv ECONNREFUSED _mongodb._tcp.cluster0.7pxhir8.mongodb.net
```

Entry point của seed hiện import Mongoose tại `src/seeds/index.js:7` nhưng không cấu hình DNS resolver trước lần import đó.

## Thay đổi code trong quá trình điều tra

Các dòng sau đã được thêm gần đầu `src/app.js`, trước import Mongoose:

```js
const dns = require('dns');
dns.setServers(['1.1.1.1', '1.0.0.1']);
```

Thay đổi này ban đầu chưa giải quyết được lỗi của ứng dụng hoặc lệnh seed. Sau khi tạm dừng điều tra theo yêu cầu, không có thay đổi code nào khác được thực hiện.

## Kết luận hiện tại

1. MongoDB Atlas đang phản hồi bình thường.
2. IP access list của Atlas không phải nguyên nhân hiện tại.
3. `nslookup` của Windows hoạt động khi sử dụng DNS IPv4 Cloudflare.
4. Truy vấn SRV của Node.js thất bại với resolver mặc định nhưng thành công khi DNS được thiết lập rõ ràng trong một tiến trình tối giản.
5. Kiểm tra Mongoose trực tiếp thành công với môi trường và tùy chọn kết nối của dự án.
6. Vấn đề còn lại liên quan đến quá trình khởi tạo của ứng dụng/seed hoặc resolver mà MongoDB driver sử dụng trong các entry point đó.
7. `src/seeds/index.js` cần được xem xét riêng vì file này import Mongoose mà không có thiết lập DNS như trong bài kiểm tra trực tiếp.

## Phát hiện bổ sung từ log ứng dụng

Ứng dụng được khởi động bằng:

```powershell
npm start
```

Kết nối MongoDB ban đầu đã hoạt động đủ lâu để ứng dụng seed translations, brands, currencies và languages. Exchange-rate scheduler và Cloudinary cleanup worker cũng đã khởi động.

Sau khi khởi động, các thao tác MongoDB bắt đầu thất bại khi phân giải từng thành viên trong replica set của Atlas:

```text
[CLOUDINARY_CLEANUP_OUTBOX] Error: write ECONNRESET
MongoServerSelectionError: getaddrinfo ENOTFOUND ac-24ykmxh-shard-00-00.7pxhir8.mongodb.net
```

Lỗi tương tự xuất hiện trong exchange-rate scheduler:

```text
[ExchangeRateScheduler] Lỗi cập nhật VND->USD: MongoServerSelectionError: getaddrinfo ENOTFOUND ac-24ykmxh-shard-00-00.7pxhir8.mongodb.net
```

Sau đó driver báo topology:

```text
ReplicaSetNoPrimary
```

Điều này không có nghĩa Atlas thực sự không có primary. Nó có nghĩa driver không thể phân giải hoặc kết nối đủ tốt tới các thành viên replica set để chọn một máy chủ.

### Giới hạn quan trọng của workaround DNS hiện tại

`src/app.js` hiện có:

```js
const dns = require('dns');
dns.setServers(['1.1.1.1', '1.0.0.1']);
```

Thiết lập này có thể ảnh hưởng đến các phương thức resolver của Node.js như `dns.promises.resolveSrv()`, nhưng không thay thế system resolver của Windows được sử dụng bởi `dns.lookup()`/`getaddrinfo`. MongoDB driver có thể sử dụng luồng này khi phân giải từng hostname shard được trả về từ truy vấn SRV.

Vì vậy, workaround hiện tại có thể cho phép bản ghi SRV được phân giải, nhưng các lần phân giải hostname shard sau đó vẫn thất bại với `getaddrinfo ENOTFOUND`.

Tiến trình seed có một khoảng thiếu sót riêng trong khâu khởi tạo. `src/seeds/index.js` import Mongoose ngay sau khi nạp dotenv và không cấu hình resolver trước khi kết nối. Lỗi còn lại là:

```text
Seeding failed with error: querySrv ECONNREFUSED _mongodb._tcp.cluster0.7pxhir8.mongodb.net
```

Lỗi `ECONNRESET` từ Cloudinary cleanup worker là một lỗi reset kết nối tạm thời riêng biệt. Đây không phải lỗi xác thực Cloudinary; lỗi `ENOTFOUND` xuất hiện sau đó cho thấy việc phân giải hostname MongoDB cũng đang thất bại trong worker này.

### Diễn giải hiện tại

Vấn đề không chỉ nằm ở truy vấn MongoDB SRV ban đầu. Đường đi mạng/DNS hiện tại có thể thất bại ở cả hai giai đoạn:

1. Phân giải `_mongodb._tcp.cluster0.7pxhir8.mongodb.net` để lấy bản ghi SRV.
2. Phân giải từng hostname shard của Atlas được trả về từ bản ghi SRV đó.

## Kết quả kiểm tra sau khi trở lại Thành phố Hồ Chí Minh

Một đoạn PowerShell động đã được chạy từ thư mục backend. Đoạn lệnh tự động chọn adapter mạng đang hoạt động:

```text
Adapter đang dùng: Wi-Fi (Index: 8)
DNS cũ: 1.1.1.1, 1.0.0.1
```

Đoạn lệnh tạm thời cấu hình DNS IPv4 Cloudflare, xóa bộ nhớ đệm DNS của Windows và kiểm tra bản ghi MongoDB SRV thông qua `1.1.1.1`. Truy vấn SRV thành công và trả về cả ba đích Atlas:

```text
ac-24ykmxh-shard-00-00.7pxhir8.mongodb.net:27017
ac-24ykmxh-shard-00-01.7pxhir8.mongodb.net:27017
ac-24ykmxh-shard-00-02.7pxhir8.mongodb.net:27017
```

Sau đó `npm run seed` đã kết nối được MongoDB và hoàn thành thành công toàn bộ 20 module:

```text
✅ Seeding completed successfully!

Modules executed: languages, translations, bannerSlotLabels, testimonialLabels,
currencies, users, categories, suppliers, products, banners, customers,
shippingProviders, locations, addresses, reviews, orders, coupons,
categoryTranslations, specTranslations
```

Các kết quả đáng chú ý:

- Cập nhật 106 products bằng một thao tác `bulkWrite`.
- Đọc được 2.808 bản ghi dịch từ `LiveTranslationCache`.
- Gom nhóm thành 990 tổ hợp product-ngôn ngữ.
- Kiểm tra cache cho thấy mỗi ngôn ngữ có 110 products.
- Seed locations đã tải và lưu thành công 65 provinces và 726 districts, sau đó hoàn tất các bước tiếp theo.
- Tạo báo cáo seed tại:
  `seed-reports/seed-report-2026-08-03T13-01-19.md`
  và
  `seed-reports/seed-report-2026-08-03T13-01-19.txt`

Kết quả cuối cùng xác nhận rằng trong môi trường mạng tại Thành phố Hồ Chí Minh, khi DNS Cloudflare được cấu hình, lỗi `querySrv ECONNREFUSED` không xảy ra và toàn bộ tiến trình seed đã sử dụng MongoDB thành công.

Bước khôi phục DNS đã chạy sau khi `npm run seed` kết thúc:

```text
Successfully flushed the DNS Resolver Cache.
Đã khôi phục DNS cho adapter: Wi-Fi
```

Vì DNS được lưu trước đó đã là `1.1.1.1, 1.0.0.1`, cấu hình DNS thực tế không thay đổi sau khi khôi phục.

Báo cáo cuối seed hiển thị `Total translations: 0` và các tỷ lệ `NaN%`. Đây là dấu hiệu bất thường riêng ở phần thống kê báo cáo, nhưng không làm seed thất bại: các module vẫn báo hoàn tất và báo cáo chi tiết đã được tạo.

Không có code ứng dụng hoặc entry point seed nào được thay đổi trong lần kiểm tra này.

## Chưa thực hiện

- Chưa tạo MongoDB URI dự phòng không sử dụng SRV.
- Chưa thay đổi entry point của seed.
- Chưa thay đổi logic retry.
- Chưa kiểm tra trực tiếp từng hostname shard của Atlas.
- Chưa điều tra riêng vì sao thống kê cuối báo cáo hiển thị `Total translations: 0` và `NaN%`.
- Không có thông tin đăng nhập hoặc giá trị `.env` nào bị công khai.
