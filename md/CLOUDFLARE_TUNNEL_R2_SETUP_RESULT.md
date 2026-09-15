# Kết quả cấu hình Cloudflare Tunnel và R2

Ngày kiểm tra: 2026-09-15

## Kết luận

Cấu hình domain và Cloudflare Tunnel đã hoạt động ở tầng DNS/HTTPS. R2 custom domain đã được tạo và endpoint đã phân giải được, nhưng tại thời điểm kiểm tra vẫn đang provisioning (`Initializing`).

Kết quả cuối cùng:

- `manln.online` truy cập qua Cloudflare Tunnel thành công.
- `backend.manln.online` truy cập qua Cloudflare Tunnel thành công.
- Backend đã sẵn sàng và kết nối MongoDB.
- Connector Windows đã nâng cấp lên `cloudflared 2026.9.1` và chạy bằng Windows Service.
- `cdn.manln.online` đã phân giải DNS qua Cloudflare.
- `cdn.manln.online` đã phân giải DNS và nhận phản hồi HTTPS từ Cloudflare.
- `404 Not Found` khi gọi `https://cdn.manln.online/` không phải lỗi DNS; cần kiểm tra bằng URL của một object cụ thể sau khi custom domain chuyển sang `Active`.

## Cloudflare zone

Nameserver mới của zone:

```text
raina.ns.cloudflare.com
ram.ns.cloudflare.com
```

Các nameserver cũ `bill.ns.cloudflare.com` và `samara.ns.cloudflare.com` đã được thay thế tại nhà cung cấp domain.

## Sự cố DNS ban đầu

Zone ban đầu có các bản ghi A/AAAA trỏ tới IP edge của Cloudflare:

```text
104.21.x.x
172.67.x.x
2606:4700:...
```

Các bản ghi này gây Cloudflare Error 1000:

```text
DNS points to prohibited IP
```

Nguyên nhân là DNS trỏ vào IP proxy Cloudflare thay vì route tới origin Cloudflare Tunnel.

Đã xử lý bằng cách:

1. Xóa các bản ghi A/AAAA sai của domain chính và backend.
2. Tạo Cloudflare Tunnel `online-store`.
3. Tạo Published Application Routes để Cloudflare tự quản lý loại record `Tunnel`.

## Cloudflare Tunnel

Tunnel:

```text
online-store
```

Published application routes:

```text
manln.online         -> HTTP -> 127.0.0.1:3000
backend.manln.online -> HTTP -> 127.0.0.1:5000
```

DNS Records cuối cùng hiển thị hai record loại `Tunnel`:

```text
backend.manln.online -> Tunnel -> online-store
manln.online         -> Tunnel -> online-store
```

Không sử dụng A/AAAA thủ công cho hai hostname này.

## Connector Windows

Binary system-wide:

```text
C:\Program Files (x86)\cloudflared\cloudflared.exe
```

Version đã kiểm tra:

```text
cloudflared version 2026.9.1
```

Windows Service:

```text
Name: Cloudflared
Status: Running
DisplayName: Cloudflared agent
```

Token connector không được lưu trong tài liệu này. Token từng xuất hiện trong quá trình thao tác phải được rotate; installation command mới được nhập trực tiếp trên máy và không ghi vào repository.

## Kiểm tra local origin

Frontend:

```text
http://127.0.0.1:3000 -> HTTP 200
```

Backend readiness:

```text
http://127.0.0.1:5000/readyz -> HTTP 200
```

Response readiness:

```json
{
  "status": "ready",
  "databaseConnected": true,
  "startupReady": true,
  "storage": {
    "mode": "local",
    "required": false,
    "configured": true
  }
}
```

## Kiểm tra public domain

Frontend:

```text
curl.exe -i https://manln.online
HTTP/1.1 200 OK
Server: cloudflare
x-powered-by: Next.js
```

Backend:

```text
curl.exe -i https://backend.manln.online/readyz
HTTP/1.1 200 OK
Server: cloudflare
```

Backend public response vẫn xác nhận:

```json
{
  "status": "ready",
  "databaseConnected": true,
  "startupReady": true
}
```

## R2 custom domain

Bucket:

```text
online-store
```

Custom domain:

```text
cdn.manln.online
```

Trạng thái khi cấu hình trên giao diện:

```text
Access: Enabled
Status: Initializing
Minimum TLS: 1.0
```

## Kiểm tra CDN

DNS:

```text
Resolve-DnsName cdn.manln.online -Server 1.1.1.1
```

Kết quả trả về các IP edge Cloudflare:

```text
2606:4700:3034::6815:3717
2606:4700:3037::ac43:9021
104.21.55.23
172.67.144.33
```

HTTPS:

```text
curl.exe -I https://cdn.manln.online
HTTP/1.1 404 Not Found
Server: cloudflare
```

### Diễn giải mã 404

Mã `404` tại đường dẫn gốc `/` không phải lỗi DNS hoặc lỗi HTTPS. Vì custom domain còn ở trạng thái `Initializing`, cần chờ chuyển sang `Active` rồi kiểm tra bằng đường dẫn object thật sau khi upload, ví dụ:

```text
https://cdn.manln.online/<object-key>
```

Kết quả mong đợi cho object public là `200 OK`.

## Cập nhật cấu hình backend

Các biến môi trường R2 đã được thêm vào backend theo nhóm tài khoản hiện tại:

```text
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME
R2_PUBLIC_BASE_URL
```

Giá trị secret không được ghi vào tài liệu. Backend cần được restart sau khi thay đổi env để nạp lại cấu hình.

## Việc cần làm tiếp theo

1. Xử lý và kiểm tra các blocker trong risk register trước.
2. Chờ custom domain R2 chuyển sang `Active` nếu giao diện vẫn hiển thị `Initializing`.
3. Restart backend sau khi thay đổi env, không cần chạy build.
4. Upload một object thử nghiệm vào bucket `online-store`.
5. Gọi URL object cụ thể qua `https://cdn.manln.online/<object-key>`.
6. Chạy dry-run/batch staging nhỏ, kiểm tra metadata account/bucket/key và manifest trước full seed.
7. Kết quả mong đợi cho object public là `HTTP 200`.

Không đưa các biến secret sau vào frontend:

```text
R2_SECRET_ACCESS_KEY
CLOUDINARY_API_SECRET
```

Vì R2 custom domain đang `Access: Enabled`, mọi object được truy cập qua domain này cần được xem là public. Nếu cần object private, phải dùng signed URL thay vì bật public access toàn bucket.

## Rà soát blocker seed/R2 từ source

Luồng seed đã có logic tự gọi crawler khi thư mục `online-store-backend/data/scraped-products` không có CSV/JSON; có thể ép cào lại bằng `npm run seed -- --force-scrape`. Tuy nhiên chưa nên kết luận full seed sẵn sàng end-to-end vì:

1. Import `crypto` trong `r2AssetService.js` hiện đã có; đã kiểm tra bằng `node --check`, nhưng chưa upload provider thật.
2. `aboutMedia` là module critical chạy trước crawler; cần `MONGO_URI`, một nhóm R2 đầy đủ và `ABOUT_HERO_SOURCE` nếu thiếu file hero local.
3. R2 hiện đã có retry hữu hạn cho lỗi mạng/429/5xx và guard upload fail-closed, nhưng chưa có quota provider tracking hoặc rotation/failover tương đương policy nhiều tài khoản Cloudinary. Không được xoay account cho lỗi xác thực, bucket sai, MIME sai hoặc dữ liệu không hợp lệ.
4. `publicUrl` chỉ có thể kiểm tra chắc chắn sau khi custom domain ở trạng thái `Active`; phải lưu đúng `storageAccount`, `bucket`, `storageKey` để validate/delete.
5. Upload, Product commit và manifest chưa được chứng minh atomic cho toàn bộ batch; không cleanup asset cũ trước khi reference mới được ghi và kiểm tra thành công.
6. Chưa có bằng chứng runtime cho dry-run batch nhỏ, upload R2 thật và kiểm tra object bằng URL cụ thể.

Risk register chi tiết nằm tại `md/ASSET_STORAGE_CLOUDINARY_R2_RISK_REGISTER.md`.

## Ghi chú triển khai

Frontend hiện đang chạy với:

```text
buildId: development
```

Điều này phù hợp cho kiểm tra Tunnel và DNS hiện tại, nhưng chưa phải production build. Không chạy build tự động trong quá trình kiểm tra này.
