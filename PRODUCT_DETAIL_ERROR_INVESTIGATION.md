# Điều tra lỗi trang chi tiết sản phẩm

## Trạng thái

- Đã điều tra, chưa sửa mã nguồn.
- URL tái hiện: `/product/6a8dc0adc4e6879f6c9f3426`
- Giao diện hiển thị:
  - `Không tìm thấy sản phẩm`
  - `Lỗi tải sản phẩm`

## Kết luận

Sản phẩm không bị thiếu và không phải do cache detail bị hỏng. API sản phẩm chính trả dữ liệu hợp lệ, nhưng request tải sản phẩm liên quan bị timeout. Do request phụ nằm chung trong `try/catch` với request sản phẩm chính, lỗi phụ làm frontend xoá sản phẩm chính và hiển thị thông báo sai.

Nguyên nhân trực tiếp là frontend gửi sai giá trị category khi tải sản phẩm liên quan:

- Backend trả `category` là object có `_id` và `name`.
- `ProductAdapter` chuyển object đó thành:
  - `category`: tên danh mục, ví dụ `Bàn phím`.
  - `categoryId`: ObjectId thật.
- `ProductDetail` lại dùng `product.category` thay vì `product.categoryId`.
- Request liên quan gửi `category=Bàn%20phím`, không phải ObjectId.
- Backend bỏ qua bộ lọc category không hợp lệ, khiến truy vấn mở rộng quá lớn và bị timeout.

## Bằng chứng

### API sản phẩm chính

Request:

```text
/api/products/6a8dc0adc4e6879f6c9f3426?lang=vi&locale=vi-VN&currencyCode=VND
```

Kết quả kiểm tra:

- HTTP response thành công.
- `_id` đúng: `6a8dc0adc4e6879f6c9f3426`.
- `isDeleted: false`.
- Có tên, giá, ảnh, danh mục và tồn kho.

### Adapter frontend

Tại `online-store-frontend/src/lib/adapters.ts:153-160`, category object được chuẩn hoá thành tên danh mục và lưu ID riêng trong `categoryId`.

### Lấy category trong ProductDetail

Tại `online-store-frontend/src/pages/product/[id].tsx:159`:

```tsx
const categoryId = product.category?._id || product.category;
```

Sau khi qua adapter, biểu thức này trả về tên danh mục như `Bàn phím`, không phải ObjectId.

### Request liên quan

Request được gọi tại `online-store-frontend/src/pages/product/[id].tsx:161`.

Khi truyền category dạng tên, request tương đương:

```text
/api/products?pageNumber=1&pageSize=4&lang=vi&locale=vi-VN&currencyCode=VND&category=Bàn%20phím
```

Request này đã được tái hiện và bị timeout.

### Backend bỏ qua category không hợp lệ

Tại `online-store-backend/src/controllers/productController.js:437-458`, backend chỉ áp dụng filter category khi giá trị là MongoDB ObjectId hợp lệ. Giá trị `Bàn phím` không hợp lệ nên filter bị bỏ qua.

Sau đó backend có thể phải xử lý catalog rộng hơn tại:

- `online-store-backend/src/controllers/productController.js:527-541`
- `online-store-backend/src/services/translationHelper.js:170-209`

Phần visibility kiểm tra các bản dịch sản phẩm theo 9 ngôn ngữ, làm request bị chậm hoặc timeout khi phạm vi truy vấn bị mở rộng.

## Vì sao UI báo sai sản phẩm không tồn tại?

Trong `online-store-frontend/src/pages/product/[id].tsx:143-197`, các bước sau nằm chung một `try/catch`:

1. Tải sản phẩm chính.
2. Tải sản phẩm liên quan.
3. Tải review.

Nếu request sản phẩm liên quan lỗi, code tại `src/pages/product/[id].tsx:188-192` thực hiện:

```tsx
setError(...);
setLaptop(null);
```

Vì `laptop` bị đặt thành `null`, UI tại `src/pages/product/[id].tsx:268-276` hiển thị `Không tìm thấy sản phẩm`, dù request sản phẩm chính đã thành công.

## Phân biệt với cache

Log sau đây:

```text
[TranslationCacheService] Cache set: fallback_en_common
[TranslationCacheService] Cache set: fallback_vi_common
```

phát sinh từ:

- `online-store-backend/src/services/translationCacheService.js:54`
- `online-store-backend/src/controllers/translationController.js:2999-3005`

Đây là cache fallback translation. Log `Cache set` chỉ xuất hiện khi cache bị `MISS`, hết hạn hoặc backend process khởi động lại; không phải log do timer flash-deal/countdown tạo ra.

Tuy nhiên, translation cache database có thể làm request liên quan chậm hơn khi category filter bị bỏ qua.

## Vấn đề cần xử lý sau

1. Dùng `categoryId` khi tạo request sản phẩm liên quan.
2. Tách lỗi request sản phẩm liên quan khỏi request sản phẩm chính để không xoá `laptop` đã tải thành công.
3. Cân nhắc backend trả lỗi rõ ràng khi query category có giá trị không hợp lệ thay vì âm thầm bỏ qua filter.
4. Khi kiểm tra cache, đối chiếu Network:
   - `fetch/XHR` tới `/api/products/...`.
   - HTTP status và thời gian response.
   - `Document` request `/` chỉ là reload/điều hướng trang, không phải cache translation.

## Ghi chú

Hai timer trên homepage:

- Flash-deal: `online-store-frontend/src/components/HomeContent.tsx:457-468`.
- Countdown: `online-store-frontend/src/components/HomeContent.tsx:470-488`.

không gọi API, không gọi cache và không liên quan trực tiếp đến lỗi product detail này.
