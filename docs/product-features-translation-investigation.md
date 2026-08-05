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

## Quyết định triển khai

Sau khi rà soát phạm vi sử dụng, dự án chọn **loại bỏ `Product.features` khỏi luồng sản phẩm** thay vì tiếp tục duy trì hai cơ chế static/dynamic. Lý do là field này vừa gây lỗi hiển thị key kỹ thuật, vừa làm completeness gate coi sản phẩm không có tính năng là chưa hợp lệ.

Đã triển khai:

- Bỏ `features` và `featuresTranslations` khỏi model `Product`.
- Không nhận hoặc lưu `features` khi tạo/cập nhật sản phẩm mới.
- Dừng seeder và batch translation cho `product_feature`.
- Bỏ phần hiển thị features ở storefront và phần chỉnh sửa features trong admin translation.
- Loại dữ liệu features cũ khỏi response sản phẩm.
- Không dùng features làm điều kiện bắt buộc để sản phẩm được hiển thị.

Dữ liệu features cũ trong database chưa bị xóa vật lý. Code hiện tại không còn sử dụng hoặc trả field này; nếu cần xóa vật lý toàn bộ dữ liệu cũ, phải thực hiện migration database riêng.

## Kết luận

Vấn đề key `feature_*` và request dịch features đã được loại bỏ khỏi luồng đang chạy. Điều kiện hiển thị sản phẩm hiện chỉ kiểm tra các trường sản phẩm còn sử dụng và bản dịch hợp lệ đủ toàn bộ ngôn ngữ bắt buộc.

## Vấn đề mới: seed description bị thiếu hoặc không tạo cache

Khi seed bản dịch sản phẩm, một số `description` có hiện tượng:

- Bản dịch được tạo nhưng nội dung ngắn hơn hoặc thiếu một phần so với nguồn.
- Không tạo được bản ghi cache cho `product_description`.

Hiện chưa thay đổi code để xử lý vấn đề này.

### Luồng liên quan

- `online-store-backend/src/seeds/productSeeder.js:341-352` tạo sản phẩm rồi gọi `translationSeederHelper.translateProductsBatch()`.
- `online-store-backend/src/seeds/productSeeder.js:85-101` chỉ loại HTML, decode entity và chuẩn hóa khoảng trắng; không cắt độ dài description.
- `online-store-backend/src/services/translationSeederHelper.js:251-323` gửi `description` nguyên văn qua `translateField()`.
- `online-store-backend/src/services/translationSeederHelper.js:440-465` flush cache trực tiếp bằng `LiveTranslationCache.insertMany()`.
- `online-store-backend/src/services/cloudflareAiService.js:237-281` gửi một request gồm system prompt và toàn bộ description.

### Nhận định hiện tại

- `Product.description` và `LiveTranslationCache.originalText`/`translatedText` không có `maxlength`.
- Luồng seed sản phẩm không có bước `slice`, `substring` hoặc chia description thành đoạn trước khi gửi AI.
- Request Cloudflare AI không truyền tham số giới hạn output như `max_tokens`; giới hạn thực tế phụ thuộc context/token của model và API.
- `translationSeederHelper` không gọi `batchSaveCache()`, nên bộ kiểm tra tỷ lệ độ dài trong `translationValidator` không chạy trên cache được flush bởi luồng seed này.
- Nếu AI trả response rỗng, `cloudflareAiService` ném lỗi; khi đó bản ghi cache không được thêm. Nếu lỗi xảy ra trong lúc flush batch, `insertMany()` có thể khiến một nhóm cache không được lưu.

### Cần thu thập để xác định nguyên nhân

1. `textLength` và lỗi Cloudflare AI tương ứng với từng `product_description`.
2. Độ dài `originalText` và `translatedText` của các cache đã tạo.
3. Số lượng bản ghi pending trước và sau mỗi lần `flushPendingCache()`.
4. Response/error đầy đủ từ Cloudflare AI đối với description dài.
5. Xác nhận model Cloudflare đang dùng và giới hạn context/output của model đó.

### Hướng xử lý sau khi xác minh

- Chia description dài thành các đoạn có ranh giới an toàn rồi ghép bản dịch theo đúng thứ tự.
- Bổ sung kiểm tra độ đầy đủ trước khi lưu cache, thay vì chỉ kiểm tra response có rỗng hay không.
- Cô lập lỗi theo từng record khi flush để một description lỗi không làm mất các bản dịch khác.
- Bổ sung test cho description ngắn, description dài, response bị cắt và lỗi khi ghi cache.

## Các vấn đề còn tồn tại đã xác minh

### 1. Cache seed sản phẩm mặc định là `pending`, không qua visibility gate

`specTranslationSeeder` tạo hoặc aggregate dữ liệu vào `ProductCatalogTranslationCache`, nhưng entry không set `qualityStatus`. Schema mặc định giá trị này là `pending`, trong khi storefront chỉ chấp nhận đồng thời:

```text
status = success
qualityStatus = approved
```

Vì vậy seed có thể hoàn tất nhưng sản phẩm vẫn bị ẩn khỏi storefront cho đến khi có bước approve riêng. Ngoài ra, aggregation dùng `$setOnInsert`, nên chạy lại seeder không cập nhật các entry cũ đang `pending`.

**Hướng fix:**

1. Xác định rõ seeder chỉ tạo bản dịch `pending` để chờ kiểm duyệt, hoặc seeder phải chạy validation trước khi ghi.
2. Nếu validation đạt, ghi `qualityStatus: approved`; nếu không đạt, ghi `pending` kèm `validationErrors`.
3. Khi backfill entry đã tồn tại, không dùng riêng `$setOnInsert`; cần có chiến lược update có kiểm soát để cập nhật dữ liệu mới và trạng thái chất lượng.
4. Không tự động approve chỉ vì AI trả về response không rỗng.

### 2. Endpoint public còn trả bản dịch chưa approved

`GET /api/products/:id/translations` hiện lọc `status = success` nhưng chỉ loại `needs_retranslate` và `rejected`. Do đó cache `pending` vẫn có thể được trả cho client public.

**Hướng fix:** dùng cùng predicate với visibility policy:

```text
status = success
qualityStatus = approved
```

Predicate này phải áp dụng cho cả `ProductCatalogTranslationCache` và legacy `LiveTranslationCache`, không dùng hai tiêu chuẩn khác nhau giữa các endpoint.

### 3. Seeder tái sử dụng cache không hợp lệ

`batchCheckCache()` và `translateField()` tra `LiveTranslationCache` theo `hashKey` chỉ, không kiểm tra `status` hoặc `qualityStatus`. Cache pending, rejected hoặc lỗi vì thế có thể bị coi là cache hit.

**Hướng fix:** chỉ coi cache là hit khi record có trạng thái hợp lệ. Record không hợp lệ phải được dịch lại hoặc chuyển qua luồng retry; không được trả `translatedText` cũ cho sản phẩm.

### 4. Flush batch có thể làm mất cache đang chờ

`flushPendingCache()` xóa `_pendingCache` trước khi `insertMany()`. Nếu insert thất bại vì lỗi database, timeout hoặc lỗi validation, batch bị mất khỏi bộ nhớ và không có retry.

**Hướng fix:**

- chỉ xóa record đã insert thành công;
- khi lỗi ngoài duplicate key, giữ lại batch chưa ghi và retry với giới hạn;
- nếu `ordered: false` trả về lỗi từng phần, xác định record thành công/thất bại thay vì coi cả batch thành công hoặc thất bại;
- log số record pending trước/sau flush và số record retry.

### 5. Description dài có thể bị cắt nhưng vẫn được lưu

Luồng seed gửi nguyên văn description cho AI, chỉ kiểm tra response không rỗng. Luồng này không gọi `batchSaveCache()` nên không chạy validation đầy đủ trước khi flush. Một response ngắn hoặc bị cắt có thể được lưu như bản dịch hợp lệ.

**Hướng fix:**

1. Chia description dài theo ranh giới an toàn, giữ thứ tự các đoạn và ghép lại sau khi dịch.
2. Kiểm tra tính đầy đủ trước khi lưu: độ dài tương đối, cấu trúc HTML/text cần giữ và các placeholder nếu có.
3. Không đánh dấu `approved` khi validation thất bại; chuyển sang `pending` hoặc `needs_retranslate`.
4. Bổ sung test cho response rỗng, response bị cắt, lỗi giữa batch và retry thành công.

### Phạm vi còn rủi ro cần xử lý

`online-store-backend/src/services/productTranslationSeederService.js` vẫn dịch `product_description` bằng một request AI nguyên văn tại dòng 304, không dùng chunking như `translationSeederHelper`. Luồng này chỉ chạy validation sau khi nhận response; một response bị cắt nhưng vẫn vượt ngưỡng tỷ lệ độ dài có thể được lưu và tiếp tục được xem là bản dịch hợp lệ.

Khi triển khai, cần:

- dùng cùng chiến lược chunking theo ranh giới an toàn như `translationSeederHelper`;
- ghép các đoạn theo đúng thứ tự và bảo toàn cấu trúc nội dung;
- kiểm tra completeness trước khi lưu cache hoặc đánh dấu `approved`;
- chuyển response không đạt sang `pending` hoặc `needs_retranslate`;
- bổ sung test riêng cho luồng `ProductTranslationSeederService` với description ngắn, dài, response bị cắt và lỗi giữa các đoạn.

## Thứ tự ưu tiên triển khai

1. Dùng chung predicate `success + approved` cho mọi endpoint public và cache lookup.
2. Quyết định rõ trạng thái sau seed: `pending` chờ duyệt hay validated `approved`; cập nhật aggregation theo quyết định đó.
3. Sửa flush/retry để không mất cache khi ghi batch lỗi.
4. Thêm chunking và completeness validation cho description dài.
5. Bổ sung test tích hợp cho seed, backfill, public endpoint và visibility gate.
