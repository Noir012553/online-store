# Phân tích lỗi kiểm thử Backend

## 1. Tóm tắt

Log được tạo lúc `2026-09-09T08:12:05.447Z` ghi nhận nhiều nhóm lỗi khác nhau, không phải một lỗi duy nhất:

- Unit test controller dùng mock không còn khớp với query chain và contract hiện tại.
- Một số integration test dùng endpoint, token và fixture theo schema cũ.
- Một số lỗi là lỗi code thực trong translation cache.
- Các test export/import/language sync/E2E phụ thuộc MongoDB, dữ liệu mẫu, backend đang chạy và token admin; không thể đánh giá như unit test độc lập.
- Chuỗi tiếng Việt bị mojibake trong log (`MĂ£`, `KhĂ´ng`, `â...`) là lỗi encoding hiển thị/log, không phải nguyên nhân chính của các assertion `include('usage limit')`, `include('at least')`.

## 2. Mức độ đã khắc phục

### Đã được cập nhật một phần

- Lỗi production dùng raw `lang` trong fallback/health đã được sửa; chi tiết nằm ở mục 8.
- Review role đã được overlay theo locale và fallback về ngôn ngữ mặc định; chi tiết nằm ở mục 8.

- Query chain của Product đã có `.maxTimeMS()`, `.populate()`, `.lean()`, `.sort()`, `.limit()` và `.skip()` tại `src/controllers/productController.js:658-668`.
- Category localization đã dùng `.select().maxTimeMS().lean()` tại `src/services/categoryLocalizationService.js:15-24`.
- Một số mock Product/Category translation đã bổ sung các method chain tương ứng trong test.
- VNPAY đã kiểm tra bắt buộc `clientIp` và `description` tại `src/adapters/payment/VnpayAdapter.js:157-179`.
- Route manual override đã được bảo vệ bởi `protect` và `admin`.

### Chưa khắc phục hoặc còn sai contract

#### VNPAY

- Assertion format ngày có thể phụ thuộc timezone: code luôn format theo `Asia/Ho_Chi_Minh`, trong khi test tạo `Date` theo timezone của process (`src/adapters/payment/VnpayAdapter.js:654-665`).
- Nếu test yêu cầu `callbackUrl` là config bắt buộc thì code chưa kiểm tra field này; `validateConfig()` hiện chỉ kiểm tra `partnerId`, `partnerKey`, `endpoint`, `returnUrl` (`src/adapters/payment/VnpayAdapter.js:76-83`).
- Các lỗi thiếu `clientIp` và `description` trong log có thể xuất hiện khi test truyền thiếu cả các field trước đó. Test nên kiểm tra từng input độc lập để assertion ổn định.

#### Category

- `getCategories()` và localization đang dùng query chain hợp lệ (`src/controllers/categoryController.js:84-97`).
- Test hard-delete cần mock `Product.countDocuments()`, vì controller kiểm tra category còn liên kết với sản phẩm trước khi xoá (`src/controllers/categoryController.js:208-224`). Nếu không mock, test có thể chờ MongoDB thật và timeout.

#### Coupon

- Controller hiện dùng chain `populate().populate().sort().limit().skip()` tại `src/controllers/couponController.js:67-73`.
- Mock hiện tại cần cung cấp đầy đủ chain này.
- Một số assertion validation bắt exception trong `try/catch` nhưng không luôn kiểm tra `errorThrown`, nên test có thể pass giả hoặc không chỉ ra đúng lỗi.
- Các message tiếng Việt bị sai encoding trong log làm assertion tiếng Anh như `usage limit` và `at least` thất bại; cần thống nhất message API hoặc kiểm tra error code thay vì phụ thuộc text đã dịch.

#### Order

- Controller nhận `cartItems`, nhưng test gửi `orderItems` (`src/controllers/orderController.js:117-134`).
- `updateOrderToDelivered()` và `deleteOrder()` dùng `Order.findOne()`, nhưng test mock `Order.findById()` (`src/controllers/orderController.js:869-892`, `987-1001`).
- `getOrders()` dùng chain dài `populate().populate().sort().limit().skip().maxTimeMS().lean()` (`src/controllers/orderController.js:832-854`); mock phải mô phỏng đủ chain.
- Lỗi `updateOrderToPaid is not a function` cho thấy test đang import API không còn được export hoặc dùng tên hàm cũ. Cần đối chiếu export cuối controller với test trước khi sửa logic.

#### Product

- `createProduct()` yêu cầu image, giá dương, tồn kho, category ObjectId, currency hợp lệ và user (`src/controllers/productController.js:725-849`). Fixture hiện tại thiếu nhiều field và file chỉ có `path`, trong khi code legacy đọc `req.file.buffer`.
- `updateProduct()` gọi lại `Product.findById(...).populate('category')` sau khi save (`src/controllers/productController.js:1102-1106`). Mock trả Promise trực tiếp nên gây `populate is not a function`.
- Các test list không phải test translation vẫn đi qua `overlayTranslationBatchWithFallback()`, vì vậy cần mock `ProductCatalogTranslationCache.find().select().maxTimeMS().lean()` hoặc tách lớp translation khỏi unit test controller.
- Lỗi `req.lang.toUpperCase()`/`res.status is not a function` xuất phát từ fixture request/response chưa mô phỏng đầy đủ contract controller, không nên sửa bằng fallback tuỳ tiện trong production code nếu middleware luôn cung cấp các field đó.

#### Review

- `getProductReviews()` cần chain `populate().limit().skip().lean()`. Các mock mới đã có chain này ở một số test.
- Controller đã overlay `role` theo `lang`, fallback về ngôn ngữ mặc định; phần còn thiếu là regression test trực tiếp cho locale và fallback.

#### User/Auth

- `tokenConfig` yêu cầu access secret và refresh secret (`src/config/tokenConfig.js:2-20`). Test chỉ đặt `JWT_SECRET` có thể vẫn fail khi thiếu `JWT_REFRESH_SECRET`.
- Các endpoint dùng `.select()` như `getUserById()` và refresh token cần mock query chain đầy đủ.
- Lỗi `req.headers.authorization` cho thấy request fixture thiếu `headers` hoặc test gọi controller không qua middleware auth.

## 3. Translation và integration

### Route manual override sai

Route thực tế là:

```text
POST /api/translations/admin/manual-override
```

và yêu cầu `protect` + `admin` tại `src/routes/translationRoutes.js:242-249`.

Một số test lại gọi:

```text
POST /api/translations/manual-override
```

và không gửi admin Bearer token. Đây là nguyên nhân 404/401 độc lập với translation logic.

### Fixture translation theo schema cũ

`translation-integration.test.js` tạo Product bằng các field cũ như `basePrice`, `specifications`, nhưng Product hiện yêu cầu `user`, `image`, `brand`, `category`, `price`, `baseCurrencyCode` và các field liên quan. Review cũng dùng `productId`, `userId`, `title`, `content` thay vì schema hiện tại. Vì vậy lỗi validation:

```text
Product validation failed: baseCurrencyCode, category, brand, image, user...
```

là lỗi fixture/test contract, không phải lỗi cache.

### Điều kiện cache chưa đủ

Các record Product translation dùng trong integration test cần các trạng thái mà controller lọc, đặc biệt `status: 'success'` và `qualityStatus: 'approved'`. Nếu thiếu `qualityStatus`, cache mới có thể bị bỏ qua.

### Lỗi code thật ở fallback/health cache — đã sửa

Trong `src/controllers/translationController.js`, fallback và health hiện dùng thống nhất `resolvedLang` cho response, query `StaticTranslation` và cache key. Trước đây request không truyền `lang` có thể tạo response/query không nhất quán; cần giữ regression test cho điều kiện này.

## 4. Export/import, language sync và E2E

Các test sau không phải unit test độc lập:

- `export-production.test.js`
- `import-export.test.js`
- `language-setup-blueprint.test.js`
- `language-sync.test.js`
- `rollback-procedures.test.js`
- `translation-e2e.test.js`
- `translation-integration.test.js`
- `with-order.test.js`

Chúng cần các điều kiện ngoài code test:

- MongoDB kết nối được và có dữ liệu Product/Category/Currency hợp lệ.
- Backend đang chạy đúng base URL.
- `ADMIN_TOKEN` hợp lệ; token mặc định `test-token` sẽ gây 401.
- Export cần user/admin credential và quyền phù hợp.
- E2E dừng ngay nếu không có `ADMIN_TOKEN`.

`src/test/test-config.js:8-17` đánh dấu chúng là integration test; mặc định runner loại chúng trừ khi `RUN_INTEGRATION_TESTS=true`.

## 5. Kết quả xác minh trong phiên này

- Đã kiểm tra syntax bằng `node --check` cho các controller và test/config file đã sửa.
- Đã kiểm tra `test-registry.js` resolve đúng các suite Products/Orders/VNPAY, không còn cảnh báo từ các path test controller đã bị thiếu.
- Đã chạy `git diff --check` thành công.
- Chưa có số liệu pass/fail runtime đáng tin cậy cho integration vì cần dependency local đúng phiên bản, MongoDB, backend ready và credential hợp lệ.
- Không chạy `npm run build` theo yêu cầu.

## 6. Thứ tự xử lý đề xuất

1. Khôi phục/cài đúng dependency theo lockfile, sau đó chạy riêng từng unit suite.
2. Sửa test fixture/mock theo contract hiện tại: `cartItems`, `findOne`, query chain, Product schema và JWT refresh secret.
3. Chuẩn hoá assertion message theo error code hoặc message tiếng Anh ổn định; xử lý encoding terminal/log riêng.
4. Sửa URL và auth của integration tests; tạo fixture đúng Product/Review schema.
5. Sửa `lang` thành `resolvedLang` trong fallback/health controller.
6. Chỉ chạy integration/export/import/E2E sau khi Mongo, backend, dữ liệu và token đã được cấu hình.

## 7. Đối chiếu bổ sung: các vấn đề trước đây còn thiếu

Báo cáo ban đầu chưa bao quát hết các lỗi contract xác định được từ mã nguồn hiện tại:

### Route và cách gọi API

- `translation-integration.test.js` gọi `/api/translations/products?productId=...` và `/api/translations/reviews?reviewId=...`, trong khi route hiện hành yêu cầu tham số path: `/api/translations/products/:id` và `/api/translations/reviews/:id`.
- Test manual override gọi `/api/translations/manual-override`, thiếu `/admin`, thiếu Bearer token và còn không seed translation record trước khi override. Đây là ba lỗi độc lập: route, auth và dữ liệu đầu vào.
- `translation-e2e.test.js` dùng tiền tố số ít `/language` và `/translation`; app mount route số nhiều là `/api/languages` và `/api/translations`.

### Harness và vòng đời ứng dụng

- `translation-integration.test.js` từng import `require('../app')` nguyên object thay vì destructure `{ app }`.
- `app.js` chỉ gọi `connectDB()` khi chạy trực tiếp và `requireDatabase` còn yêu cầu cờ `startupReady`. Import app rồi tự gọi `mongoose.connect()` trong Supertest chưa đủ để request qua middleware này; integration test cần chạy qua backend đã khởi động hoặc dùng harness khởi động đầy đủ.
- `test-registry.js` còn tham chiếu một số controller test không tồn tại trong checkout hiện tại. Các suite đó cần được khôi phục hoặc bỏ khỏi registry, không nên coi cảnh báo thiếu file là lỗi production.
- `test-config.js` từng khai báo `fs` hai lần, khiến test runner không parse được trước khi chạy bất kỳ suite nào.

### Response contract và assertion

- `language-sync.test.js` chờ `res.data.success/data`, trong khi product list hiện trả `{ products, page, pages, total }`.
- Một số integration assertion chỉ kiểm tra tiếp khi status là 200, khiến 401/404 có thể pass giả. Test phải assert status mong đợi trước rồi mới kiểm tra body.
- Fixture translation mới phải có `status: 'success'` và `qualityStatus: 'approved'`; mặc định model là `pending` nên record bị controller bỏ qua.

### Khoảng trống chức năng

- `getProductReviews()` đã nhận `lang` nhưng trước đây trả nguyên object `role` đa ngôn ngữ thay vì overlay role theo locale. Đây là lỗi chức năng riêng, không phải lỗi query chain.
- Fallback/health vẫn chưa có regression test riêng cho request không truyền `lang` và request truyền locale không được hỗ trợ; đây là phần nên bổ sung để bảo vệ bản sửa `resolvedLang`.

## 8. Thay đổi đã triển khai trong lượt này

- `src/controllers/translationController.js`: loại bỏ khai báo `StaticTranslation` trùng khiến module không parse được; fallback dùng `resolvedLang` cho `requestedLang` và `fallbackUsed`; health dùng `resolvedLang` khi query `StaticTranslation`, tạo response và ghi cache.
- `src/controllers/reviewController.js`: overlay `role` theo ngôn ngữ yêu cầu, fallback về ngôn ngữ mặc định hoặc chuỗi rỗng.
- `src/test/translation-integration.test.js`: sửa import app, dùng đúng path parameter, bổ sung `qualityStatus: 'approved'`, thay fixture Product/Review theo schema hiện hành, sửa manual override sang route admin có Bearer token và bỏ assertion pass giả.
- `src/test/translation-e2e.test.js`: sửa các endpoint sang `/languages` và `/translations` đúng với app mount.
- `src/test/language-sync.test.js`: đọc danh sách sản phẩm từ `res.data.products` theo response contract thực tế.
- `src/test/test-registry.js`: thay các đường dẫn controller test không tồn tại bằng test file hiện có, tránh cảnh báo file thiếu khi chọn suite.
- `src/test/test-config.js`: loại bỏ import `fs` trùng để test runner có thể load cấu hình.

## 9. Các hạng mục vẫn cần triển khai có điều kiện

Các hạng mục sau chưa thể xác nhận hoặc hoàn tất chỉ bằng sửa mã nguồn vì phụ thuộc môi trường hoặc test snapshot khác:

1. Đồng bộ toàn bộ unit mock cho query chain, `cartItems`, `findOne`, `select`, `populate` và export controller.
2. Sửa harness integration để khởi động DB/app đầy đủ, hoặc chuyển các test HTTP sang `TEST_API_BASE_URL` của backend đang chạy.
3. Thống nhất assertion theo `code`/message ổn định thay vì chuỗi dịch phụ thuộc encoding.
4. Xác nhận contract `callbackUrl` của VNPAY với deployment trước khi thêm validation.
5. Chạy riêng unit và integration sau khi cài dependency đúng lockfile, MongoDB sẵn sàng, backend đã ready và có `ADMIN_TOKEN` hợp lệ.

## Kết luận

Báo cáo ban đầu chưa đủ toàn bộ vấn đề dự đoán gặp; các nhóm route sai, harness chưa ready, response shape lệch, assertion pass giả, fixture thiếu trạng thái, lỗi parse test runner và khoảng trống role localization đã được bổ sung. Các lỗi cache dùng raw `lang`, overlay role, fixture/route/assertion translation, registry và import trùng khiến test runner không parse được đã được triển khai. Phần còn lại chủ yếu là đồng bộ mock unit, khởi động backend/MongoDB đúng lifecycle và xác minh runtime với credential hợp lệ.
