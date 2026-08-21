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

File này chỉ là kế hoạch; chưa thay đổi code nghiệp vụ.
