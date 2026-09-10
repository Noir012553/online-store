# Tổng hợp vấn đề đã phát hiện

Tài liệu này ghi lại các vấn đề kỹ thuật, test setup và credential đã phát hiện trong dự án. Không ghi mật khẩu, token, secret hoặc nội dung credential XML thật.

## 1. Credential XML trên Windows

### Hiện tượng

File mặc định được các test export/import tìm là:

```text
%USERPROFILE%\\.online-store-export-credential.xml
```

Khi chạy `Import-Clixml`, biến `$credential` trả về `$null`, sau đó gọi:

```powershell
$credential.GetNetworkCredential()
```

sẽ gây lỗi:

```text
You cannot call a method on a null-valued expression.
```

### Nguyên nhân

Lệnh tạo file trước đó dùng `Get-Credential`. Nếu người dùng bấm Cancel hoặc không nhập credential, pipeline vẫn có thể tiếp tục và lệnh cũ vẫn in thông báo đã lưu file. Kết quả là file XML không chứa một `PSCredential` hợp lệ.

Ngoài ra, file do `Export-Clixml` tạo được mã hóa bằng Windows DPAPI. File chỉ đọc được trên đúng máy Windows và đúng user Windows đã tạo nó.

### Cách kiểm tra không hỏi lại credential

```powershell
$path = Join-Path $env:USERPROFILE '.online-store-export-credential.xml'; if (-not (Test-Path $path)) { throw "Không tìm thấy file: $path" }; $credential = Import-Clixml $path; if ($null -eq $credential -or $credential -isnot [System.Management.Automation.PSCredential]) { throw 'File XML không chứa credential hợp lệ hoặc không đọc được bằng user Windows hiện tại' }; Write-Host "Username: $($credential.UserName)"
```

### Khi file không hợp lệ

Không thể tự khôi phục password từ file XML rỗng hoặc file được tạo bởi user/máy khác. Cần tạo lại một lần bằng `Get-Credential`, sau đó những lần sau mới dùng `Import-Clixml` mà không cần nhập lại.

```powershell
$path = Join-Path $env:USERPROFILE '.online-store-export-credential.xml'; $credential = Get-Credential -Message 'Nhập tài khoản admin dùng cho test export/import'; if ($null -eq $credential) { throw 'Bạn đã hủy nhập credential, chưa tạo file' }; $credential | Export-Clixml -Path $path -Force; Write-Host "Đã lưu credential hợp lệ tại: $path"
```

### Nạp credential vào session hiện tại

```powershell
$path = Join-Path $env:USERPROFILE '.online-store-export-credential.xml'; $credential = Import-Clixml $path; if ($null -eq $credential -or $credential -isnot [System.Management.Automation.PSCredential]) { throw 'Credential XML không hợp lệ' }; $networkCredential = $credential.GetNetworkCredential(); if ([string]::IsNullOrWhiteSpace($networkCredential.Password)) { throw 'Không đọc được password từ credential XML' }; $env:TEST_ADMIN_EMAIL = $credential.UserName; $env:TEST_ADMIN_PASSWORD = $networkCredential.Password; $env:EXPORT_TEST_EMAIL = $credential.UserName; $env:EXPORT_TEST_PASSWORD = $networkCredential.Password; Write-Host "Đã nạp credential cho: $($credential.UserName)"
```

Các biến trên chỉ tồn tại trong cửa sổ PowerShell hiện tại. Không in password ra terminal và không commit file XML.

## 2. Hai flow authentication khác nhau

### Export/import dynamic

`online-store-backend/scripts/test-export-dynamic.js` hỗ trợ:

- `EXPORT_TEST_EMAIL` và `EXPORT_TEST_PASSWORD`.
- `EXPORT_CREDENTIAL_PATH` để chỉ định XML khác.
- File mặc định `%USERPROFILE%\\.online-store-export-credential.xml` trên Windows.
- `Import-Clixml`/DPAPI thông qua PowerShell.

### Backend integration harness

`online-store-backend/src/test/integrationHarness.js` không phụ thuộc Windows XML. Harness dùng:

- `TEST_ADMIN_EMAIL`.
- `TEST_ADMIN_PASSWORD`.
- `TEST_ADMIN_TOKEN` nếu backend test đã chạy sẵn.
- `JWT_ACCESS_SECRET` và `JWT_REFRESH_SECRET` cho process backend cô lập.

Harness đăng nhập qua API thật:

```text
POST /api/users/login
```

Lý do tách riêng là integration test có thể chạy trên Linux/container, nơi không đọc được credential DPAPI của Windows.

## 3. Lỗi backend và test đã xử lý

### Duplicate declaration

Các module từng khai báo trùng biến khiến backend không parse được:

```text
Identifier 'SpecKeyRegistry' has already been declared
```

Đã loại bỏ import trùng trong các service liên quan và kiểm tra syntax toàn bộ backend.

### VNPAY timezone

Test từng hard-code giờ theo timezone máy chạy test. Đã chuyển sang:

- Input thời gian UTC rõ ràng.
- Tính expected bằng `Intl.DateTimeFormat` với `Asia/Ho_Chi_Minh`.
- Kiểm tra zero-padding và định dạng 14 chữ số.

### Mock controller lệch production contract

Đã sửa các mock cho:

- `req.lang` và `req.query`.
- Mongoose chain `.lean()`, `.populate()`, `.maxTimeMS()`, `.select()`, `.sort()`, `.limit()` và `.skip()`.
- Currency, Category, Order và Cloudinary boundary.
- Response có field `role` và message i18n hiện hành.

### Integration setup không đầy đủ

Trước đây test phụ thuộc backend/MongoDB/token thủ công và có thể coi các trạng thái như `404`, `ECONNREFUSED` hoặc request bị reject là pass.

Đã thêm harness để:

1. Kiểm tra `TEST_MONGO_URI`/`MONGO_URI`.
2. Chọn port trống.
3. Khởi động backend thật nếu chưa readiness.
4. Dùng database cô lập.
5. Tạo admin/product/category fixture động.
6. Gọi route thật.
7. Kiểm tra response và database.
8. Cleanup fixture, database và child process.

### Translation route

Route đúng là:

```text
POST /api/translations/admin/manual-override
```

Route cũ `/api/translations/manual-override` không tồn tại. Route đúng yêu cầu Bearer token admin, cache fixture và kiểm tra `TranslationAuditLog`.

### Mongoose deprecated option

Đã thay:

```js
{ new: true }
```

bằng:

```js
{ returnDocument: 'after' }
```

## 4. Cấu hình môi trường

Backend template nằm tại:

```text
online-store-backend/.env.example
```

Backend local secret file:

```text
online-store-backend/.env
```

Frontend public template nằm tại:

```text
online-store-frontend/.env.local.example
```

Frontend chỉ chứa các biến public `NEXT_PUBLIC_*`. Không đặt MongoDB, JWT secret, password, Cloudinary API secret hoặc VNPAY hash secret ở frontend.

## 5. Trạng thái kiểm tra

Đã thực hiện:

- Kiểm tra syntax các file test/harness đã sửa.
- Kiểm tra `git diff --check`.
- Phân tách test thường và integration test.
- Bổ sung env template theo các nhóm backend đang đọc.

Chưa thể chạy đầy đủ integration suite nếu môi trường chưa có MongoDB test và credential hợp lệ. Không chạy `npm run build` theo yêu cầu.
