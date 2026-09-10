# Vấn đề thiết lập và phân tầng test

## Bối cảnh

Một số test hiện tại gọi khác tầng với cách người dùng thực tế sử dụng hệ thống. Vì vậy kết quả có thể gây hiểu nhầm:

- Unit test kiểm tra adapter hoặc controller bằng mock, nhưng bị dùng để kết luận cho toàn bộ flow giao diện.
- Integration test gọi backend thật nhưng phụ thuộc server, MongoDB, fixture và token được chuẩn bị thủ công.
- Một số test cũ chấp nhận `404`, `ECONNREFUSED` hoặc request bị reject như kết quả hợp lệ.
- Một số test gọi sai route nhưng vẫn được xem là pass vì chỉ kiểm tra không đầy đủ status response.
- Mock không phản ánh request chain thật như `req.query`, `req.lang`, `req.app`, `populate`, `lean` và `maxTimeMS`.

## Nguyên tắc cần áp dụng

Test phải chuẩn bị đủ điều kiện đầu vào trước khi kiểm tra hành vi, tương tự việc đưa đủ giá trị vào một bài toán trước khi tính kết quả.

```text
Thiếu setup thật sự  -> fail rõ ràng: môi trường chưa sẵn sàng
Request sai           -> fail rõ ràng: endpoint hoặc contract sai
Request đúng, lỗi đúng -> pass: hệ thống xử lý lỗi đúng
Request đúng, kết quả sai -> fail: lỗi tính năng
```

Không được dùng các cách sau để làm test xanh giả:

- Không có MongoDB nhưng coi `404` là pass.
- Backend không kết nối được nhưng coi rate-limit test là pass.
- Gọi sai route rồi chấp nhận `404`.
- Không tạo fixture nhưng kết luận endpoint không có dữ liệu là hành vi hợp lệ.
- Mock khác xa request và response contract của production.

## Phân tầng test

### Unit test

Kiểm tra một hàm hoặc một module độc lập:

- Công thức amount của VNPAY.
- Tạo và kiểm tra chữ ký.
- Parse IPN.
- Validation input.
- Currency formatter.

Unit test được phép mock dependency, nhưng mock phải phản ánh đúng interface production.

### Integration test

Kiểm tra route backend thật cùng database test:

1. Load cấu hình test riêng.
2. Kết nối database test bị cô lập.
3. Khởi động hoặc kiểm tra backend đã readiness.
4. Tạo fixture động trong database.
5. Tạo token admin hợp lệ nếu route yêu cầu quyền.
6. Gọi đúng route thật.
7. Kiểm tra response và dữ liệu database sau request.
8. Xóa fixture trong `finally`.

### E2E test

Kiểm tra luồng người dùng từ frontend đến backend và dịch vụ ngoài. Thanh toán VNPAY cần tách rõ:

- Test nội bộ: tạo payment request, sinh chữ ký, gửi IPN giả lập vào webhook thật và kiểm tra order update.
- Test sandbox: redirect tới VNPAY sandbox và xác nhận callback thực tế khi môi trường sandbox được bật.

Không nên gọi cổng thanh toán thật trong unit test hoặc test mặc định của CI.

## Ví dụ manual override

Integration test cho manual override phải tự chuẩn bị đầy đủ:

```text
tạo LiveTranslationCache fixture
-> tạo hoặc lấy admin token test hợp lệ
-> POST /api/translations/admin/manual-override
-> kiểm tra cache đã được cập nhật
-> kiểm tra TranslationAuditLog đã được ghi
-> xóa cache và audit fixture
```

Route phải dùng đúng contract:

```text
POST /api/translations/admin/manual-override
```

Không dùng route rút gọn không tồn tại và không xem `404` của route sai là pass.

## Ví dụ thanh toán VNPAY

Một flow integration đúng cần:

```text
POST API tạo payment
-> kiểm tra redirect URL và chữ ký
-> tạo IPN payload động từ cùng secret/config
-> POST vào webhook VNPAY thật của backend
-> kiểm tra chữ ký được xác thực
-> kiểm tra order chuyển trạng thái đúng
-> gửi lại IPN để kiểm tra idempotency
```

Ngày giờ trong test phải được tạo động theo timezone VNPAY, không hard-code giờ phụ thuộc timezone của máy chạy test.

## Tiêu chí hoàn thành

- Test mặc định không phụ thuộc server hoặc database cá nhân đang chạy ngầm.
- Integration test có preflight và báo rõ biến môi trường còn thiếu.
- Fixture được tạo động, có namespace hoặc dữ liệu nhận diện riêng và luôn cleanup.
- Không chấp nhận `ECONNREFUSED`, route `404` sai hoặc request bị reject là pass.
- Test kiểm tra cả response API và thay đổi dữ liệu quan trọng trong database.
- Báo cáo phân biệt rõ lỗi setup, lỗi contract và lỗi logic.
- Các test thanh toán không chỉ kiểm tra redirect mà còn kiểm tra webhook và cập nhật order.

## Đã triển khai

- `src/test/integrationHarness.js` tự chọn port, khởi động backend khi chưa có backend readiness, tạo database test cô lập, tạo admin user/token và tạo product/category fixture.
- `backend-endpoints.test.js` dùng harness, kiểm tra đúng route admin manual override, xác nhận cache và audit log, có timeout cho request và cleanup tập trung.
- `backend-endpoints.test.js` không còn coi `ECONNREFUSED`, thiếu MongoDB hoặc thiếu token là pass.
- `test-config.js` đã mở rộng danh sách loại khỏi default discovery cho các test cần MongoDB, backend, network hoặc VNPAY sandbox, gồm `db-state.test.js`, `languages-flow.test.js`, `language-sync-flow.test.js`, `translation-api.test.js`, `translation-migration-smoke.test.js`, `shadow-writes.test.js`, `simple.test.js` và các test integration liên quan.
- `test:integration` vẫn là suite có chọn lọc theo registry; muốn chạy toàn bộ file integration đã phân loại cần đặt `RUN_INTEGRATION_TESTS=true`.
- Các script VNPay, language sync, migration smoke và rollback đã có assertion/exit code rõ ràng hơn; backup không có trong checkout sẽ được đánh dấu skip thay vì pass giả.
- `test-runner.js` tự tạo `reports/test` trước khi ghi error/summary report.
- Root `package.json` đã chuyển `npm test` từ placeholder sang `npm --prefix online-store-backend test`.
- Các option Mongoose deprecated `{ new: true }` đã được thay bằng `{ returnDocument: 'after' }`.

Đã xác minh cục bộ:

- `npm run test:vnpay:signature`: PASS.
- Các file JavaScript đã sửa: qua `node --check`.
- `git diff --check`: PASS.

Chưa có kết quả runtime toàn bộ: workspace hiện thiếu `node_modules` của backend/frontend, nên `test:list` dừng ở dependency `dotenv` và `check:emoji` dừng ở dependency `typescript`. Không dùng claim `38/38 PASS` lịch sử để kết luận trạng thái hiện tại.

Integration suite dùng `TEST_MONGO_URI` hoặc `MONGO_URI` trỏ tới MongoDB test, `JWT_ACCESS_SECRET` và `JWT_REFRESH_SECRET` cho backend cô lập, cùng `TEST_BASE_URL`/`TEST_API_BASE_URL` cho endpoint. Mặc định harness tự tạo một admin fixture duy nhất trong database test, sinh password chỉ trong memory, đăng nhập qua `POST /api/users/login` rồi xóa fixture khi cleanup. `TEST_ADMIN_EMAIL` và `TEST_ADMIN_PASSWORD` chỉ là override tùy chọn khi cần dùng tài khoản admin test có sẵn; hai biến phải đi cùng nhau. Có thể dùng `TEST_ADMIN_TOKEN` khi backend test đã chạy sẵn và token hợp lệ. Nếu dùng backend đã chạy sẵn, bắt buộc có `TEST_MONGO_URI` để tránh ghi vào database thật. Nếu backend chưa chạy, harness tự khởi động process riêng với database cô lập từ `MONGO_URI`. Không đặt secret hoặc mật khẩu trong source code. Tài liệu cũ tham chiếu `.env.example`, nhưng file mẫu chưa được xác minh tồn tại trong checkout hiện tại; cần bổ sung trước khi chuẩn hóa onboarding test.
