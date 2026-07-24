# Báo cáo kiểm tra test và script dư thừa

## Quy tắc đặt tên báo cáo

Tên file Markdown phải theo định dạng `issue-N-<mô-tả>.md`, trong đó `N` là số thứ tự của issue.

## Trạng thái

- **Loại:** Đã rà soát và xác minh cấu trúc test/script ở frontend/backend; không xóa file
- **Phạm vi:** `online-store-frontend` và `online-store-backend`
- **Trạng thái hiện tại:** Đã xử lý các lỗi wiring xác định được; kiểm tra cuối đạt 12 PASS, 0 FAIL
- **Phạm vi còn lại:** Các alias suite dùng chung file được giữ có chủ đích; script manual/legacy chỉ được phân loại, không tự động xóa

## Mô tả

Sau khi các lỗi chức năng chính của order và product stats đã được xác minh, cần kiểm tra lại các file test và script còn lại để xác định:

- File nào đang được gọi qua `package.json` hoặc unified test runner.
- File nào được đăng ký trong `testRegistry.js`.
- File nào chỉ là script chạy thủ công hoặc không còn được tham chiếu.
- Có nhóm test hoặc script bị chạy trùng hay không.

Phạm vi rà soát không bao gồm việc xóa file tự động. Các file chỉ được phân loại theo bằng chứng tham chiếu trong repository.

## Kết quả rà soát frontend

### 1. Frontend có lệnh kiểm tra thủ công

File frontend hiện có:

- `online-store-frontend/src/test/offline-support.test.ts`
- `online-store-frontend/src/test/offline-manual.js`

`online-store-frontend/package.json` hiện có script `test` trỏ đúng tới `node src/test/offline-manual.js`. Đây là kiểm tra offline thủ công bằng Node, không phải Jest/Vitest runner; `offline-support.test.ts` vẫn chưa được tự động chạy trong pipeline này.

### 2. Mức độ đánh giá

- `offline-support.test.ts`: **Chưa được wiring tự động**, chưa đủ bằng chứng để kết luận dư thừa vì có kiểm tra IndexedDB thực tế.
- `offline-manual.js`: **Script kiểm tra thủ công đang hoạt động**; hướng dẫn chạy đã khớp với vị trí file thực tế.

## Kết quả rà soát backend

### 1. Package scripts backend hiện hợp lệ

`online-store-backend/package.json` hiện không còn script `test:tier3`, `test:suite`, `test:suites` hoặc `test:tags` được ghi nhận trong bản rà soát ban đầu. Các script test còn lại trỏ tới file hiện có, bao gồm `test`, `test:list`, `test:simple` và các test VNPay.

`online-store-backend/src/test/test-runner.js` vẫn hỗ trợ tham số dạng `--suite=...`, `--suites=...` và `--tags=...` khi chạy trực tiếp. Không có wrapper npm thiếu tham số cần duy trì.

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

## Cập nhật xác minh sau khi sửa wiring

Đã cập nhật `online-store-backend/package.json` để loại bỏ các npm script seed trỏ tới file không tồn tại:

- `seed:tier1`
- `seed:tier2`
- `seed:unified`
- `seed:tier1:clear`

Không tạo file seed thay thế và không chạy seed, vì các lệnh này có thể ghi dữ liệu vào database. Các script seed hợp lệ dùng `src/seeds/index.js` vẫn được giữ nguyên.

Tập lệnh PowerShell dynamic mới được chạy trực tiếp tại workspace `26-4-3 copy 37`, không tạo file mới, không chạy API và không chạy lại test chức năng của issue-1/2/3.

### Kết quả lần chạy mới nhất

```text
13 PASS, 1 FAIL, 0 WARN
```

Các kiểm tra đạt:

- Required files tồn tại.
- `testRegistry.js`, `test-runner.js`, `offline-manual.js` vượt qua `node --check`.
- Không còn npm script backend trỏ tới file thiếu.
- Các npm seed script hỏng đã được loại bỏ.
- Frontend `npm test` trỏ tới `node src/test/offline-manual.js`.
- Registry tham chiếu các file test tồn tại.
- `npm run test:list` kết thúc với exit code `0`.
- Registry hiện có 8 suite và 9 file test được tham chiếu.

### FAIL còn lại

```text
offline-manual.js không còn lệnh cũ
```

FAIL này xuất hiện trong workspace chạy test vì file `online-store-frontend/src/test/offline-manual.js` tại workspace đó vẫn chưa chứa dòng:

```text
node src/test/offline-manual.js
```

Bản file hiện tại trong repository đã có đúng hướng dẫn này tại dòng 3. Vì vậy cần đồng bộ workspace chạy test với repository trước khi kết luận còn lỗi code. Không nên sửa bằng cách tạo file mới.

### Kết luận cập nhật

- **Đã xử lý:** toàn bộ npm script backend trỏ tới file seed không tồn tại.
- **Đã đạt:** kiểm tra required files, syntax, registry, frontend npm command và `npm run test:list`.
- **Còn chờ đồng bộ workspace:** nội dung cũ của `offline-manual.js`.
- **Không phát sinh:** lỗi mới trong API hoặc các test chức năng của issue-1/2/3.

**Trạng thái cập nhật mới nhất:** Issue-4 đạt **13 PASS, 1 FAIL, 0 WARN**; FAIL còn lại là khác biệt workspace frontend, trong khi bản repository đã có lệnh chạy offline đúng.

## Cập nhật tiến độ hiện tại

Đợt rà soát này đối chiếu trực tiếp các file hiện có trong repository, không xóa file manual/legacy và không chạy seed hoặc test có khả năng ghi dữ liệu.

### Đã xác minh

- [x] `online-store-backend/package.json` hiện chỉ giữ các script seed hợp lệ đã được kiểm tra trong báo cáo.
- [x] `testRegistry.js` có 8 suite; các file được registry tham chiếu đều tồn tại.
- [x] `resolveTestFiles()` khử trùng đường dẫn khi nhiều suite cùng tham chiếu một test.
- [x] `online-store-frontend/src/test/offline-manual.js` đã dùng lệnh `node src/test/offline-manual.js`.

### Còn tồn tại

- Alias `orders`/`vnpay` và `rollback`/`shadow-writes` vẫn dùng chung file; đây là trùng wiring có chủ đích, không phải file dư thừa.
- Workspace PowerShell trong báo cáo cũ còn lệch nội dung `offline-manual.js`; cần đồng bộ workspace trước khi xem đó là lỗi repository.
- Các script manual/diagnostic và các bản trùng tên trong `scripts/` với `src/scripts/` chưa được xóa vì chưa có xác nhận duy trì.

### Kết luận tiến độ

Issue-4 đã xử lý các lỗi wiring chắc chắn trong phạm vi repository. Phần còn lại là xác nhận workspace chạy kiểm tra và quyết định vòng đời các script manual/legacy; chưa có cơ sở an toàn để xóa thêm file.

## Kết quả xác minh cuối cùng

Đã chạy lại tập lệnh PowerShell dynamic trực tiếp trong workspace `26-4-3 copy 38`, từ thư mục `online-store-backend`. Tập lệnh chỉ kiểm tra nội dung hiện có và không tạo hoặc sửa bất kỳ file nào.

```text
KẾT QUẢ ISSUE-4: 12 PASS, 0 FAIL
```

Đã xác nhận đạt:

- Thư mục backend và frontend tồn tại.
- `testRegistry.js` và `test-runner.js` vượt qua kiểm tra cú pháp.
- NPM backend không còn tham chiếu JavaScript thiếu.
- Mọi file test được registry tham chiếu đều tồn tại.
- Registry có đủ 8 suite.
- `npm run test:list` chạy thành công.
- `offline-manual.js` hợp lệ.
- Frontend `npm test` trỏ đúng tới `node src/test/offline-manual.js`.
- Không còn lệnh offline manual cũ.

Các lỗi trước đó do dấu nháy của lệnh `node -e` trong PowerShell và workspace cũ chưa đồng bộ đã được loại bỏ khỏi kết quả kiểm tra.

**Trạng thái cuối của lần kiểm tra lịch sử:** Issue-4 đạt **12 PASS, 0 FAIL** theo tập tiêu chí đã chạy tại thời điểm đó; không tạo file mới.

## Đối chiếu repository hiện tại

Đã đối chiếu tại commit `00dd0ee`:

- `online-store-backend/src/test/testRegistry.js` vẫn có các alias cùng tham chiếu file VNPay giữa `orders` và `vnpay`, cũng như `test-shadow-writes.js` giữa `rollback` và `shadow-writes`.
- Các alias này không phải file dư thừa và runner có thể khử trùng danh sách chạy, nhưng không nên diễn giải kết quả lịch sử là đã loại bỏ toàn bộ wiring trùng.
- Các cặp script cùng tên giữa `online-store-backend/scripts/` và `online-store-backend/src/scripts/` vẫn cần được đối chiếu trước khi có thể phân loại/xóa bản legacy.

**Trạng thái hiện tại:** Hoàn tất phần sửa npm script và lệnh offline manual đã xác minh; việc phân loại alias suite và script legacy vẫn còn mở, không tự xóa file.

## Cập nhật đối chiếu repository hiện tại

Đợt rà soát này xác nhận trạng thái hiện tại mà không chạy test hoặc sửa mã nguồn:

- Frontend vẫn chạy `npm test` bằng `node src/test/offline-manual.js`.
- Backend không còn các script `test:tier3`, `seed:tier1`, `seed:tier2`, `seed:unified` hoặc `seed:tier1:clear` trỏ tới file thiếu.
- `testRegistry.js` vẫn có 8 suite. Các alias `orders`/`vnpay` và `rollback`/`shadow-writes` là wiring có chủ đích; `resolveTestFiles()` khử trùng danh sách file khi chạy chung.
- Các số liệu PowerShell và đường dẫn workspace ở các phần trước là kết quả lịch sử, không phải bằng chứng runtime mới của repository hiện tại.

**Trạng thái cập nhật:** Wiring chính đang hợp lệ. Chỉ còn quyết định vận hành về alias suite, test manual và các script legacy; không có cơ sở để tự xóa hoặc di chuyển file trong đợt rà soát tài liệu này.

## Cập nhật tiến độ đối chiếu hiện tại

- **Trạng thái:** Hoàn tất phần sửa wiring xác định được; phân loại alias/manual/legacy vẫn là việc vận hành còn mở.
- **Đã xác nhận trong mã nguồn:** Các npm script trỏ file thiếu đã được loại bỏ; `offline-manual.js` dùng đúng lệnh; registry còn 8 suite. Alias `orders`/`vnpay` và `rollback`/`shadow-writes` dùng chung file có chủ đích, runner khử trùng danh sách khi chạy chung.
- **Còn theo dõi:** Không tự xóa test hoặc script legacy chỉ dựa trên tên/đường dẫn; cần quyết định riêng sau khi xác nhận nhu cầu vận hành.
