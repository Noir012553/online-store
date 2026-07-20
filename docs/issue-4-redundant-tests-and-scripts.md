# Báo cáo kiểm tra test và script dư thừa

## Quy tắc đặt tên báo cáo

Tên file Markdown phải theo định dạng `issue-N-<mô-tả>.md`, trong đó `N` là số thứ tự của issue.

## Trạng thái

- **Loại:** Đã rà soát cấu trúc test và script ở frontend/backend; chưa xóa file
- **Phạm vi:** `online-store-frontend` và `online-store-backend`
- **Kết luận sơ bộ:** Có test/script chưa được wiring, wrapper test hỏng và một số nhóm có khả năng trùng hoặc là bản legacy

## Mô tả

Sau khi các lỗi chức năng chính của order và product stats đã được xác minh, cần kiểm tra lại các file test và script còn lại để xác định:

- File nào đang được gọi qua `package.json` hoặc unified test runner.
- File nào được đăng ký trong `testRegistry.js`.
- File nào chỉ là script chạy thủ công hoặc không còn được tham chiếu.
- Có nhóm test hoặc script bị chạy trùng hay không.

Phạm vi rà soát không bao gồm việc xóa file tự động. Các file chỉ được phân loại theo bằng chứng tham chiếu trong repository.

## Kết quả rà soát frontend

### 1. Frontend chưa có test runner

File frontend hiện có:

- `online-store-frontend/src/test/offline-support.test.ts`
- `online-store-frontend/src/test/offline-manual.js`

`online-store-frontend/package.json` chỉ có các script:

- `dev`
- `build`
- `start`

Không có script Jest/Vitest hoặc test runner tương ứng. Vì vậy `offline-support.test.ts` chưa được nối vào pipeline test tự động.

`offline-manual.js` là script kiểm tra thủ công và phần hướng dẫn bên trong đang gọi tên file khác:

```text
node test-offline-manual.js
```

Trong khi tên file thực tế là `offline-manual.js`.

### 2. Mức độ đánh giá

- `offline-support.test.ts`: **Ứng viên chưa được wiring**, chưa đủ bằng chứng để kết luận dư thừa vì đây là test có nội dung kiểm tra IndexedDB thực tế.
- `offline-manual.js`: **Ứng viên manual/legacy**, có thể giữ nếu vẫn cần kiểm tra thủ công; cần sửa hướng dẫn chạy nếu tiếp tục sử dụng.

## Kết quả rà soát backend

### 1. Script npm trỏ tới file không tồn tại

Tại `online-store-backend/package.json:20`:

```json
"test:tier3": "node src/test/test-tier3.js"
```

Nhưng file `online-store-backend/src/test/test-tier3.js` không tồn tại.

Đây là script hỏng hoặc dư thừa và cần được xử lý trước khi xem unified test runner là đầy đủ.

### 2. Wrapper test truyền tham số không hoàn chỉnh

Tại `online-store-backend/package.json:12-14`:

```json
"test:suite": "node src/test/test-runner.js -- --suite",
"test:suites": "node src/test/test-runner.js -- --suites",
"test:tags": "node src/test/test-runner.js -- --tags"
```

Trong khi `online-store-backend/src/test/test-runner.js` phân tích tham số theo dạng có dấu `=`:

```text
--suite=i18n
--suites=i18n,products
--tags=payments
```

Do đó các wrapper hiện tại không tự truyền được tên suite hoặc tag khi chạy trực tiếp.

### 3. Suite bị trùng file test

Tại `online-store-backend/src/test/testRegistry.js`:

- Suite `orders` chạy `test-vnpay-quick.js` và `test-vnpay-signature-fix.js`.
- Suite `vnpay` cũng chạy đúng hai file trên.

Các file test không bị trùng vật lý, nhưng hai suite có cùng nội dung chạy. Đây là trùng ở cấp registry và có thể khiến cùng một test được báo cáo hai lần khi chạy theo tag hoặc suite.

### 4. Suite rollback chạy lặp shadow-write

Tại `testRegistry.js`:

- Suite `rollback` chạy `test-rollback-procedures.js` và `test-shadow-writes.js`.
- Suite `shadow-writes` chạy riêng `test-shadow-writes.js`.

Khi chạy toàn bộ registry, `test-shadow-writes.js` có thể được thực thi lặp. Đây là trùng wiring, không phải bằng chứng file `test-shadow-writes.js` dư thừa.

## Các file backend chưa được wiring trực tiếp

Các file dưới đây không được gọi bởi package script hoặc `testRegistry.js` trong cấu hình hiện tại:

- `online-store-backend/src/test/test-phase4-e2e.js`
- `online-store-backend/src/test/test-language-sync.js`
- `online-store-backend/src/test/test-language-sync-flow.js`
- `online-store-backend/src/test/test-translation-e2e.js`
- `online-store-backend/src/test/test-translation-layer2.js`
- `online-store-backend/src/test/translationHelper.test.js`
- `online-store-backend/src/test/check-brands.js`
- `online-store-backend/src/test/check-db-brands.js`
- `online-store-backend/src/test/check-db-state.js`
- `online-store-backend/src/test/check-products.js`
- `online-store-backend/src/test/get-auth-token.ps1`
- `online-store-backend/src/test/test-order-currency.ps1`
- `online-store-backend/src/test/test-vnpay.ps1`

### Mức độ đánh giá

Nhóm này được phân loại là **ứng viên manual/legacy hoặc chưa được wiring**, không tự động kết luận là dư thừa. Một số file có hướng dẫn chạy độc lập hoặc có thể phục vụ chẩn đoán dữ liệu, nên cần xác nhận người dùng trước khi xóa.

## Nhóm script backend có khả năng trùng thư mục

Backend có hai thư mục:

- `online-store-backend/src/scripts/`
- `online-store-backend/scripts/`

Một số tên xuất hiện ở cả hai thư mục, gồm:

- `backup-livetranslationcache.js`
- `create-ghn-provider.js`
- `fix-indexes.js`
- `health-check-i18n.js`
- `migrate-translations.js`
- `performance-benchmark.js`
- `rebuild-critical-indexes.js`
- `setup-ghn.js`
- `setup-i18n-indexes.js`
- `setup-production-indexes.js`

Các script trong `package.json` hiện chủ yếu trỏ tới `src/scripts/`. Vì vậy các bản ở thư mục root `scripts/` là ứng viên legacy hoặc manual. Tuy nhiên cần so sánh nội dung từng cặp trước khi xóa vì tên giống nhau không đảm bảo logic giống nhau.

## Phạm vi ảnh hưởng

Các phát hiện hiện tại ảnh hưởng đến:

- Khả năng chạy test tự động đầy đủ.
- Độ chính xác của báo cáo suite do có test được đăng ký lặp.
- Khả năng bảo trì package scripts.
- Khả năng phân biệt test chính thức với script manual/legacy.

Chưa có bằng chứng các phát hiện này làm hỏng trực tiếp:

- `POST /api/orders?lang=vi`
- `GET /api/products/stats/overview?lang=vi`
- Currency fallback và validation currency.
- Common translations locale `vi`.
- Luồng checkout thực tế.

## Đề xuất xử lý

1. Xóa hoặc thay thế `test:tier3` sau khi xác nhận không có file Tier 3 bị bỏ sót.
2. Sửa wrapper test thành dạng truyền tham số đầy đủ, hoặc thay bằng hướng dẫn `npm run test -- --suite=...`.
3. Chọn một tên suite chính cho nhóm VNPay để tránh chạy và báo cáo trùng.
4. Điều chỉnh registry để `shadow-writes` không bị chạy lặp khi chạy toàn bộ suite.
5. Quyết định có duy trì frontend offline test hay bổ sung test runner phù hợp.
6. So sánh từng cặp script trong `scripts/` và `src/scripts/` trước khi xóa bản legacy.
7. Xác nhận các script manual/diagnostic với người duy trì dự án trước khi loại bỏ.

## Trạng thái cuối

Đã hoàn tất việc rà soát và phân loại ban đầu các test/script ở frontend và backend.

- **Đã xác nhận:** Có wrapper test hỏng, test frontend chưa được wiring và registry có nhóm chạy trùng.
- **Đã xác định ứng viên:** Một số test manual/legacy và các script trùng tên giữa hai thư mục.
- **Chưa thực hiện:** Xóa hoặc di chuyển file.

**Trạng thái:** Cần quyết định dọn wiring và xác nhận các file manual/legacy trước khi thực hiện thay đổi filesystem.

## Cập nhật kiểm tra dynamic issue-4 tại workspace `26-4-3 copy 37`

Đã chạy tiếp tập lệnh PowerShell tại thư mục:

- `E:\Dev Camp\26-4-3 copy 37\online-store-backend`
- Đã sửa logic nhận diện đường dẫn để không nối lặp `online-store-backend\online-store-backend`.
- Đã xác nhận đúng vị trí backend: `E:\Dev Camp\26-4-3 copy 37\online-store-backend`.
- Đã xác nhận đúng vị trí frontend: `E:\Dev Camp\26-4-3 copy 37\online-store-frontend`.
- Đã đọc được `package.json` của cả hai project.
- Đã đọc được `TEST_SUITES` từ `src/test/testRegistry.js`.
- Không chạy lại các kiểm thử chức năng đã hoàn tất trong ba báo cáo trước.
- Không tạo file mới.

### Kết quả cần lưu ý

Các khối kiểm tra `Test-Check` chưa được thực thi trong lần chạy này vì phiên PowerShell hiện tại không còn hàm `Test-Check` từ phiên trước. PowerShell trả về:

```text
The term 'Test-Check' is not recognized
```

Vì vậy dòng tổng kết `0 PASS, 0 FAIL` chỉ phản ánh biến đếm vừa được khởi tạo, không phải kết quả kiểm tra issue-4. Không dùng lần chạy này để kết luận các kiểm tra đã đạt hoặc thất bại.

Lệnh đọc registry vẫn chạy thành công và xác nhận các nhóm suite hiện có gồm `i18n`, `products`, `orders`, `vnpay`, `backend`, `rollback`, `shadow-writes` và `simple`.

### Bước tiếp theo

Cần chạy lại các khối kiểm tra sau khi khai báo lại `Test-Check` và `Get-ReferencedFiles` trong cùng phiên PowerShell. Chỉ khi đó mới ghi nhận được số liệu PASS/FAIL hợp lệ cho:

- File được npm script tham chiếu.
- Cú pháp `testRegistry.js` và `test-runner.js`.
- File test tồn tại theo registry.
- Test bị đăng ký trùng giữa các suite.
- Test backend chưa được registry đăng ký.
- Script trùng tên giữa `scripts` và `src/scripts`.
- Frontend chưa có test runner tự động.
- Tên file trong `offline-manual.js`.
- Khả năng liệt kê suite bằng `npm run test:list`.

**Trạng thái cập nhật:** Đường dẫn workspace và việc đọc registry đã xác minh đúng; kiểm tra dynamic issue-4 vẫn đang chờ chạy lại với đầy đủ hàm hỗ trợ trong cùng phiên PowerShell.

## Cập nhật xử lý issue-4

Đã sửa lỗi chắc chắn trong script manual frontend:

- `online-store-frontend/src/test/offline-manual.js:3`
- Đổi hướng dẫn từ `node test-offline-manual.js` thành `node src/test/offline-manual.js`, đúng với vị trí thực tế của file khi chạy từ thư mục frontend.

Không thay đổi các alias suite đang dùng chung file VNPay hoặc shadow-write. Đây là wiring trùng có chủ đích để cùng một test có thể được gọi theo nhóm chức năng khác nhau; `testRegistry.js` vẫn khử trùng file khi resolve danh sách chạy chung.

### Kết quả kiểm tra sau khi sửa

Đã kiểm tra mà không chạy lại API hoặc các test chức năng trong ba báo cáo trước:

- `offline-manual.js`: `node --check` **PASS**.
- `testRegistry.js`: `node --check` **PASS**.
- `test-runner.js`: `node --check` **PASS**.
- Registry: **8 suite**, toàn bộ file được registry tham chiếu đều tồn tại.
- Không tạo file mới.

**Trạng thái cập nhật mới nhất:** Đã sửa lỗi tên lệnh chạy offline manual và xác nhận cú pháp/wiring registry đạt; các alias suite trùng vẫn được giữ để không làm mất coverage.

## Kết quả tập lệnh dynamic issue-4 mới nhất

Đã chạy tại workspace `26-4-3 copy 37`, thư mục `online-store-backend`, không chạy lại API hoặc test chức năng của issue-1/2/3 và không tạo file mới.

### Kết quả tổng hợp

```text
8 PASS, 2 FAIL
```

### PASS

- Các thư mục backend/frontend tồn tại.
- Registry và runner có cú pháp hợp lệ.
- Toàn bộ file được `testRegistry.js` tham chiếu đều tồn tại.
- Phát hiện và báo cáo các test được đăng ký ở nhiều suite.
- Phân loại các test chưa được registry đăng ký.
- So sánh script trùng tên giữa `scripts` và `src/scripts`.
- Frontend chưa có test runner tự động; đây là cảnh báo đúng theo cấu hình hiện tại.
- `npm run test:list` liệt kê thành công 8 suite.

### FAIL cần xử lý

1. **NPM scripts tham chiếu file không tồn tại**

   Workspace chạy test đang có các tham chiếu sau:

   - `test:tier3` → `src/test/test-tier3.js`
   - `seed:tier1` → `src/scripts/seedTier1.js`
   - `seed:tier2` → `src/scripts/seedTier2.js`
   - `seed:unified` → `src/scripts/seedUnified.js`
   - `seed:tier1:clear` → `src/scripts/seedTier1.js`

   Đây là lỗi wiring/package script. Chưa tự xóa hoặc tạo file thay thế vì cần xác định các script tier có còn được duy trì hay không.

2. **Kiểm tra lệnh offline manual vẫn phát hiện tên cũ**

   Trong repository hiện tại, `offline-manual.js:3` đã là:

   ```text
   node src/test/offline-manual.js
   ```

   Do đó kết quả `FAIL` từ workspace chạy test cho thấy workspace đó vẫn đang dùng nội dung cũ hoặc có thêm chuỗi `node test-offline-manual.js` chưa được đồng bộ. Cần kiểm tra lại đúng file đang chạy trước khi sửa tiếp.

### Wiring trùng được xác nhận

- `test-vnpay-quick.js`: `orders`, `vnpay`.
- `test-vnpay-signature-fix.js`: `orders`, `vnpay`.
- `test-phase4-e2e-simplified.js`: `products`, `backend`.
- `test-shadow-writes.js`: `rollback`, `shadow-writes`.

Đây là cảnh báo trùng registry, không phải lỗi file; runner hiện khử trùng đường dẫn khi resolve các file chạy chung.

**Trạng thái cập nhật mới nhất:** Dynamic issue-4 đạt **8 PASS, 2 FAIL**. Hai lỗi còn lại thuộc package script thiếu file và workspace offline manual chưa đồng bộ với nội dung đã sửa trong repository hiện tại.

### Xác nhận từ console PowerShell

Kết quả tổng kết trực tiếp từ lần chạy mới nhất:

```text
KẾT QUẢ ISSUE-4: 8 PASS, 2 FAIL
Không chạy API, không chạy lại test chức năng issue-1/2/3.
Không tạo file mới.
```

Các suite được `npm run test:list` liệt kê thành công: `i18n`, `products`, `orders`, `vnpay`, `backend`, `rollback`, `shadow-writes`, `simple`.
