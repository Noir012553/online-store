# Yêu cầu ảnh sản phẩm giữa import và storefront

## Hiện trạng đã kiểm tra

- **Ảnh sản phẩm chính (`image`)**: bắt buộc trong MongoDB schema (`online-store-backend/src/models/Product.js`) và danh sách trường bắt buộc của import validator (`online-store-backend/src/utils/productImportValidator.js`). Storefront dùng ảnh này cho product card và làm ảnh dự phòng khi danh sách gallery trống. Nếu URL thiếu hoặc ảnh không tải được, card hiển thị placeholder; trang chi tiết hiển thị trạng thái không có ảnh. Vì vậy UI có thể render sản phẩm thiếu ảnh, nhưng dữ liệu import hiện không cho phép thiếu trường `image`.
- **Ảnh gallery (`images`)**: tùy chọn; trang chi tiết chỉ hiện thumbnail khi có nhiều hơn một ảnh.
- **Ảnh mô tả (`descriptionImages`)**: là mảng tùy chọn trong Product schema. Storefront hiện không render mảng này trong phần mô tả sản phẩm: tab mô tả chỉ hiển thị nội dung văn bản. Dữ liệu ảnh mô tả được truyền qua một số adapter/UI, nhưng không xuất hiện cho khách mua hàng.
- **Ngoại lệ ở luồng seed**: `productSeedPipeline` bật `requireDescriptionImage: true`. Validator từ chối sản phẩm có mô tả văn bản nhưng không còn ảnh mô tả hợp lệ. Vì vậy, nếu ảnh nguồn trả 404 hết, sản phẩm có thể bị loại dù ảnh chính vẫn tải được.

## Vấn đề

Quy tắc bắt buộc hiện không nhất quán với mức độ sử dụng trên storefront: ảnh chính là trường bắt buộc ở schema/import dù UI có placeholder; còn ảnh mô tả không được hiển thị cho khách nhưng lại có thể là điều kiện chặn import. Với nguồn có ảnh mô tả hỏng hoặc không cung cấp ảnh mô tả, sản phẩm có thể bị bỏ qua không cần thiết.

## Quy tắc đề xuất để xác nhận

- Bắt buộc ít nhất một ảnh sản phẩm chính/gallery dùng được để sản phẩm có hình đại diện trên storefront.
- Ảnh mô tả là tùy chọn; ảnh nào tải lỗi thì bỏ qua riêng ảnh đó, không làm hỏng cả sản phẩm.
- Nếu toàn bộ ảnh mô tả lỗi hoặc nguồn không có ảnh mô tả, vẫn cho import khi ảnh sản phẩm chính hợp lệ.
- Chỉ yêu cầu ảnh mô tả nếu storefront được xác nhận sẽ hiển thị chúng và nghiệp vụ yêu cầu nội dung mô tả bằng ảnh.

## Thành phần liên quan

- `online-store-backend/src/models/Product.js`
- `online-store-backend/src/utils/productImportValidator.js`
- `online-store-backend/src/seeds/productSeedPipeline.js`
- `online-store-frontend/src/components/ProductCard.tsx`
- `online-store-frontend/src/pages/product/[id].tsx`
- `online-store-frontend/src/components/product/ProductGallery.tsx`
- `online-store-frontend/src/components/product/ProductInformationTabs.tsx`
