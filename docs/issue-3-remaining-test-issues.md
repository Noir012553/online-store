# Báo cáo các vấn đề còn tồn tại sau khi xử lý lỗi order và product stats

## Trạng thái

- **Loại:** Tổng hợp các hạng mục còn lại sau khi đã xử lý hai lỗi chính
- **Phạm vi:** Backend test suite, rollback/shadow-write và cấu hình môi trường runtime
- **Trạng thái lỗi chính:** Đã xử lý và xác minh

## Các hạng mục đã hoàn tất

### Order HTTP 422

Lỗi tạo đơn hàng `POST /api/orders?lang=vi` do sản phẩm thiếu hoặc có `baseCurrencyCode` không hợp lệ đã được xử lý:

- Đã bổ sung kiểm tra `baseCurrencyCode` trong product import.
- Đã chuẩn hóa mã tiền tệ import về chữ hoa và định dạng 3 ký tự.
- Đã sửa **109 sản phẩm** trên database dev sang currency `VND`.
- Dry-run sau khi sửa xác nhận còn **0 sản phẩm** có `baseCurrencyCode` lỗi.
- Luồng checkout đã được xác minh thành công.

### Product stats HTTP 500

Lỗi `GET /api/products/stats/overview?lang=vi` do thiếu currency báo cáo đã được xử lý:

- Stats với currency hợp lệ trả HTTP `200`.
- Stats không truyền currency vẫn fallback thành công và trả HTTP `200`.
- Currency không hợp lệ `ZZZ` trả HTTP `400`.
- Common translations trả HTTP `200`.
- Sáu khóa toast tiếng Việt đã được xác minh đầy đủ.
- PowerShell dynamic test thực tế đạt **8 PASS, 0 FAIL**.
- Lệnh dynamic chạy trực tiếp trong PowerShell và không tạo file mới.

## Vấn đề còn tồn tại

### 1. Rollback suite chưa hoàn tất

Các test còn lại nằm tại:

- `online-store-backend/src/test/test-rollback-procedures.js`
- `online-store-backend/src/test/test-shadow-writes.js`

Các nguyên nhân đã được ghi nhận trong lần kiểm tra trước:

- Một số kiểm tra phụ thuộc trạng thái Git sạch của workspace.
- Kiểm tra TTL index phụ thuộc index thực tế đã được tạo trong MongoDB.
- Rollback fixture và dữ liệu test cần được chạy trên database có cấu hình phù hợp.
- Test shadow-write cần các model và schema translation cache tương ứng.
- Test rollback cần MongoDB hoạt động để tạo, đọc và dọn dữ liệu fixture.

Các vấn đề này không ảnh hưởng đến luồng order, product stats hoặc kết quả checkout đã xác minh.

### 2. Runtime test cần cấu hình môi trường hợp lệ

Các suite backend đầy đủ không thể xác minh chỉ bằng kiểm tra cú pháp nếu thiếu các biến môi trường ngoài:

- `MONGO_URI`
- JWT access secret theo cấu hình backend
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

Không sử dụng giá trị giả cho các biến trên để tránh kết nối nhầm database hoặc làm sai kết quả kiểm thử bảo mật.

### 3. Sanity test phụ thuộc API đang chạy

`npm run test:simple` gọi API local tại:

```text
http://localhost:5000
```

Vì vậy test này chỉ có thể đạt khi backend đã khởi động và endpoint debug VNPay khả dụng. Đây là điều kiện chạy test, không phải lỗi của product stats hoặc order currency.

## Kết quả kiểm tra mã nguồn

Đã xác nhận:

- Các file test liên quan vượt qua `node --check`.
- `npm run test:list` liệt kê được các suite.
- Registry đã nhận suite `shadow-writes`.
- Các import tương đối sai được ghi nhận trước đây đã được sửa.
- Không phát hiện lại `entityType: "generic"` trong nhóm test hiện tại.
- Không tạo lockfile mới khi cài dependency backend để phục vụ kiểm tra.

## Phạm vi ảnh hưởng

Các vấn đề còn tồn tại chỉ ảnh hưởng đến khả năng chạy đầy đủ một số test maintenance hoặc test phụ thuộc môi trường. Chúng không làm thay đổi kết quả đã xác minh của:

- `POST /api/orders?lang=vi`
- `GET /api/products/stats/overview?lang=vi`
- Currency fallback và validation currency
- Common translations cho locale `vi`
- Luồng checkout thực tế

## Việc cần làm tiếp theo

1. Cấu hình MongoDB dev hợp lệ và các secret runtime cần thiết.
2. Khởi động backend tại port `5000`.
3. Chạy lại rollback và shadow-write suite với database test riêng.
4. Xác nhận TTL index của các model translation cache.
5. Kiểm tra lại workspace Git trước khi chạy các assertion liên quan đến rollback.
6. Giữ nguyên PowerShell dynamic test 8/8 làm sanity check cho product stats và i18n.

## Kết luận

Hai lỗi chức năng chính đã được xử lý và xác minh thành công. Các hạng mục còn lại là test maintenance, fixture hoặc cấu hình runtime; chưa có bằng chứng cho thấy chúng gây lỗi trở lại trong luồng order hoặc product stats.

**Trạng thái tổng thể:** Chức năng chính đã đạt; test rollback/shadow-write và xác minh runtime đầy đủ vẫn còn chờ môi trường phù hợp.

## Cập nhật dynamic PowerShell mới nhất

Đã chạy trực tiếp trong PowerShell tại thư mục `online-store-backend` với:

- `BaseUrl=http://localhost:5000`
- `Lang=vi`
- Không tạo file `.ps1`, JSON hoặc log mới

### Kết quả thực tế

- Active currencies: **PASS**, HTTP `200`, chọn được currency động `VND`.
- Stats không truyền currency: **PASS**, HTTP `200`.
- Currency không hợp lệ `ZZZ`: **PASS**, HTTP `400`.
- Common translations: **PASS**, HTTP `200`.
- Stats với currency động: **FAIL trong script**, nhận HTTP `400`.
- Kiểm tra 5 trường stats: **FAIL phụ thuộc**, do request trước đó không lấy được response thành công.
- Stats fallback có đủ 5 trường: **FAIL trong script**, do script đọc sai vị trí dữ liệu response.
- Kiểm tra 6 khóa toast: **FAIL trong script**, do script đọc sai vị trí `data.translations`.

### Nguyên nhân đã xác định

1. `Test-Case` thực thi scriptblock bằng `&`, khiến các biến gán bên trong như `$currencyCode`, `$statsWithCurrency` và `$translations` không được giữ ở scope bên ngoài.
2. Endpoint stats trả về 5 trường thống kê trực tiếp ở `response.Body`, không nằm trong `response.Body.data`.
3. Endpoint translations trả về các khóa dịch tại `response.Body.data.translations`.

### Biện pháp kiểm tra tiếp theo

- Dùng `$script:currencyCode`, `$script:statsWithCurrency`, `$script:statsFallback` và `$script:translations` khi gán biến bên trong `Test-Case`.
- Đọc fields stats trực tiếp từ `Body`.
- Đọc khóa toast từ `Body.data.translations`.
- Reset `$pass = 0` và `$fail = 0` trước khi chạy lại toàn bộ 8 kiểm tra.

**Trạng thái cập nhật:** API đã phản hồi đúng các status chính; lần chạy dynamic chưa đạt 8/8 vì lỗi scope và cách đọc response trong chính script PowerShell. Chưa có cơ sở ghi nhận lỗi mới của endpoint stats hoặc bản dịch.

## Kết quả xác minh sau khi sửa tập lệnh

Đã chạy lại tập lệnh PowerShell dynamic trực tiếp tại workspace `26-4-3 copy 37`, trong thư mục `online-store-backend`, với `BaseUrl=http://localhost:5000` và `Lang=vi`.

- Đã sửa cú pháp khối chọn currency để `if`, `elseif` và `else` được thực thi liền nhau.
- Currency được chọn động là `VND`.
- Không tạo file `.ps1`, JSON hoặc log mới.

Kết quả thực tế:

```text
PASS  Active currencies trả HTTP 200
PASS  Stats với currency động trả HTTP 200
PASS  Stats với currency có đủ 5 trường
PASS  Stats không truyền currency trả HTTP 200
PASS  Stats fallback có đủ 5 trường
PASS  Currency không hợp lệ trả HTTP 400
PASS  Common translations trả HTTP 200
PASS  Có đủ 6 khóa toast tiếng Việt

Kết quả: 8 PASS, 0 FAIL
```

Lần chạy này xác nhận bộ product stats và common translations đạt đầy đủ **8/8**. Các vấn đề còn lại trong phạm vi tổng hợp vẫn chỉ là rollback/shadow-write và runtime test phụ thuộc MongoDB, JWT, Cloudflare credentials; không phát sinh lỗi mới trong product stats hoặc bản dịch.

**Trạng thái cập nhật mới nhất:** PowerShell dynamic sanity test đạt **8/8**, không tạo file mới.

## Kết quả xác minh cuối cùng

Đã chạy lại tập lệnh PowerShell dynamic issue-4 trực tiếp trong workspace `26-4-3 copy 38`, từ thư mục `online-store-backend`, không tạo file mới.

```text
KẾT QUẢ ISSUE-4: 12 PASS, 0 FAIL
```

Các kiểm tra backend/frontend, npm script, test registry, test runner, số lượng suite và offline manual đều đạt. Các lỗi trước đó do quoting của `node -e` và workspace cũ chưa đồng bộ đã không còn tái diễn.

**Trạng thái tổng thể:** Issue-1, issue-2, issue-3 và issue-4 đã được rà soát, cập nhật và hoàn tất theo phạm vi kiểm tra hiện tại. Không còn lỗi wiring được xác nhận trong bộ kiểm tra issue-4.

## Cập nhật tổng quan sau rà soát tài liệu

Lần cập nhật này chỉ rà soát các báo cáo Markdown, không sửa mã nguồn, cấu hình hoặc chạy lại kiểm thử.

| Nhóm issue | Trạng thái theo báo cáo hiện có | Ghi chú còn lại |
| --- | --- | --- |
| Issue 1–4 | Hoàn tất trong phạm vi đã ghi nhận | Kiểm thử runtime đầy đủ vẫn phụ thuộc MongoDB, JWT và Cloudflare credentials hợp lệ. |
| Issue 5 | Đã triển khai và xác minh tự động | Cần kiểm thử tương tác trực tiếp trên preview khi có dev server. |
| Issue 6 | Đã rà soát, dọn import cũ và build thành công | Cần xác minh trực tiếp trên preview ở các viewport. |
| Issue 7 | Hoàn tất trong phạm vi runtime an toàn | Các emoji thuộc API response, email, locale, report lưu file và script legacy là ngoại lệ có chủ đích hoặc cần quy trình riêng. |
| Issue 8–9 | Chưa hoàn tất | Cần chốt chiến lược hybrid cache, contract batch/import và kiểm thử đầu-cuối save/re-translate. |
| Issue 10 | Chưa hoàn tất | Các nhóm translation, payment, currency/exchange rate, import/export và email vẫn cần chuẩn hóa contract lỗi và kiểm thử API theo từng luồng. |

**Trạng thái cập nhật:** Các lỗi chức năng và wiring đã đóng giữ nguyên kết luận trước đó. Phần việc tiếp theo của dự án tập trung vào kiểm thử runtime có cấu hình hợp lệ, kiểm thử preview và các hạng mục i18n/dynamic translation còn mở.

## Đối chiếu repository hiện tại

Đã đối chiếu tại commit `00dd0ee`:

- Frontend vẫn chỉ chạy `node src/test/offline-manual.js` qua `npm test`; `src/test/offline-support.test.ts` chưa được wiring vào test runner tự động.
- Backend vẫn có các alias suite dùng chung file: `orders`/`vnpay` cùng tham chiếu hai test VNPay và `rollback`/`shadow-writes` cùng tham chiếu shadow-write test. Runner có thể khử trùng file khi resolve, nhưng wiring vẫn cần được ghi nhận là có chủ đích.
- Không có bằng chứng từ rà soát tĩnh để xác nhận runtime test đầy đủ khi thiếu MongoDB, JWT và Cloudflare credentials.

**Trạng thái hiện tại:** Các luồng chức năng chính giữ trạng thái đã xác minh; test automation và runtime đầy đủ vẫn chưa hoàn tất.

## Cập nhật đối chiếu repository hiện tại

Đợt rà soát tài liệu này chỉ đối chiếu tĩnh với repository hiện tại, không chạy lại API, test runtime hoặc thay đổi mã nguồn.

| Nhóm | Trạng thái hiện tại | Việc còn lại |
| --- | --- | --- |
| Issue 1–2 | Hoàn tất trong phạm vi mã nguồn và kết quả kiểm thử đã ghi nhận. | Xác minh runtime đầy đủ vẫn cần MongoDB, JWT và Cloudflare credentials hợp lệ. |
| Issue 4 | Wiring npm script và lệnh offline manual đã đúng; 8 suite registry có các alias chủ đích và runner khử trùng file. | Phân loại riêng các script legacy/manual, không tự xóa chỉ dựa vào tên hoặc đường dẫn. |
| Issue 5–7 | Hoàn tất về mã nguồn theo báo cáo. | Issue 5–6 vẫn cần kiểm thử thao tác trực tiếp trên preview ở nhiều viewport. |
| Issue 8–9 | Chưa hoàn tất; mô hình hybrid cache vẫn còn trong mã nguồn. | Chốt nguồn cache, contract batch/import và kiểm thử đầu-cuối. |
| Issue 10 | Một số nhóm đã chuẩn hóa; translation, currency, payment, import/export và email vẫn còn mở. | Chuẩn hóa contract lỗi theo từng luồng và kiểm thử API đa locale. |

**Trạng thái cập nhật:** Không có thay đổi mới làm đảo ngược các kết luận đã ghi nhận. Các hạng mục mở tập trung ở cấu hình runtime, kiểm thử preview và chuẩn hóa i18n/dynamic translation.
