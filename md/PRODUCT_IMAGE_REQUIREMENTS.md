# Yêu cầu ảnh sản phẩm giữa import và storefront

## Hiện trạng đã kiểm tra

- **Ảnh sản phẩm chính (`image`)**: bắt buộc trong MongoDB schema (`online-store-backend/src/models/Product.js`) và danh sách trường bắt buộc của import validator (`online-store-backend/src/utils/productImportValidator.js`). Storefront dùng ảnh này cho product card và làm ảnh dự phòng khi danh sách gallery trống. Nếu URL thiếu hoặc ảnh không tải được, card hiển thị placeholder; trang chi tiết hiển thị trạng thái không có ảnh. Vì vậy UI có thể render sản phẩm thiếu ảnh, nhưng dữ liệu import hiện không cho phép thiếu trường `image`.
- **Ảnh gallery (`images`)**: tùy chọn; trang chi tiết chỉ hiện thumbnail khi có nhiều hơn một ảnh.
- **Ảnh mô tả (`descriptionImages`)**: là mảng tùy chọn trong Product schema. Storefront hiện không render mảng này trong phần mô tả sản phẩm: tab mô tả chỉ hiển thị nội dung văn bản. Dữ liệu ảnh mô tả được truyền qua một số adapter/UI, nhưng không xuất hiện cho khách mua hàng.
- **Quy tắc seed**: ảnh mô tả không bắt buộc. Ảnh mô tả tải lỗi được bỏ qua; nếu không còn ảnh mô tả nào, sản phẩm vẫn có thể nhập miễn là ảnh chính và các ảnh gallery đã cung cấp tải thành công.

## Quy tắc xử lý lỗi ảnh

- Ảnh chính (`image`) là bắt buộc; nếu thiếu hoặc upload thất bại thì bỏ sản phẩm.
- Gallery có thể không có. Nếu nguồn cung cấp ảnh gallery nhưng bất kỳ ảnh nào không tải/upload được, bỏ sản phẩm và dọn các asset mới đã upload cho sản phẩm đó.
- Ảnh mô tả là tùy chọn; lỗi một ảnh chỉ bỏ ảnh đó. Nếu tất cả ảnh mô tả lỗi hoặc nguồn không có ảnh mô tả, vẫn nhập sản phẩm khi ảnh chính và gallery hợp lệ.
- Storefront hiện chưa hiển thị `descriptionImages`; nếu cần hiển thị nội dung này cho khách, cần triển khai UI riêng.

## Kết quả kiểm thử gần nhất

Lần chạy `npm test` trong bản tải về có 69 test pass và các lỗi tập trung ở bốn file:

- `translation-migration-smoke.test.js` đòi hỏi dữ liệu và TTL index đã có sẵn trong MongoDB. Test hiện chỉ chạy khi đặt `RUN_TRANSLATION_MIGRATION_SMOKE_TESTS=true` cùng `TEST_MONGO_URI`; bình thường `npm test` không kết nối DB và bỏ qua smoke test này. Schema TTL đã khai báo trong model; muốn kiểm tra index vật lý thì chỉ bật test với DB test đã migrate, không dùng DB dùng chung/production.
- `export-job-service.test.js` dùng kỳ vọng tên file asset cũ. Assertion đã được cập nhật theo output hiện tại (`product-id-main-0.jpg`) và `descriptionImages: []`.
- `translation-helper.test.js` dùng `sourceHash` từ dữ liệu sản phẩm cũ sau khi thay đổi description/specs trong fixture. Fixture đã được đồng bộ với biến thể nguồn đang kiểm tra.
- `import-file-validator.test.js` có một số assertion/fixture không khớp contract hiện tại. Các kỳ vọng đã được đồng bộ; test ảnh xác nhận gallery/main lỗi là fatal, còn toàn bộ ảnh mô tả lỗi không chặn sản phẩm.

Chưa chạy lại toàn bộ test sau các cập nhật này. Không chạy migration, seed hoặc `npm run clear` để làm test xanh; không cần chạy build.

## Thành phần liên quan

- `online-store-backend/src/models/Product.js`
- `online-store-backend/src/utils/productImportValidator.js`
- `online-store-backend/src/seeds/productSeedPipeline.js`
- `online-store-frontend/src/components/ProductCard.tsx`
- `online-store-frontend/src/pages/product/[id].tsx`
- `online-store-frontend/src/components/product/ProductGallery.tsx`
- `online-store-frontend/src/components/product/ProductInformationTabs.tsx`
