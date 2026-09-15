# Đánh giá policy Cloudinary và rủi ro Cloudflare R2

## 1. Phạm vi và trạng thái hiện tại

Tài liệu này tách policy storage khỏi `.builderrules`, đồng thời ghi nhận các lỗi đã phát hiện và lỗi cần dự đoán trước khi sửa.

- Luồng seed/import hiện tại đang dùng Cloudflare R2 cho ảnh `main`, `gallery`, `description`, banner, avatar, review và About media.
- Các tài liệu cũ vẫn có nội dung Cloudinary; cần xem những phần đó là lịch sử hoặc policy migration, không mặc định là code Cloudinary đang tồn tại trong workspace hiện tại.
- Chưa chạy `npm run seed`, chưa chạy upload thật và không chạy `npm run build` trong lần rà soát này.

## 1.1. Cost guard bắt buộc

- Chỉ dùng gói free/tài khoản free; không bật billing, paid overage hoặc auto-upgrade.
- Không gọi Cloudinary, Cloudflare AI, R2 hoặc dịch vụ bên thứ ba bằng credential thật trong test tự động.
- Không chạy batch cào, dịch hoặc upload thật nếu chưa có xác nhận rõ ràng và quota free còn đủ.
- Ưu tiên mock provider, fixture local, dry-run không gọi provider và kiểm tra quota trước mọi thử nghiệm có network.
- Không ghi API key, API secret, token hoặc thông tin billing vào Markdown, log, report, frontend hay manifest public.
- Khi chưa xác định chắc chắn request có thể phát sinh phí, mặc định không thực hiện request đó.

## 2. Policy Cloudinary nhiều tài khoản

Tài khoản Cloudinary hiện tại đã hết rate limit. Có thể dùng nhiều tài khoản Cloudinary và chia ảnh giữa các tài khoản bằng các nhóm biến môi trường riêng.

- Chỉ backend được đọc API secret và quyết định tài khoản nhận upload.
- Frontend chỉ nhận chữ ký, `api_key` công khai và `cloud_name` từ endpoint chữ ký.
- Khi upload, phải lưu `cloud_name` hoặc định danh tài khoản cùng metadata ảnh để luôn xóa, kiểm tra và tạo URL trên đúng tài khoản.
- Có thể chọn tài khoản theo loại ảnh hoặc phân phối ổn định, ví dụ hash ID.
- Phải theo dõi quota.
- Không tự động di chuyển hoặc xóa ảnh cũ khi đổi tài khoản.

Quy ước biến môi trường:

```text
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET

CLOUDINARY_CLOUD_NAME_2
CLOUDINARY_API_KEY_2
CLOUDINARY_API_SECRET_2

CLOUDINARY_CLOUD_NAME_3
CLOUDINARY_API_KEY_3
CLOUDINARY_API_SECRET_3
```

Quy tắc bảo mật và rotation:

- Không đưa biến có `API_SECRET` vào frontend.
- Không dùng tên bắt đầu bằng `NEXT_PUBLIC_` cho secret.
- Chỉ chuyển sang tài khoản khác khi Cloudinary trả HTTP `420`, HTTP `429` hoặc thông báo rate limit/quota đã được nhận diện chắc chắn.
- Lỗi file, chữ ký, xác thực, account disabled, metadata hoặc dữ liệu không hợp lệ phải trả lỗi ngay, không rotation.
- Khi mọi tài khoản đều hết capacity, job phải dừng có kiểm soát, không xoay vô hạn.

## 3. R2 có lỗi tương tự Cloudinary không?

Có, ở các nhóm rủi ro về account, quota, metadata, URL và cleanup. Tuy nhiên R2 hiện khác Cloudinary ở điểm quan trọng:

- R2 adapter đã đọc nhiều nhóm account và chọn theo role hoặc stable hash.
- R2 chưa có cơ chế theo dõi quota hoặc rotation/failover theo HTTP `420/429`/quota như policy Cloudinary.
- Không được coi việc có nhiều nhóm `R2_*_2`, `R2_*_3` là đã có failover an toàn.
- Nếu bổ sung rotation R2, chỉ xoay cho lỗi rate limit/quota hoặc lỗi tạm thời được nhận diện rõ; lỗi `401/403`, bucket/account sai, object invalid, MIME sai, chữ ký hoặc dữ liệu sai phải dừng ngay.

## 4. Lỗi đã phát hiện từ source

### P0 — Lỗi import trong R2 account selection

`online-store-backend/src/services/r2AssetService.js:102` gọi `crypto.createHash(...)`, nhưng phần import đầu file chưa có `require('crypto')`.

Ảnh hưởng: khi không có `R2_ACCOUNT_ROLE_*` cố định và phải chọn account bằng stable hash, upload có thể lỗi `crypto is not defined` trước khi gọi R2.

### P0 — Full seed phụ thuộc R2 trước khi crawler chạy

`aboutMedia` là module `CRITICAL` và đứng đầu `SEED_PHASES.preProducts`. Full seed có thể dừng ở About media trước khi chạy crawler nếu R2 chưa cấu hình đúng.

Các điều kiện cần có:

```text
MONGO_URI
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME
R2_PUBLIC_BASE_URL
```

Nếu nhóm account R2 đã bắt đầu khai báo nhưng thiếu một biến, adapter trả lỗi `R2_ACCOUNT_GROUP_INCOMPLETE`.

### P0 — Thiếu nguồn hero About

Không thấy file local `online-store-frontend/public/assets/videos/about-hero.mp4` trong workspace. Nếu không có file này, `ABOUT_HERO_SOURCE` phải được cấu hình; nếu không `aboutMediaSeeder` sẽ fail tại `aboutMediaSeeder.js:105-109`.

### P1 — Chưa có quota/rate-limit failover cho R2

`r2AssetService.js` chọn account theo role hoặc hash nhưng không theo dõi quota và không xoay account khi R2 trả lỗi tạm thời. Một account lỗi hoặc bị throttling có thể làm cả batch fail dù account khác còn khả dụng.

### P1 — URL public có thể không dùng được ngay

Tài liệu R2 ghi nhận `cdn.manln.online` từng ở trạng thái `Initializing`. Khi custom domain chưa `Active`, object đã upload vẫn có thể trả `404` hoặc không truy cập được qua `publicUrl`.

### P1 — Chưa atomic giữa upload và ghi MongoDB

Upload R2 thành công nhưng Product hoặc bản ghi liên quan ghi thất bại có thể để lại object mồ côi. Ngược lại, không được xóa asset cũ trước khi asset mới upload và kiểm tra thành công.

### P1 — Manifest chưa đồng nhất cho mọi role

Pipeline product có xử lý ảnh mô tả, nhưng script `media:upload` tạo manifest chủ yếu cho ảnh chính và gallery. ZIP export/backup cũng chưa hoàn chỉnh manifest role `description` theo `SCRAPER_PRODUCT_DATA_SCHEMA.md`.

### P1 — Metadata phải nhất quán giữa các model

Product, Banner, User, Review và AboutMedia đều có các trường metadata R2 nhưng một số model vừa lưu metadata top-level vừa có object `asset`. Cần contract test để tránh tạo URL, validate hoặc delete bằng dữ liệu thiếu `storageAccount`, `bucket` hoặc `storageKey`.

### P1 — R2 public domain và bucket có thể lệch nhau

`publicUrl` phải được tạo từ đúng account, bucket và `storageKey`. Sai `R2_PUBLIC_BASE_URL`, đổi bucket hoặc lưu nhầm account sẽ khiến object tồn tại nhưng URL trả `404`; validation reference phải từ chối mismatch thay vì tự sửa.

### P1 — HeadObject/PutObject chưa có policy retry thống nhất

Luồng upload kiểm tra `HeadObject` rồi mới `PutObject`. Lỗi `401/403`, bucket sai hoặc object invalid phải fail ngay; lỗi mạng, timeout hoặc throttling cần policy retry hữu hạn nếu muốn chạy batch lớn. Hiện chưa có cơ chế rotation/retry đầy đủ ở tầng R2.

### P2 — Giới hạn kích thước đang dùng hằng số ảnh cho cả video

`MAX_IMAGE_ASSET_BYTES` hiện là 5 MiB nhưng `MIME_MAGIC` của R2 cho phép cả MP4/WebM. Hero video lớn hơn giới hạn sẽ bị từ chối dù MIME hợp lệ; cần policy riêng cho image và video.

### P2 — Dữ liệu crawler không có output thì seed sẽ cào lại

`online-store-backend/data/scraped-products` hiện không có output trong workspace. `npm run seed` sẽ gọi crawler nếu không truyền input hoặc `--skip-scrape`. Crawler có thể gặp rate limit nguồn, thay đổi HTML, thiếu dependency Python, file output lỗi hoặc toàn bộ record bị validator loại.

### P2 — Dry-run không phải kiểm tra offline hoàn toàn

`--dry-run` bỏ qua crawler và upload R2 nhưng vẫn cần `MONGO_URI`, admin user và file CSV/JSON đầu vào. Không có output sẵn thì dry-run vẫn fail ở bước tìm file.

## 5. Lỗi dự đoán trước khi fix

| Mức | Lỗi dự đoán | Nguyên nhân | Tiêu chí xử lý |
|---|---|---|---|
| P0 | Upload fail trước khi gọi R2 | Thiếu import `crypto` | Sửa import và chạy syntax/unit test R2 |
| P0 | Seed dừng ở `aboutMedia` | Thiếu R2 env hoặc hero source | Preflight env và test About media riêng |
| P0 | Lộ secret | Đưa R2 secret/Cloudinary API secret vào frontend, log hoặc report | Redact log; chỉ backend đọc secret |
| P0 | Xóa nhầm asset | Không lưu đúng account/bucket/key | Xóa theo metadata exact; không fallback theo URL |
| P0 | Xóa asset cũ quá sớm | Cleanup trước khi Product commit thành công | Upload, verify, commit reference rồi mới cleanup có kiểm soát |
| P1 | Xoay account sai lỗi | Coi mọi lỗi upload là quota | Chỉ xoay lỗi rate limit/quota/tạm thời đã nhận diện |
| P1 | Vòng lặp retry vô hạn | Không giới hạn retry/rotation | Giới hạn attempt, dừng job và ghi report |
| P1 | Object tồn tại nhưng URL hỏng | Custom domain chưa Active hoặc base URL sai | Kiểm tra object bằng URL cụ thể và validate URL theo account |
| P1 | Product có ảnh thiếu | Gallery/description upload lỗi chỉ ghi warning | Ghi manifest thiếu asset, đặt policy rõ về skip/fail |
| P1 | Asset mồ côi sau import lỗi | Upload không gắn transaction/rollback | Manifest batch và cleanup chỉ sau đối soát |
| P1 | Import ZIP mất ảnh mô tả | Manifest không phân biệt role `description` | Round-trip ZIP với đủ main/gallery/description |
| P1 | Hai account dùng sai bucket | Nhóm env lệch hoặc reference cũ | Validate group đầy đủ và bucket/account trước Head/Delete |
| P2 | Chậm hoặc bị throttling | HeadObject/PutObject tuần tự cho batch lớn | Giới hạn concurrency và retry hữu hạn |
| P2 | Từ chối video hợp lệ | Dùng limit ảnh 5 MiB cho video | Tách giới hạn image/video và test magic bytes |
| P2 | Crawler tạo dữ liệu trùng/sai | HTML thay đổi, duplicate URL/SKU, lazy-load | Dedupe, validation, report warning và batch nhỏ |
| P2 | Cleanup legacy Cloudinary thất bại | Asset cũ thiếu account/public ID hoặc account disabled | Inventory trước migration, không xóa tự động |

## 6. Checklist trước khi sửa và chạy thật

1. Sửa lỗi import `crypto` và kiểm tra syntax file liên quan.
2. Preflight đầy đủ `MONGO_URI`, R2 account group, bucket, public base URL và `ABOUT_HERO_SOURCE`.
3. Kiểm tra không có secret trong frontend, `.next`, log, report hoặc manifest public.
4. Xác nhận R2 custom domain đã `Active`; nếu chưa, kiểm tra object bằng endpoint phù hợp thay vì kết luận upload thất bại từ `/`.
5. Chạy unit/mock test cho account discovery, stable hash, role routing, metadata, invalid reference và cleanup; không dùng credential thật trong test.
6. Dùng file output nhỏ để chạy dry-run; dry-run phải báo rõ số record invalid, duplicate, asset thiếu và không upload.
7. Chạy batch staging 10–20 sản phẩm, kiểm tra main/gallery/description, manifest, Product reference và URL public.
8. Kiểm tra các lỗi 400/401/403/404 không rotation; chỉ lỗi quota/rate-limit/tạm thời mới được retry theo giới hạn.
9. Backup Product, translation cache và asset manifest trước batch thật.
10. Không migration, di chuyển hoặc xóa asset Cloudinary/R2 cũ tự động chỉ vì đổi provider/account.
11. Chỉ sau khi batch nhỏ đạt tiêu chí mới mở rộng; không tự chạy `npm run build`.
