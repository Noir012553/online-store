# Kế hoạch chuyển dịch key specs sang dynamic translation

## 1. Mục tiêu

Chuyển phần label của `Product.specs` sang cơ chế dịch dynamic có cache, nhưng vẫn giữ key canonical ổn định trong database.

Ví dụ:

```text
Key nguồn: "Kích thước/Layout"
Canonical key: "layout"
Label tiếng Việt: "Kích thước/Layout"
Label tiếng Anh: "Layout"
Value: "Full-size (100%)"
```

Phạm vi thay đổi:

- Chuẩn hóa key ngay tại ranh giới import/cào dữ liệu.
- Dịch label key theo locale khi backend trả dữ liệu.
- Cache kết quả dịch theo `canonicalKey + targetLang`.
- Giữ value specs là dữ liệu động của từng sản phẩm.
- Không lưu label đã dịch làm key trong `Product.specs`.
- Không để frontend phải tự đoán hoặc tự dịch key specs.

Không thay đổi:

- Cấu trúc hiển thị product card ngoài việc nhận label đã được API chuẩn bị.
- Nội dung value của specs nếu không có yêu cầu dịch value riêng.
- Logic giá, tồn kho, danh mục hoặc phân trang sản phẩm.

## 2. Hiện trạng cần giữ lại

### Dữ liệu sản phẩm

`Product.specs` là object động. Dữ liệu import có thể sử dụng key tiếng Anh chuẩn, key tiếng Việt hoặc nhiều biến thể khác nhau.

File `src/utils/specNormalizer.js` hiện đang:

- Chuẩn hóa nhiều biến thể về key tiếng Anh canonical.
- Chuẩn hóa một số đơn vị và value.
- Chỉ cho phép các key nằm trong `validSpecFields`.
- Có thể loại bỏ key chưa nằm trong danh sách chuẩn.

### Dịch label hiện tại

`src/services/translationHelper.js` gọi `localizeProductSpecFields()` trước khi trả product về client.

Hàm này dùng `src/data/specKeyTranslations.json` để dịch key canonical sang locale hiện tại. Đây là static dictionary, không phải frontend i18n namespace.

### Translation cache hiện tại

`ProductCatalogTranslationCache.specs` là `Mixed` và có thể chứa object specs đã được dịch. Cần kiểm tra dữ liệu thực tế trước khi thay đổi vì cache cũ có thể đang chứa key đã dịch thay vì canonical key.

### Frontend

`ProductCard.tsx` chỉ gọi `Object.entries(product.specs)` và hiển thị key/value. Frontend không nên chứa logic chuẩn hóa hoặc gọi dịch dynamic cho từng key.

## 3. Kiến trúc đề xuất

### 3.1. Canonical key là nguồn sự thật

Database chỉ lưu key canonical, độc lập với ngôn ngữ:

```js
{
  layout: "Full-size (100%)",
  connection: "Có dây",
  keycapMaterial: "ABS Doubleshot"
}
```

Không lưu:

```js
{
  "Kích thước/Layout": "Full-size (100%)"
}
```

Lý do:

- Đổi locale không làm thay đổi dữ liệu gốc.
- Có thể lọc, thống kê và tìm kiếm theo cùng một key.
- Tránh key tiếng Việt, tiếng Anh và key do AI sinh ra bị trộn trong MongoDB.
- Không phải migration dữ liệu mỗi khi sửa bản dịch.

### 3.2. Dynamic translation cho label

Tạo một service riêng, ví dụ `specKeyTranslationService`, với API nội bộ:

```text
translateSpecKey(canonicalKey, targetLang)
```

Thứ tự xử lý:

1. Chuẩn hóa canonical key.
2. Đọc cache theo `{ canonicalKey, targetLang }`.
3. Nếu cache hợp lệ, trả label từ cache.
4. Nếu chưa có cache, gọi translation provider cho label ngắn.
5. Validate kết quả và lưu cache.
6. Nếu provider lỗi hoặc trả kết quả không hợp lệ, dùng static dictionary fallback.
7. Nếu không có fallback, dùng canonical key để không làm mất dữ liệu.

Static dictionary vẫn được giữ lại làm:

- Fallback khi provider lỗi.
- Label tức thời cho key phổ biến.
- Seed ban đầu cho cache.
- Cơ chế ổn định trong thời gian provider chưa trả kết quả.

Dynamic translation không nên được gọi riêng cho từng product. Backend cần gom các key duy nhất của cả batch products, dịch/cache một lần rồi overlay lại cho từng product.

### 3.3. Cache label tách khỏi product translation cache

Khuyến nghị tạo collection/model riêng, ví dụ `SpecKeyTranslationCache`:

```text
canonicalKey
normalizedKey
 targetLang
translatedLabel
status
qualityStatus
provider
lastTranslatedAt
createdAt
updatedAt
```

Unique index:

```text
{ canonicalKey: 1, targetLang: 1 }
```

Không nên dùng `ProductCatalogTranslationCache.specs` làm nơi duy nhất cho label key vì:

- Một key xuất hiện ở nhiều sản phẩm sẽ bị dịch lặp.
- Không phân biệt rõ key label và value translation.
- Cache product cũ có thể chứa object với key đã dịch.
- Khó invalidate khi sửa một bản dịch key dùng chung.

## 4. Xử lý key chưa biết

Đây là điểm bắt buộc trước khi bật dynamic translation.

Hiện `validSpecFields` có thể loại bỏ key ngoài danh sách. Cần audit dữ liệu trước để thống kê:

- Các canonical key đang dùng.
- Các raw key chưa normalize được.
- Số sản phẩm bị mất specs do key bị loại.
- Tần suất xuất hiện theo category.

Đề xuất chính sách:

- Key rỗng, chứa dữ liệu nguy hiểm hoặc không thể sanitize: loại bỏ.
- Key hợp lệ nhưng chưa có trong `validSpecFields`: giữ lại dưới dạng canonical key đã sanitize.
- Tạo label dynamic cho key mới và ghi nhận vào cache.
- Chỉ đưa key phổ biến, đã duyệt chất lượng vào static dictionary sau khi review.

Không dịch dynamic trước rồi mới normalize. Với pipeline đó, normalizer phải hiểu mọi biến thể dịch ở mọi locale và dễ mất key gốc.

## 5. Luồng dữ liệu sau khi triển khai

```text
Nguồn cào/import
  ↓
normalizeSpecKey + sanitizeSpecValue
  ↓
Product.specs lưu canonical key
  ↓
API lấy products
  ↓
Thu thập unique spec keys trong batch
  ↓
Đọc SpecKeyTranslationCache
  ↓
Dynamic translate các key còn thiếu
  ↓
Fallback static dictionary nếu cần
  ↓
Overlay label theo locale
  ↓
Frontend ProductCard chỉ render label/value
```

Ví dụ response API có thể giữ tách biệt dữ liệu:

```json
{
  "specs": {
    "layout": "Full-size (100%)",
    "connection": "Wired"
  },
  "specLabels": {
    "layout": "Layout",
    "connection": "Connection"
  }
}
```

Hoặc backend có thể trả object đã đổi key sang label locale hiện tại. Phương án tách `specs` và `specLabels` an toàn hơn cho cache, filtering và frontend đa ngôn ngữ; cần chọn thống nhất trước khi code.

## 6. Các bước triển khai

### Giai đoạn 1: Audit không thay đổi dữ liệu

1. Quét Product collection và các file import/cào hiện có.
2. Ghi nhận raw key, canonical key và key bị loại.
3. Kiểm tra `ProductCatalogTranslationCache.specs` đang lưu canonical key hay translated key.
4. Kiểm tra các locale đang có cache và chất lượng bản dịch.
5. Lập danh sách key bắt buộc phải giữ backward compatibility.

### Giai đoạn 2: Tách service dịch label

1. Tạo `SpecKeyTranslationCache` và index unique.
2. Tạo `specKeyTranslationService`.
3. Thêm static dictionary fallback.
4. Thêm validation: không nhận empty label, object, câu quá dài hoặc kết quả chứa markup.
5. Thêm batch API để tránh gọi provider lặp theo product.
6. Thêm logging/cache metrics cho hit, miss, fallback và lỗi provider.

### Giai đoạn 3: Điều chỉnh normalize/import

1. Giữ nguyên các mapping hiện tại đang đúng.
2. Bổ sung test cho key tiếng Việt có dấu, không dấu, snake case, camel case và key cào mới.
3. Quyết định chính thức chính sách giữ unknown key.
4. Không ghi label locale vào `Product.specs`.
5. Chạy migration nếu dữ liệu hiện tại có key chưa canonical.

### Giai đoạn 4: Điều chỉnh API translation overlay

1. Tách việc dịch key label khỏi việc dịch value specs.
2. Overlay value translation từ product cache nếu có.
3. Lấy label key từ `SpecKeyTranslationCache` theo locale.
4. Giữ fallback về static dictionary rồi canonical key.
5. Đảm bảo cùng một product trả kết quả ổn định trong cùng locale.

### Giai đoạn 5: Frontend và tương thích

1. Ưu tiên response có `specLabels` tách riêng.
2. Cập nhật `ProductCard`, trang chi tiết và quick view dùng label map.
3. Fallback frontend tạm thời: nếu không có label map thì hiển thị key API trả về.
4. Không thêm logic gọi translation provider ở browser.
5. Giữ giới hạn hiển thị 4 specs trên product card hiện tại.

### Giai đoạn 6: Migration và rollout

1. Seed các key phổ biến từ `specKeyTranslations.json` vào cache mới.
2. Backfill các locale cần thiết theo batch.
3. So sánh kết quả static và dynamic trước khi bật mặc định.
4. Bật theo feature flag hoặc cấu hình backend trong giai đoạn kiểm tra.
5. Theo dõi fallback rate và key chưa dịch.
6. Chỉ xóa đường dẫn static cũ sau khi cache dynamic ổn định và đã kiểm tra rollback.

## 7. Kiểm thử bắt buộc

- Key `layout`, `connection`, `processor`, `cpu`, `ram`, `gpu` ở tất cả locale hỗ trợ.
- Raw key tiếng Việt có dấu và không dấu.
- Key snake case, camel case và key đã là label tiếng Việt.
- Key mới chưa có trong static dictionary.
- Product không có specs.
- Product có value là number, string dài hoặc value rỗng.
- Translation provider timeout, rate limit và trả kết quả không hợp lệ.
- Hai product dùng cùng key nhưng khác value.
- Đổi locale liên tục.
- Cache hit/miss và duplicate request đồng thời.
- Lọc/search theo canonical key không bị ảnh hưởng bởi locale.
- Product card, quick view và trang chi tiết hiển thị cùng một label.

## 8. Tiêu chí hoàn thành

- `Product.specs` không chứa label phụ thuộc locale.
- Key mới không bị mất chỉ vì chưa có trong static dictionary, nếu key hợp lệ và đã được sanitize.
- Dynamic translation không được gọi lặp theo từng product.
- Có fallback hoạt động khi provider hoặc cache lỗi.
- Không còn tình trạng cùng một canonical key hiển thị nhiều label ngẫu nhiên trong cùng locale.
- Frontend không gọi trực tiếp dịch dynamic.
- Có migration/rollback rõ ràng cho `ProductCatalogTranslationCache.specs` cũ.
- Có test cho normalize, cache, API response và các component hiển thị specs.

## 9. Kết luận và quyết định đề xuất

Chọn mô hình:

```text
Normalize trước khi lưu
→ Canonical key trong database
→ Dynamic translation label theo locale ở backend
→ Cache theo canonicalKey + locale
→ Static dictionary làm fallback
→ Value translation giữ trong product translation flow hiện tại
```

Không chọn mô hình dịch dynamic trước rồi mới normalize, và không lưu key đã dịch vào Product model.

## 10. Phân tích kết hợp hai vấn đề

Phần này phân tích trường hợp vừa muốn dịch dynamic key specs, vừa thực hiện normalize sau khi dịch:

```text
Raw key từ crawler/import
→ Dynamic translation
→ Normalize kết quả dịch
→ Lưu hoặc hiển thị
```

Đây là pipeline không nên dùng vì hai bước đều có thể thay đổi nội dung key. Khi kết hợp, các lỗi không chỉ xảy ra riêng lẻ mà còn khuếch đại lẫn nhau.

### 10.1. Mất canonical identity

Sau khi dynamic translation chạy, key gốc có thể không còn tồn tại. Hệ thống sẽ phải suy đoán:

```text
"Kích thước/Layout"
"Keyboard format"
"Disposition"
```

có phải cùng là `layout` hay không.

Nếu suy đoán thất bại, key bị lưu thành một field mới hoặc bị loại bởi `validSpecFields`. Khi đó cùng một loại specs có thể tồn tại dưới nhiều key khác nhau.

### 10.2. Mapping tăng theo ngôn ngữ và provider

Normalizer sau dịch phải hiểu:

- Raw key từ crawler.
- Label của từng locale.
- Các synonym do provider sinh ra.
- Các biến thể viết hoa, viết thường, dấu câu và số ít/số nhiều.
- Khác biệt giữa các phiên bản model dịch.

Mỗi thêm một locale hoặc provider sẽ làm mapping phức tạp hơn, thay vì chỉ cần mapping raw key → canonical key một lần.

### 10.3. Kết quả dynamic không ổn định

Cùng một key có thể trả về label khác nhau ở những lần dịch khác nhau. Normalizer sau đó có thể:

- Nhận một kết quả nhưng không nhận kết quả khác.
- Chuẩn hóa cùng một key thành hai canonical key.
- Tạo dữ liệu khác nhau giữa các lần import.
- Làm cache không thể tái sử dụng ổn định.

### 10.4. Collision và ghi đè dữ liệu

Hai key khác nhau có thể được dịch thành cùng một label:

```text
dimensions → Kích thước
size       → Kích thước
```

Nếu label được dùng làm object key, một value có thể ghi đè value còn lại. Collision cũng có thể xảy ra sau bước normalize nếu nhiều label được gom về cùng canonical key nhưng không có quy tắc merge rõ ràng.

### 10.5. Dữ liệu phụ thuộc locale

Nếu normalize và lưu sau khi dịch, cùng một product có thể có cấu trúc khác nhau theo locale:

```js
// vi
{ "Kích thước/Layout": "Full-size" }

// en
{ "Layout": "Full-size" }
```

Điều này phá vỡ giả định rằng `Product.specs` là dữ liệu gốc độc lập ngôn ngữ.

Hệ quả:

- Query/filter theo specs không ổn định.
- Index MongoDB không dùng chung được.
- Analytics tách cùng một field thành nhiều nhóm.
- Đổi locale có thể làm thay đổi schema dữ liệu.
- Import/export không còn round-trip an toàn.

### 10.6. Cache bị phân mảnh và khó invalidate

Cache sẽ dễ bị tạo theo label sau dịch thay vì canonical key:

```text
Kích thước/Layout + vi
Layout + en
Disposition + fr
```

Ba entry này có thể cùng là `layout`, nhưng hệ thống không có identity ổn định để gom lại.

Nếu sửa bản dịch hoặc đổi provider, cần xác định và xóa nhiều cache entry. Cache product cũ trong `ProductCatalogTranslationCache.specs` cũng có thể không tương thích với cache key mới.

### 10.7. Lỗi provider trở thành lỗi schema

Nếu provider timeout, rate limit hoặc trả kết quả rỗng:

- Normalize không có đầu vào hợp lệ.
- Key có thể bị bỏ qua.
- Product có thể mất field specs.
- Dữ liệu tạm thời có thể được lưu sai.
- Một lần dịch lỗi có thể tạo schema khác với lần chạy thành công.

Nếu normalize trước, lỗi provider chỉ ảnh hưởng label hiển thị; canonical data vẫn còn nguyên.

### 10.8. Thiếu context kỹ thuật

Dynamic provider có thể không biết `type`, `size`, `buttons` thuộc category nào. Khi dịch trước normalize, context cần thiết chưa được gắn với canonical field.

Ví dụ:

```text
buttons của mouse  → Số nút
buttons của keyboard → Số lượng phím
```

Nếu key đã bị dịch thành label chung, bước normalize phía sau khó khôi phục category và ý nghĩa ban đầu.

### 10.9. Tăng latency và chi phí

Pipeline kết hợp có thể tạo chuỗi xử lý:

```text
fetch product
→ dịch từng raw key
→ chờ provider
→ normalize từng kết quả
→ ghi cache
→ render
```

Nếu mỗi product có nhiều key, số request tăng theo số product thay vì số key duy nhất. Trang chủ, trang danh mục và trang chi tiết đều có thể bị ảnh hưởng bởi latency, rate limit và chi phí provider.

### 10.10. API contract bị mơ hồ

Frontend sẽ không biết object key hiện tại là:

- Raw key.
- Canonical key.
- Label đã dịch.
- Label đã normalize lại.

Nếu `ProductCard`, `QuickViewModal`, trang chi tiết và admin dùng cách hiểu khác nhau, cùng một product có thể hiển thị specs khác nhau.

Không nên dùng label đã dịch làm identity ở frontend. API nên tách dữ liệu:

```json
{
  "specs": {
    "layout": "Full-size"
  },
  "specLabels": {
    "layout": "Kích thước/Layout"
  }
}
```

### 10.11. Migration và rollback khó kiểm soát

Khi dữ liệu đã bị lưu bằng key sau dịch, migration phải:

1. Nhận diện locale của từng key.
2. Đoán canonical key tương ứng.
3. Xử lý synonym và collision.
4. Gộp value bị trùng mà không mất dữ liệu.
5. Dọn cache của từng locale.
6. Khôi phục các key không thể nhận diện.
7. Đồng bộ lại frontend, API và admin tools.

Rollback cũng khó vì không còn bản gốc chắc chắn để khôi phục.

### 10.12. Rủi ro bảo mật và chất lượng input

Raw key từ crawler/import là dữ liệu bên ngoài. Nếu gửi thẳng vào provider trước khi sanitize:

- Key quá dài làm tăng chi phí.
- Key có thể chứa HTML hoặc markup.
- Nội dung không phải tên field có thể làm provider trả câu dài.
- Kết quả dịch có thể chứa markup không an toàn.
- Cache có thể lưu dữ liệu không hợp lệ và phát lại cho nhiều product.

Cần sanitize, giới hạn độ dài, validate output và không render HTML từ label dịch.

### 10.13. Quan sát lỗi khó hơn

Khi lỗi xảy ra, cần phân biệt ít nhất các trạng thái:

```text
raw key
canonical key dự kiến
kết quả dynamic translation
kết quả normalize
label cuối cùng
fallback đã dùng
```

Nếu chỉ lưu label cuối cùng, việc truy ngược nguyên nhân sẽ khó. Log và metric cũng dễ bị nhân bản theo locale/provider.

### 10.14. Kiểm thử tăng mạnh

Ngoài test normalize và translation riêng lẻ, phải test tổ hợp:

- Mỗi raw key với mỗi locale.
- Mỗi synonym do provider có thể trả về.
- Hai key có cùng label dịch.
- Provider trả kết quả không hợp lệ.
- Cache hit/miss đồng thời.
- Đổi locale sau khi cache đã tồn tại.
- Import lại cùng một product nhiều lần.
- Query/filter theo canonical key sau khi đã dịch.
- Migration dữ liệu có key đã dịch.

### 10.15. Quy tắc bất biến cần bắt buộc

Sau khi triển khai, các invariant sau phải luôn đúng:

1. `Product.specs` chỉ chứa canonical key.
2. Canonical key không phụ thuộc locale.
3. Label dịch không được dùng để query hoặc làm identity.
4. Dynamic translation chỉ chạy ở backend.
5. Một cặp `canonicalKey + locale` chỉ có một bản dịch được chọn.
6. Provider lỗi không được làm mất canonical data.
7. Unknown key hợp lệ không bị mất chỉ vì chưa có static label.
8. Frontend có fallback nếu `specLabels` thiếu.

## 11. Kết luận khi kết hợp hai vấn đề

Không nên kết hợp theo hướng:

```text
Dịch dynamic raw key
→ Normalize label đã dịch
→ Lưu label/canonical key mới
```

Nên tách rõ hai nhiệm vụ:

```text
Raw key
→ sanitize + normalize một lần
→ lưu canonical key
→ dynamic translate canonical key theo locale
→ cache label
→ static fallback
→ trả specs + specLabels
```

Nếu cần hỗ trợ key mới từ dữ liệu cào, hãy mở rộng normalizer để giữ lại key hợp lệ chưa biết, sau đó dịch label của canonical key. Không dùng dynamic translation để thay thế bước xác định identity của field.

## 12. Tiến độ triển khai

### Đã hoàn thành

- Audit các đường ghi/đọc `Product.specs`, translation helper, product cache, import và frontend consumers.
- Sửa lỗi import model cho `ProductCatalogTranslationCache` và `SpecKeyTranslationCache`.
- Mở rộng `SpecKeyTranslationCache` với `normalizedKey`, `qualityStatus` và `provider`; giữ unique index theo `canonicalKey + targetLang`.
- Kết nối `specKeyTranslationService` với cache MongoDB, static fallback và kiểm tra trạng thái kết nối trước khi đọc dynamic cache.
- Chuẩn hóa response product theo mô hình `specs` canonical + `specLabels` theo locale.
- Gom spec key duy nhất theo batch product trước khi lấy cache/dynamic translation; không dịch lặp theo từng product.
- Bổ sung fallback từ `LiveTranslationCache` khi product catalog cache chưa có bản dịch.
- Điều chỉnh normalizer để giữ unknown key hợp lệ sau khi sanitize thay vì loại bỏ toàn bộ.
- Áp dụng `normalizeSpecs()` cho các luồng import product.
- Sửa seeder product translation để lưu canonical key, không dùng translated label làm object key.
- Cập nhật validation completeness để kiểm tra identity canonical key, không chỉ đếm số lượng field.
- Cập nhật ProductCard, QuickView, trang chi tiết và ProductOverview dùng `specLabels`, có fallback về canonical key.
- Cập nhật test contract tương ứng với response canonical/specLabels.
- Thêm static cache seeder idempotent, không ghi đè dynamic row; đăng ký trong seed registry và i18n-only mode.
- Thêm audit read-only cho `Product.specs`, `ProductCatalogTranslationCache.specs` và `SpecKeyTranslationCache`.
- Thêm backup/restore riêng cho hai collection cache, restore mặc định không overwrite.
- Thêm migration canonical key ở chế độ dry-run mặc định; yêu cầu `--apply` kèm backup file và bỏ qua collision để xử lý thủ công.
- Bổ sung test rollout cho canonicalization, unknown key, static fallback, response `specs/specLabels` và static seed deduplication.

### Đã kiểm tra

- Backend module loading: pass.
- Backend translation-focused tests: pass.
- Backend unified test runner: đã chạy các test suite hiện có.
- Frontend offline test suite: 10/10 pass.
- Frontend production build: đã bắt đầu nhưng bị dừng ở bước TypeScript, chưa kết luận build pass/fail.

### Còn cần thực hiện trước rollout

- Chạy audit trên MongoDB thực tế để xác định cache cũ hoặc `Product.specs` đang chứa translated key.
- Chạy backup, migration dry-run, review collision rồi mới apply migration nếu audit yêu cầu.
- Chạy static seeder trên môi trường có MongoDB và đối chiếu kết quả static/dynamic theo từng locale.
- Bổ sung test chuyên sâu cho cache hit/miss, duplicate request đồng thời, provider timeout và dynamic cache persistence.
- Chạy build TypeScript frontend lại trong môi trường không bị ngắt và kiểm thử UI product card, quick view, trang chi tiết.
- Dùng `curl` kiểm tra các API product translation sau khi backend có MongoDB và cấu hình provider/cache phù hợp.

File này hiện vừa là kế hoạch vừa ghi nhận tiến độ triển khai; các mục rollout còn lại chưa được coi là hoàn tất.
