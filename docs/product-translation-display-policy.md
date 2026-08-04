# Chính sách hiển thị sản phẩm theo độ hoàn chỉnh bản dịch

## Mục tiêu

Sản phẩm chỉ được hiển thị trên storefront khi đã chuẩn bị đầy đủ bản dịch cho **toàn bộ ngôn ngữ được định nghĩa trong hệ thống**.

Quy tắc này áp dụng bất kể ngôn ngữ đang được bật hay tắt trong cấu hình runtime. Một sản phẩm thiếu bản dịch ở bất kỳ ngôn ngữ nào cũng không được hiển thị cho khách hàng.

Ngoại lệ duy nhất là trang admin quản lý dịch sản phẩm. Trang này phải tiếp tục hiển thị tất cả sản phẩm để admin có thể tìm và hoàn thiện bản dịch còn thiếu.

## Danh sách ngôn ngữ bắt buộc

Nguồn chuẩn là `online-store-backend/src/config/languageInventory.js`, biến `SUPPORTED_LANGUAGES`:

```text
vi, en, pt, fr, de, it, es, nl, sv
```

Không dùng `getActiveLangCodes()` cho việc kiểm tra độ hoàn chỉnh của sản phẩm. Hàm đó chỉ trả về các ngôn ngữ đang active, trong khi chính sách này yêu cầu kiểm tra cả ngôn ngữ chưa active.

Khi thêm ngôn ngữ mới vào `SUPPORTED_LANGUAGES`, sản phẩm phải có bản dịch cho ngôn ngữ mới trước khi được hiển thị trên storefront.

## Điều kiện một bản dịch hợp lệ

Bản ghi dịch của sản phẩm được lưu trong collection `product_catalog_translation_cache`, tương ứng với model:

```text
online-store-backend/src/models/ProductCatalogTranslationCache.js
```

Một bản dịch được xem là hợp lệ khi thỏa tất cả điều kiện:

```text
entityId       = ID sản phẩm
 targetLang     = mã ngôn ngữ đang kiểm tra
status         = success
qualityStatus  = approved
```

Ngoài trạng thái, nội dung bắt buộc cũng phải đầy đủ theo yêu cầu nghiệp vụ của sản phẩm. Tối thiểu nên kiểm tra các trường storefront sử dụng:

- `name`
- `description`
- `brand`
- `specs`

Không được coi bản dịch là hoàn chỉnh nếu cache chỉ tồn tại nhưng đang ở trạng thái `pending`, `needs_retranslate`, `rejected` hoặc trạng thái lỗi.

## Lưu ý về ngôn ngữ nguồn `vi`

Hiện tại `vi` là ngôn ngữ mặc định và dữ liệu gốc của sản phẩm nằm trong model `Product`. Trong khi đó, các bản dịch dynamic thường được lưu trong `ProductCatalogTranslationCache` với `targetLang` là ngôn ngữ đích.

Vì chính sách mới yêu cầu đủ cả `vi`, cần thống nhất và triển khai một trong hai cách sau:

1. Tạo bản ghi cache hợp lệ cho `vi` giống các ngôn ngữ khác; hoặc
2. Xem các trường dữ liệu gốc của `Product` là bản dịch `vi`, nhưng bộ kiểm tra hoàn chỉnh phải xác nhận các trường nguồn tương ứng đều có dữ liệu.

Không được bỏ qua `vi` chỉ vì đây là ngôn ngữ mặc định.

## Phạm vi áp dụng

Bộ lọc hoàn chỉnh bản dịch phải được áp dụng ở backend trước khi trả dữ liệu cho các luồng storefront:

- danh sách sản phẩm
- trang chủ
- category
- search
- featured products
- hot deals
- trang chi tiết sản phẩm

Các vị trí storefront hiện đang cần xem xét:

- `online-store-backend/src/controllers/productController.js:231-248`
- `online-store-backend/src/controllers/productController.js:340-353`
- `online-store-backend/src/controllers/productController.js:374-388`
- `online-store-backend/src/services/translationHelper.js:140-218`
- `online-store-backend/src/services/translationHelper.js:228-275`

Hiện tại các luồng này gọi overlay translation nhưng vẫn giữ lại sản phẩm gốc khi không có bản dịch. Cơ chế fallback này phải không còn được dùng để cho sản phẩm thiếu bản dịch xuất hiện trên storefront.

## Hành vi mong muốn

### API danh sách

Trước khi phân trang, hoặc bằng một cơ chế lọc bảo đảm kết quả phân trang chính xác:

1. Lấy danh sách sản phẩm theo các điều kiện thông thường.
2. Xác định toàn bộ mã ngôn ngữ trong `SUPPORTED_LANGUAGES`.
3. Tìm các cache translation hợp lệ theo `entityId` và `targetLang`.
4. Chỉ giữ lại sản phẩm có bản dịch hợp lệ ở **tất cả** ngôn ngữ bắt buộc.
5. Chỉ tính `count`, `total` và `pages` trên tập sản phẩm đã đạt điều kiện.
6. Overlay bản dịch theo ngôn ngữ request để trả về dữ liệu storefront.

Không được chỉ lọc các sản phẩm trên frontend sau khi API đã phân trang, vì cách đó có thể tạo trang rỗng hoặc sai tổng số trang.

### API chi tiết

Nếu sản phẩm không hoàn chỉnh bản dịch:

- trả `404` hoặc mã phản hồi riêng được frontend hỗ trợ;
- không trả dữ liệu sản phẩm gốc để frontend fallback và render;
- giữ thông báo lỗi phù hợp với ngôn ngữ request.

### API admin

Các endpoint phục vụ trang admin quản lý dịch sản phẩm không áp dụng bộ lọc này. Admin phải xem được:

- sản phẩm chưa có bản dịch;
- sản phẩm thiếu một hoặc nhiều ngôn ngữ;
- sản phẩm có bản dịch `pending`, `needs_retranslate` hoặc `rejected`;
- sản phẩm có lỗi validation.

## Không nên sửa theo hướng nào

- Không chỉ ẩn sản phẩm trong `ProductCard` hoặc component frontend.
- Không thay đổi fallback dùng chung theo cách làm ảnh hưởng đến API admin.
- Không dùng riêng `targetLang` hiện tại để quyết định sản phẩm có được hiển thị hay không.
- Không dùng riêng các ngôn ngữ active.
- Không coi cache tồn tại là đủ nếu `status` hoặc `qualityStatus` chưa hợp lệ.

## Kiểm thử cần có

### Storefront

- Sản phẩm đủ 9 ngôn ngữ được hiển thị.
- Sản phẩm thiếu bản dịch `vi` không được hiển thị.
- Sản phẩm thiếu bản dịch ở một ngôn ngữ active không được hiển thị.
- Sản phẩm thiếu bản dịch ở một ngôn ngữ chưa active không được hiển thị.
- Cache có `status = success` nhưng `qualityStatus = pending` không được xem là hoàn chỉnh.
- Cache có `qualityStatus = needs_retranslate` hoặc `rejected` không được hiển thị.
- Search, category, featured, hot deal và trang chủ không được làm lộ sản phẩm chưa hoàn chỉnh.
- Trang chi tiết của sản phẩm chưa hoàn chỉnh không được trả dữ liệu gốc.
- Tổng số sản phẩm và phân trang chỉ tính các sản phẩm đã hoàn chỉnh.

### Admin

- Trang quản lý dịch vẫn hiển thị sản phẩm thiếu bản dịch.
- Admin vẫn xem được trạng thái và các ngôn ngữ còn thiếu.
- Admin vẫn có thể dịch và lưu sản phẩm chưa hoàn chỉnh.

## Tóm tắt quy tắc

```text
storefrontVisible(product) =
  hasValidTranslation(product, vi)
  && hasValidTranslation(product, en)
  && hasValidTranslation(product, pt)
  && hasValidTranslation(product, fr)
  && hasValidTranslation(product, de)
  && hasValidTranslation(product, it)
  && hasValidTranslation(product, es)
  && hasValidTranslation(product, nl)
  && hasValidTranslation(product, sv)
```

Trang admin quản lý dịch sản phẩm không áp dụng `storefrontVisible` và vẫn hiển thị toàn bộ sản phẩm.

## Vấn đề phát hiện khi triển khai

### Storefront không hiển thị sản phẩm khi chưa đủ bản dịch

Đây là hành vi đúng theo policy: nếu chưa có sản phẩm nào có bản dịch hợp lệ cho toàn bộ các ngôn ngữ bắt buộc, các luồng storefront có thể trả về danh sách rỗng. Bộ lọc phải được áp dụng thống nhất cho:

- trang chủ;
- danh sách sản phẩm;
- category;
- search;
- featured products;
- hot deals;
- sản phẩm được đánh giá cao;
- trang chi tiết sản phẩm.

Cần kiểm tra dữ liệu trong `product_catalog_translation_cache` để xác định sản phẩm còn thiếu ngôn ngữ, đang `pending`, `needs_retranslate`, `rejected` hoặc chưa được `approved`. Không được nới lỏng bộ lọc storefront chỉ để làm xuất hiện lại các sản phẩm chưa hoàn chỉnh.

### Trang admin quản lý dịch bị áp dụng nhầm bộ lọc storefront

Trang `/admin/translationsDynamic` phải hiển thị tất cả sản phẩm, kể cả sản phẩm thiếu bản dịch hoặc có trạng thái chưa hoàn tất. Tuy nhiên, frontend hiện đang gọi `GET /api/products`, trong khi endpoint này áp dụng `storefrontVisible` trước khi phân trang. Kết quả là sản phẩm chưa hoàn chỉnh bị loại khỏi trang admin và có thể hiển thị “Không tìm thấy sản phẩm nào”.

Cần tách luồng admin khỏi API storefront bằng một endpoint hoặc query phục vụ admin, không áp dụng `storefrontVisible`, nhưng vẫn giữ xác thực quyền admin. Không được sửa fallback dùng chung theo cách làm lộ sản phẩm chưa hoàn chỉnh trên storefront.

### Endpoint public cần rà soát bổ sung

Endpoint `GET /api/products/top/rated` phải áp dụng cùng bộ lọc hoàn chỉnh bản dịch như các endpoint storefront khác. Nếu không, sản phẩm chưa đủ bản dịch vẫn có thể xuất hiện trong danh sách sản phẩm được đánh giá cao.

### Dọn trường `features`

Để loại bỏ xung đột giữa static key và dynamic translation, dự án đã loại bỏ `features` khỏi luồng sản phẩm:

- `Product.features` và `featuresTranslations` không còn nằm trong model và không được nhận khi tạo/cập nhật sản phẩm mới.
- Seeder, migration, import/export và test không còn tạo task, cache hoặc payload `product_feature`/`features`.
- Storefront không còn render features và response không còn trả lại dữ liệu features cũ.
- Trang `/admin/translationsDynamic` không còn hiển thị hoặc chỉnh sửa features.
- Visibility gate không còn yêu cầu product phải có features.

Các bản ghi features cũ trong database chưa bị xóa vật lý; nếu cần dọn hoàn toàn dữ liệu tồn đọng, cần migration riêng. Việc này không làm thay đổi điều kiện bản dịch: sản phẩm vẫn phải có các trường còn lại đầy đủ và translation cache hợp lệ cho toàn bộ 9 ngôn ngữ.

## Tiến độ triển khai

Đã hoàn thành phần code cho:

- bộ lọc storefront trước phân trang và áp dụng cho danh sách, trang chủ, category, search, featured, hot deals, top rated và chi tiết;
- điều kiện `status = success`, `qualityStatus = approved` và kiểm tra nội dung bản dịch;
- luồng admin riêng không áp dụng `storefrontVisible`;
- overlay storefront chỉ dùng bản dịch sản phẩm đã approved.

Đã kiểm tra cú pháp JavaScript và whitespace trong diff. Chưa chạy được test backend/build frontend vì môi trường hiện thiếu dependency (`dotenv` và `next`).

## Các vấn đề còn tồn tại sau triển khai

### 1. Public translation endpoint chưa dùng đúng predicate approved

Visibility gate đã yêu cầu `status = success` và `qualityStatus = approved`, nhưng endpoint `GET /api/products/:id/translations` hiện chỉ loại cache `needs_retranslate` và `rejected`. Cache `pending` vẫn có thể được trả cho client public.

**Cách fix:** mọi truy vấn bản dịch phục vụ public phải dùng chính xác:

```js
{
  status: 'success',
  qualityStatus: 'approved'
}
```

Không dùng fallback sang bản dịch chưa approved. Endpoint admin vẫn được phép đọc mọi trạng thái.

### 2. Product seed tạo cache pending nên không làm sản phẩm visible

`specTranslationSeeder` ghi vào `ProductCatalogTranslationCache` nhưng không set `qualityStatus`, nên schema đặt mặc định là `pending`. Đây là hành vi an toàn nếu cần kiểm duyệt thủ công, nhưng phải có quy trình approve tiếp theo; nếu không, seed xong vẫn không có sản phẩm trên storefront.

**Cách fix:** chọn và ghi rõ một trong hai quy trình:

- **Có kiểm duyệt:** seed ghi `pending`, chạy validation/duyệt riêng rồi mới chuyển sang `approved`.
- **Tự động duyệt có điều kiện:** seed chạy completeness/quality validation, chỉ record đạt mới được ghi `approved`; record không đạt giữ `pending` hoặc `needs_retranslate`.

Không được chuyển tất cả record sang `approved` chỉ để vượt visibility gate.

### 3. Cache lookup của seeder có thể dùng lại bản dịch không hợp lệ

Seeder tra `LiveTranslationCache` theo `hashKey` mà không xét trạng thái. Điều này có thể đưa bản dịch rejected/pending vào lần seed sau.

**Cách fix:** cache hit của seeder phải kiểm tra trạng thái hợp lệ; cache không hợp lệ phải được retry hoặc dịch lại. Nếu vẫn duy trì legacy cache, phải áp dụng cùng quy tắc trạng thái cho cả legacy và catalog cache.

### 4. Flush lỗi có thể làm thiếu cache không được phát hiện

`flushPendingCache()` xóa pending records trước khi ghi database và chỉ log lỗi insert. Batch lỗi có thể bị mất, khiến sản phẩm thiếu ngôn ngữ nhưng nguyên nhân không rõ.

**Cách fix:** giữ lại record chưa ghi, retry có giới hạn, báo cáo số record thất bại và không coi seed là thành công khi còn pending chưa flush.

### 5. Description bị cắt có thể trở thành bản dịch hợp lệ

AI có thể trả response ngắn hoặc bị cắt đối với description dài. Luồng seed hiện chưa chunk hoặc kiểm tra completeness trước khi lưu cache.

**Cách fix:** chunk description dài, ghép đúng thứ tự, kiểm tra completeness trước khi approve và gắn `needs_retranslate` khi validation thất bại.

## Tiêu chí hoàn thành bổ sung

- Public product detail và endpoint translation riêng không trả cache `pending`, `rejected`, `needs_retranslate` hoặc status khác `success`.
- Seeder không coi cache không approved là cache hit.
- Seed/backfill báo lỗi nếu còn record chưa flush và có retry rõ ràng.
- Description dài được kiểm tra không bị cắt trước khi cache trở thành `approved`.
- Có test cho các trạng thái cache, lỗi flush, retry và endpoint public/admin.
