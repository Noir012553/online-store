# Điều tra `features` và luồng dịch sản phẩm

## Tóm tắt

Một số sản phẩm trả về `features` dưới dạng các key kỹ thuật như:

```json
[
  "feature_wireless_connectivity",
  "feature_rgb_backlight",
  "feature_long_battery"
]
```

Đây không phải value rỗng. Đây là các key static i18n, được dùng để tra label trong locale `products`.

Vấn đề là cùng field `features` hiện đang bị dùng cho hai mục đích khác nhau:

- Static translation coi phần tử là key `feature_*`.
- Dynamic translation coi phần tử là nội dung tự do cần gửi cho AI dịch.

Vì vậy pipeline có thể dịch nhầm key kỹ thuật, lưu dữ liệu không nhất quán hoặc trả ngược key ra frontend.

## Luồng hiện tại

```text
Product.features
  -> dynamic translation nếu có bản dịch theo index
  -> nếu không có thì giữ feature gốc
  -> nếu còn dạng feature_* thì frontend gọi static t(...)
  -> nếu không tìm thấy static key thì hiển thị nguyên feature_*
```

Các vị trí liên quan:

- `online-store-frontend/src/components/ProductCard.tsx:55-58`
- `online-store-frontend/src/pages/product/[id].tsx:277-280`
- `online-store-backend/src/services/productTranslationSeederService.js:283-315`
- `online-store-backend/src/services/translationSeederHelper.js:284-308`

Frontend hiện dùng fallback theo dạng:

```text
dynamic translated feature
  -> original feature key
  -> static i18n lookup
  -> original key nếu không tìm thấy
```

## `features` và `featureLabels`

Endpoint export tạo hai trường riêng:

- `features`: giữ nguyên `product.features`.
- `featureLabels`: map từng feature qua `getFeatureLabel(feature, exportLanguage)`.

Vị trí:

- `online-store-backend/src/controllers/productImportController.js:78-82`
- `online-store-backend/src/controllers/productImportController.js:1045-1049`

Do đó `featureLabels` không chứng minh rằng `features` đã được dynamic translation. Nó chỉ là nhãn static được tạo riêng cho export.

## Những điều đã xác nhận

### Backend không tự sinh key khi đọc sản phẩm

Khi tạo sản phẩm, backend nhận `features` từ request và lưu trực tiếp:

- `online-store-backend/src/controllers/productController.js:459-462`
- `online-store-backend/src/controllers/productController.js:570`

Nếu request không có `features`, giá trị lưu là `[]`:

```js
features: features || []
```

Schema `Product` cũng chỉ khai báo mảng string, không có logic tự sinh `feature_*`:

- `online-store-backend/src/models/Product.js:151-158`

### Dynamic seeder đang coi key là text cần dịch

Seeder duyệt từng phần tử của `product.features` và đưa vào luồng translation:

- `online-store-backend/src/services/productTranslationSeederService.js:283-315`
- `online-store-backend/src/services/translationSeederHelper.js:284-308`

Nếu phần tử là `feature_rgb_backlight`, hệ thống có thể gửi chính chuỗi kỹ thuật đó cho dynamic translator, dù static locale đã có bản dịch chuẩn cho key này.

### Policy hiện tại loại key kỹ thuật khỏi dữ liệu nguồn tiếng Việt

`translationHelper` yêu cầu feature nguồn không được có dạng `feature_*`:

- `online-store-backend/src/services/translationHelper.js:64-67`

Điều này tạo xung đột nếu sản phẩm hợp lệ theo mô hình static key nhưng lại bị kiểm tra như nội dung tiếng Việt tự do.

## GreaVN

Hiện repository không có adapter, service hoặc cấu hình endpoint nào được nhận diện rõ ràng là GreaVN. Vì vậy chưa thể xác minh raw response của GreaVN.

Kết luận an toàn hiện tại:

- Nếu GreaVN không gửi `features`, endpoint tạo sản phẩm sẽ lưu `features: []`; backend không tự sinh key.
- Nếu raw response GreaVN đã chứa `feature_*`, key xuất phát từ nguồn hoặc adapter/transform trước khi lưu.
- Nếu raw response chứa câu chữ nhưng database chứa `feature_*`, lỗi nằm ở bước normalize/transform.
- Cần raw request/response hoặc code đồng bộ GreaVN để kết luận chính xác.

## Kết luận kỹ thuật

Đây không chỉ là lỗi fallback. Gốc vấn đề là một field đang trộn hai loại dữ liệu:

1. Static feature key: `feature_rgb_backlight`.
2. Dynamic feature content: `Đèn RGB có thể điều chỉnh`.

Không nên đưa static key `feature_*` qua AI dynamic translation.

## Hướng xử lý đề xuất

1. Xác định và ghi rõ contract của `Product.features`:
   - Nếu là static key, chỉ resolve qua locale và bỏ qua dynamic translation.
   - Nếu là nội dung tiếng Việt, không lưu key `feature_*` và cho phép dynamic translation.
2. Loại các feature dạng `feature_*` khỏi danh sách gửi tới AI dynamic translator.
3. Khi kiểm tra bản dịch tiếng Việt, không coi static key là value tự do bị lỗi; thay vào đó kiểm tra key có tồn tại trong locale tương ứng.
4. Thống nhất response storefront để không cần vừa trả `features` vừa tạo `featureLabels` cho cùng một mục đích.
5. Kiểm tra raw response GreaVN trước bước lưu dữ liệu để xác định nguồn tạo key.
6. Bổ sung test cho ba trường hợp:
   - feature là static key hợp lệ;
   - feature là nội dung tự do cần dynamic translation;
   - feature là key không tồn tại trong locale và không được hiển thị nguyên key.

## Kết quả kiểm tra locale và lỗi trang admin

Các file `src/locales/*/products.json` hiện đã có đủ bộ static feature key/value cho 9 ngôn ngữ bắt buộc. Bộ key hiện tại gồm các key như `feature_programmable_keys`, `feature_rgb_backlight`, `feature_long_battery` và các feature static liên quan khác.

Tuy nhiên, trang `/admin/translationsDynamic` đang hiển thị trực tiếp giá trị nguồn từ `Product.features`:

- `online-store-frontend/src/pages/admin/translationsDynamic.tsx:691-702`
- Cột tiếng Việt render trực tiếp `{feature || '-'}`.
- Trang này không gọi `t(feature, 'products')` để resolve static key thành value trong locale.

Vì vậy khi dữ liệu chứa `feature_programmable_keys`, admin nhìn thấy key kỹ thuật thay vì `Lập trình nút tùy chỉnh`, dù value đã tồn tại trong `src/locales/vi/products.json`.

Storefront đã có logic resolve static key tại:

- `online-store-frontend/src/pages/product/[id].tsx:277-280`
- `online-store-frontend/src/components/ProductCard.tsx:55-58`

Đây là lý do admin và storefront có thể hiển thị cùng một feature khác nhau.

## Hai phương án xử lý

### Phương án 1: Bỏ hoàn toàn `Product.features`

Phương án này loại bỏ request dynamic translation cho features và loại bỏ lỗi key, nhưng làm mất dữ liệu tính năng trên storefront, admin và export/import. Không chọn phương án này nếu sản phẩm vẫn cần hiển thị các tính năng nổi bật.

### Phương án 2: Giữ features và tách static/dynamic — phương án được chọn

`Product.features` được xử lý theo hai loại:

- Feature bắt đầu bằng `feature_`: static key, resolve bằng locale, không gửi qua AI và không tạo cache dynamic.
- Feature là nội dung tự do: giữ nguyên text nguồn, gửi qua dynamic translator và lưu bản dịch trong cache.

Trang admin phải resolve static key khi hiển thị cột tiếng Việt và cột ngôn ngữ đích. Với static key, bản dịch đích cũng lấy từ namespace `products` thay vì đọc bản dịch AI đã tạo trước đó.

Backend seeder phải bỏ qua mọi feature static key trước khi tạo translation task. Các key không tồn tại trong locale phải được phát hiện qua validation và không được hiển thị nguyên key cho khách hàng.

## Kết luận

Không thiếu value static trong JSON đối với bộ key hiện tại. Lỗi chính là trang admin chưa thực hiện static lookup, đồng thời pipeline dynamic translation vẫn gửi static key qua AI. Giữ `features` và tách static/dynamic sẽ bảo toàn dữ liệu sản phẩm, sửa hiển thị admin và giảm request dịch thừa.
