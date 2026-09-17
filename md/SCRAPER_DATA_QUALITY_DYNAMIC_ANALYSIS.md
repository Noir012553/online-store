# Audit chất lượng dữ liệu scraper và hành vi dynamic

## 1. Mục đích

Tài liệu này ghi nhận hiện tượng nhiều field sản phẩm bị rỗng bất thường sau khi cào/import, đồng thời phân tích các hành vi động trên storefront có thể làm dữ liệu hoặc giao diện khó kiểm chứng.

Phạm vi gồm:

- Scraper Python và HTML/JSON-LD nguồn.
- Output JSON/CSV và staging.
- Mapping `Product...` sang schema `Product`.
- Validator, normalize và upsert MongoDB.
- API response và frontend adapter.
- Trang chi tiết sản phẩm và homepage có nội dung động.
- Dự đoán rủi ro nếu giữ nguyên pipeline.
- Đề xuất tối ưu theo mức độ ưu tiên.

Tài liệu này là báo cáo phân tích, không thay thế test runtime hoặc báo cáo completeness của một batch scraper thực tế.

## 2. Tóm tắt kết luận

Hiện tượng field rỗng hàng loạt có khả năng cao đến từ chuỗi nguyên nhân sau:

```text
HTML nguồn thay đổi hoặc render động
  -> selector scraper không khớp
  -> extractor trả về "", {}, []
  -> validator permissive vẫn cho qua
  -> upsert $set giá trị rỗng
  -> dữ liệu tốt trong Product có thể bị ghi đè
  -> frontend hiển thị panel rỗng hoặc fallback
```

Các field có rủi ro cao nhất:

| Field raw | Field nội bộ | Mức rủi ro | Nguyên nhân chính |
|---|---|---:|---|
| `ProductSpecifications` | `specs` | P0 | Chỉ khớp một tiêu đề và một cấu trúc DOM cụ thể |
| `ProductDescription` | `description` | P0 | Chỉ tìm `.news-html-content` |
| `ProductPromotions` | `promotions` | P1 | Chỉ tìm section/title/thẻ `<p>` theo pattern hẹp |
| `ProductDescriptionImages` | `descriptionImages` | P1 | Phụ thuộc cùng selector mô tả và lazy-load |
| `ProductGalleryImages` | `images` | P1 | Selector gallery thay đổi hoặc ưu tiên placeholder |
| `ProductStockStatus` | `countInStock` | P1 | Canonical output hiện không tạo field này nhất quán |
| `ProductRegularPriceVND` | `originalPrice` | P2 | Phụ thuộc markup giá gốc và fallback JSON-LD |

Frontend không phải nguyên nhân chính làm các field này mất trong database. Frontend chủ yếu phản ánh dữ liệu đã rỗng từ API hoặc lọc thêm các item không hợp lệ ở adapter.

## 3. Bằng chứng đã đối chiếu

### 3.1. ProductSpecifications

Extractor tại:

```text
online-store-backend/python/scraper_runner.py:112-125
```

chỉ xử lý section có text chứa chính xác:

```text
Thông số nổi bật
```

và bên trong phải có:

```html
<div class="min-w-0">
  <p>Tên trường</p>
  <p>Giá trị</p>
</div>
```

Nếu nguồn dùng `Thông số kỹ thuật`, `<li>`, `<table>`, `dl/dt/dd`, hoặc markup khác, hàm trả về `{}` mà không tạo lỗi fatal.

Sau đó record được tạo tại:

```text
online-store-backend/python/scraper_runner.py:167-178
```

với:

```python
"ProductSpecifications": specs,
"ProductTechnicalDescription": "Thông số: " + json.dumps(specs, ensure_ascii=False),
```

Khi extractor không tìm thấy thông số:

```json
{
  "ProductSpecifications": {},
  "ProductTechnicalDescription": "Thông số: {}"
}
```

Một sản phẩm đã kiểm tra qua API có trạng thái tương ứng:

```json
{
  "specs": {},
  "description": "",
  "technicalDescription": "Thông số: {}"
}
```

Điều này cho thấy dữ liệu đã rỗng trước khi `SpecsTable` render.

### 3.2. ProductDescription

Extractor tại:

```text
online-store-backend/python/scraper_paths.py:296-308
```

chỉ tìm:

```css
.news-html-content
```

Nếu class không tồn tại, nội dung nằm trong container khác hoặc được tải sau bằng JavaScript, kết quả là:

```text
ProductDescription = ""
```

Parser hiện lấy các tag `h1` đến `h6`, `p`, `li`. Nó không có chiến lược fallback theo semantic content nếu `.news-html-content` biến mất.

### 3.3. ProductPromotions

Extractor tại:

```text
online-store-backend/python/scraper_paths.py:335-395
```

chỉ tìm section có title text chính xác:

```text
Ưu đãi đi kèm
```

Sau đó chỉ duyệt thẻ `<p>`. Các trường hợp dễ bỏ sót:

- title có dấu `:` hoặc text phụ;
- promotion nằm trong `<li>`, `<div>` hoặc accordion;
- nội dung chỉ xuất hiện sau khi mở `Xem thêm`;
- dữ liệu được tải bằng API sau khi page render;
- format quà tặng không khớp regex;
- discount không có prefix `[scope]`.

Kết quả trong các trường hợp này là:

```json
{
  "ProductPromotions": []
}
```

### 3.4. Mapping và frontend

Mapping canonical tại:

```text
online-store-backend/src/utils/importAdapters/BaseImportAdapter.js:118-154
```

là:

```text
ProductSpecifications       -> specs
ProductTechnicalDescription  -> technicalDescription
ProductDescription           -> description
ProductDescriptionImages     -> descriptionImages
ProductPromotions           -> promotions
ProductMainImage            -> image
ProductGalleryImages        -> images
```

Frontend tab thông số dùng:

```tsx
<SpecsTable specs={product.specs} specLabels={product.specLabels} />
```

Frontend không nên đọc raw `ProductSpecifications`; field sau import/API là `specs`.

Tab khuyến mãi dùng `product.promotions`. Nếu API trả `promotions: []`, panel hiển thị fallback là đúng theo state hiện tại.

## 4. Phân tích theo từng tầng

### 4.1. Tầng nguồn HTML

Trang thương mại điện tử có thể thay đổi:

- tên section;
- class CSS;
- tag HTML;
- thứ tự node;
- nội dung từ server-side sang client-side rendering;
- dữ liệu từ HTML sang API request;
- lazy loading ảnh và nội dung;
- accordion chỉ render chi tiết sau tương tác.

Selector phụ thuộc class/text đơn lẻ có chi phí bảo trì cao. Khi nguồn đổi layout, extractor không nhất thiết crash; nó thường trả empty value, khiến lỗi khó phát hiện hơn lỗi HTTP.

### 4.2. Tầng scraper

Các vấn đề chính:

1. Extractor trả `""`, `{}`, `[]` cho field tùy chọn nhưng không ghi cảnh báo field-level.
2. Không có completeness score cho từng record.
3. Không có ngưỡng dừng batch khi tỷ lệ rỗng tăng đột biến.
4. JSON-LD chưa được dùng làm fallback đồng nhất cho specs, promotion và description.
5. Một số parser ưu tiên selector đầu tiên tìm được, kể cả khi đó là placeholder hoặc dữ liệu không đầy đủ.
6. `ProductStockStatus` có trong tài liệu schema nhưng không được tạo nhất quán trong record canonical.

### 4.3. Tầng staging và output

JSON là source of truth phù hợp hơn CSV cho các field lồng nhau:

- `ProductSpecifications`;
- `ProductDescriptionImages`;
- `ProductPromotions`;
- `ProductGalleryImages`.

CSV cần serialize array/object thành JSON hợp lệ. Nếu chỉ nhìn CSV bằng mắt, có thể nhầm chuỗi JSON rỗng với dữ liệu không tồn tại.

Staging đã có metadata như `ScrapeRunID`, `ScrapeCapturedAt`, `ScrapeParserVersion` theo tài liệu schema, nhưng chưa có báo cáo completeness theo field cho từng run.

### 4.4. Tầng adapter và validator

Adapter mapping đúng nhưng validator hoạt động permissive:

- specs sai hoặc thiếu có thể thành `{}`;
- description thiếu có thể thành `""`;
- ảnh mô tả lỗi URL bị loại khỏi array;
- promotion thiếu `type` hoặc `title` bị bỏ qua;
- promotion sai cấu trúc có thể làm array sau làm sạch trở thành `[]`.

Các vị trí chính:

```text
online-store-backend/src/utils/productImportValidator.js:180-243
online-store-backend/src/utils/productImportValidator.js:364-395
online-store-backend/src/utils/productImportValidator.js:595-600
```

Validator hiện phân biệt khá tốt dữ liệu sai cấu trúc, nhưng chưa phân biệt:

```text
field thật sự rỗng từ nguồn
```

với:

```text
extractor thất bại nên tạo empty value
```

### 4.5. Tầng upsert

Controller xây payload update từ product đã normalize và dùng `$set` toàn bộ payload:

```text
online-store-backend/src/controllers/productImportController.js:668-677
online-store-backend/src/controllers/productImportController.js:1575-1587
```

Nếu batch mới có:

```json
{
  "specs": {},
  "description": "",
  "promotions": [],
  "descriptionImages": []
}
```

thì các giá trị tốt cũ có thể bị ghi đè. Đây là rủi ro dữ liệu nghiêm trọng hơn bản thân selector sai.

### 4.6. Tầng API và frontend

Backend formatter chủ yếu giữ nguyên field Product và chuẩn hóa public URL cho `descriptionImages`. Không có bằng chứng formatter làm rỗng `specs`, `description` hoặc `promotions`.

Frontend adapter có các bước lọc hợp lệ:

- specs loại `null/undefined`;
- promotion phải có `type` và `title`;
- gift quantity và gift value phải là số hợp lệ;
- description image phải có URL.

Đây là lọc dữ liệu không hợp lệ, không phải nguyên nhân chính làm một API record vốn đầy đủ trở thành rỗng toàn bộ.

## 5. Hành vi dynamic trên storefront

Các hành vi sau cần được coi là trạng thái runtime, không nên kiểm tra bằng một DOM snapshot duy nhất.

| Khu vực | Hành vi động quan sát được | Rủi ro kiểm thử/scraper | Cách đo/kiểm tra |
|---|---|---|---|
| Header | `sticky top-0`, giữ header khi cuộn | DOM/layout thay đổi theo scroll, overlay có thể che phần tử | kiểm tra trước/sau scroll, đo `position` và z-index |
| Menu sản phẩm | dropdown tới nhiều route category | nội dung submenu chỉ xuất hiện khi hover/click | kiểm tra keyboard, click và mobile menu |
| Search desktop | autocomplete tại `#desktop-site-search` | request debounce, kết quả phụ thuộc query và loading | đo số request, latency, empty/error state |
| Hero carousel | 3 banner, opacity/scale transition, prev/next/dots | slide chưa active có thể vẫn tồn tại trong DOM; CTA thay đổi theo slide | kiểm tra `aria-current`, timer, pause/resume, CTA href |
| Side banner | desktop-only, opacity/pointer-events, `--banner-top` | phần tử có thể tồn tại nhưng không tương tác được | kiểm tra viewport, opacity, pointer-events và vị trí |
| Category grid | 6 card, grid responsive | layout thay đổi theo breakpoint | kiểm tra  mobile/tablet/desktop và link từng card |
| Cart/auth/language | route chuyển trang và state người dùng | token, locale hoặc cart state có thể đổi sau hydration | kiểm tra trước/sau hydration và reload |
| Product tabs | panel active/inactive, `aria-selected`, query tab | panel inactive bị hidden; không nên hiểu là dữ liệu rỗng | kiểm tra API trước rồi mới kết luận từ DOM |
| Product content | translation, promotions, specs và reviews tải theo state | nội dung có thể thay đổi sau API response | log request, response, normalized state và rendered props |

### 5.1. Hero carousel

Hero dùng section responsive dạng:

```text
section.relative.h-[420px]...
sm:h-[calc(100vh-80px)]
```

Có 3 banner, chuyển slide bằng:

- previous/next button;
- dot controls;
- transition opacity/scale;
- trạng thái `aria-current`.

Dự đoán lỗi:

- automation chụp đúng lúc transition nên nhận banner chưa active;
- CTA được kiểm tra từ slide không active;
- timer tiếp tục chạy khi người dùng đang đọc banner;
- ảnh/banner tải chậm làm layout shift;
- mobile có chiều cao khác desktop.

Tối ưu:

- pause timer khi hover/focus;
- hỗ trợ keyboard và reduced motion;
- chỉ prefetch banner kế tiếp;
- kiểm tra `aria-current` và CTA active trong test;
- đặt kích thước ảnh ổn định để giảm CLS.

### 5.2. Search autocomplete

Search có input desktop `#desktop-site-search` và placeholder `Tìm kiếm sản phẩm...`.

Các trạng thái phải được phân biệt:

```text
idle
loading
results
empty
error
```

Không nên dùng cùng một UI cho `empty` và `error`, vì người dùng sẽ không biết request thất bại hay không có sản phẩm.

Tối ưu:

- debounce request;
- hủy request cũ khi query đổi;
- cache query gần đây;
- giới hạn số kết quả autocomplete;
- giữ query trong URL khi chuyển sang trang kết quả;
- log request ID để phát hiện response cũ ghi đè state mới.

### 5.3. Sticky side banner

Side banner có trạng thái ban đầu:

```text
opacity-0 pointer-events-none
```

và biến CSS:

```text
--banner-top: 700px
```

Nếu vị trí được tính sau hydration hoặc sau khi banner chính tải xong, banner có thể:

- tồn tại nhưng không nhìn thấy;
- nhìn thấy nhưng không click được;
- chồng lên nội dung;
- sai vị trí trên viewport thấp hoặc zoom lớn.

Tối ưu:

- dùng mốc vị trí có fallback tĩnh;
- cập nhật bằng `ResizeObserver` thay vì nhiều event scroll;
- kiểm tra pointer-events sau khi animation hoàn tất;
- ẩn hoàn toàn trên breakpoint không hỗ trợ.

### 5.4. Product tabs

Panel tab inactive thường vẫn tồn tại trong DOM nhưng có trạng thái hidden. Vì vậy:

```text
panel bị hidden != dữ liệu rỗng
```

Cách kiểm tra đúng:

```text
API response -> adapter -> React state -> active tab -> rendered panel
```

Đặc biệt với tab Khuyến mãi:

```text
ProductPromotions raw -> promotions API -> product.promotions
```

Nếu `promotions: []` từ API thì đây là vấn đề dữ liệu/import, không phải do tab state.

## 6. Dự đoán nếu không xử lý

### Ngắn hạn: 1-3 batch tiếp theo

1. Field `specs`, `description` và `promotions` tiếp tục rỗng ở các nhóm có layout khác nhau.
2. Người dùng thấy các fallback như `Chưa có thông số kỹ thuật` hoặc `Sản phẩm này chưa có khuyến mãi` dù trang nguồn có dữ liệu.
3. Nếu seed lại, dữ liệu tốt cũ có thể bị ghi đè bằng `{}`, `""` hoặc `[]`.
4. Các lỗi không xuất hiện như exception nên log tổng thể vẫn có thể báo pipeline `COMPLETED`.
5. Product detail và category card có nội dung không đồng nhất vì mỗi API/flow có fallback khác nhau.

### Trung hạn: 1-4 tuần

1. Tỷ lệ completeness giảm theo mỗi lần nguồn thay đổi layout.
2. Dữ liệu cũ và dữ liệu mới không thể phân biệt nếu không so sánh `ScrapeRunID` và parser version.
3. Marketing/promotion bị mất khỏi storefront trong khi giá vẫn được cập nhật, tạo trạng thái kinh doanh không nhất quán.
4. Ảnh mô tả và gallery thiếu làm giảm chất lượng SEO/trải nghiệm nhưng khó truy nguyên vì pipeline vẫn thành công.
5. Các batch khác nhau có thể dùng selector khác nhau nhưng không có quality gate chung.

### Dài hạn

1. Upsert destructive làm mất dữ liệu đã biên tập hoặc đã được sửa thủ công.
2. Tăng chi phí sửa dữ liệu bằng tay và re-import.
3. Khó rollback nếu không lưu snapshot raw theo batch.
4. Frontend phải tiếp tục thêm fallback cho những lỗi đáng lẽ phải bị chặn ở staging.
5. Chỉ số sản phẩm có mô tả/thông số/khuyến mãi trở nên không đáng tin cậy.

## 7. Đề xuất tối ưu theo ưu tiên

### P0 — Ngăn mất dữ liệu và tăng khả năng quan sát

1. Không `$set` field optional rỗng lên Product nếu field đó không được extractor xác nhận.
2. Phân biệt ba trạng thái:
   - `present`: lấy được dữ liệu hợp lệ;
   - `source_empty`: nguồn xác nhận không có dữ liệu;
   - `extract_failed`: selector/parser không tìm thấy hoặc lỗi.
3. Thêm field completeness vào staging report:

```json
{
  "specs": "empty",
  "description": "present",
  "promotions": "extract_failed",
  "galleryImages": "partial"
}
```

4. Chặn hoặc quarantine batch nếu tỷ lệ empty tăng vượt baseline, ví dụ:

```text
specs empty tăng > 20 điểm phần trăm
description empty tăng > 20 điểm phần trăm
main image missing > 1%
```

5. Log theo URL, field, parser version và reason; không chỉ log tổng số row.
6. Giữ raw staging để có thể reprocess mà không cào lại ngay.

### P1 — Làm extractor bền hơn

#### Specs

Bổ sung fallback theo thứ tự:

1. JSON-LD `additionalProperty`;
2. semantic attributes/data attributes;
3. `table`;
4. `dl/dt/dd`;
5. `div`/`li` theo cặp label-value;
6. selector hiện tại làm fallback cuối.

Không phụ thuộc duy nhất vào text `Thông số nổi bật`.

#### Description

1. Tạo danh sách selector có trọng số thay vì một selector duy nhất.
2. Kiểm tra cả nội dung static và endpoint/API nếu page dùng client rendering.
3. Ghi warning khi product có tên/giá/ảnh nhưng description rỗng.
4. Không lấy text navigation, button hoặc footer làm description.

#### Promotions

1. Cho phép title biến thể bằng normalize whitespace/case/punctuation.
2. Đọc `p`, `li`, item accordion và container có semantic label.
3. Phân biệt promotion đang hiển thị với promotion bị ẩn sau nút mở rộng.
4. Không tự sinh promotion từ text `Xem thêm N ưu đãi` nếu nội dung chi tiết chưa có.

#### Images

1. Ưu tiên URL thật từ `data-srcset`/`srcset` trước placeholder `src`.
2. Loại URL placeholder và kiểm tra URL sau normalize.
3. Ghi riêng lỗi main image, gallery image và description image.
4. Thống nhất xử lý `ProductDescriptionImages` giữa Python preparation và Node seed pipeline.

### P1 — Chuẩn hóa data contract

1. Đồng bộ tài liệu, `PRODUCT_OUTPUT_FIELDS`, record builder và adapter.
2. Xử lý dứt điểm `ProductStockStatus`: hoặc đưa vào canonical output, hoặc bỏ khỏi tài liệu/schema contract.
3. Không dùng `Object.hasOwn(ProductPriceVND)` làm dấu hiệu duy nhất để phân biệt crawler version.
4. Thêm `schemaVersion` hoặc `parserVersion` rõ ràng trong staging.
5. Validate invariant:

```text
ProductSpecifications là object
ProductPromotions là array
ProductDescriptionImages là array
ProductMainImage là URL hợp lệ
ProductName/ProductURL/ProductPriceVND không rỗng
```

### P2 — Cải thiện frontend dynamic

1. Hiển thị trạng thái `loading`, `empty`, `error` khác nhau.
2. Với panel empty, cung cấp source/status nội bộ trong log thay vì chỉ hiện fallback chung.
3. Không suy luận API rỗng từ panel tab đang hidden.
4. Render đầy đủ các field đã có contract như `technicalDescription` và `descriptionImages` nếu UX yêu cầu.
5. Hero carousel hỗ trợ reduced motion, keyboard và pause khi focus.
6. Search autocomplete hủy request cũ và không cho response cũ ghi đè kết quả mới.
7. Sticky banner dùng `ResizeObserver` và có fallback vị trí ổn định.

## 8. Kế hoạch đo lường

Mỗi scraper run nên sinh báo cáo tối thiểu:

```json
{
  "runId": "...",
  "parserVersion": "...",
  "read": 1000,
  "valid": 980,
  "invalid": 20,
  "fieldCompleteness": {
    "ProductName": 1.0,
    "ProductSKU": 0.91,
    "ProductPriceVND": 0.99,
    "ProductSpecifications": 0.42,
    "ProductDescription": 0.36,
    "ProductDescriptionImages": 0.18,
    "ProductPromotions": 0.27,
    "ProductMainImage": 0.99,
    "ProductGalleryImages": 0.88
  },
  "fieldExtractionFailures": {
    "ProductSpecifications": 580,
    "ProductDescription": 640
  },
  "upsertSkippedDueToQuality": 125
}
```

Các chỉ số cần theo dõi theo brand/category/source URL:

- tỷ lệ field present;
- tỷ lệ field empty;
- tỷ lệ parser warning;
- tỷ lệ record bị quarantine;
- số field bị overwrite từ non-empty thành empty;
- số sản phẩm mất specs/description/promotions sau mỗi run;
- số asset upload thất bại;
- thời gian fetch và parse trung vị/p95.

## 9. Cách xác minh một sản phẩm cụ thể

Không kết luận từ DOM của tab đang inactive. Kiểm tra theo thứ tự:

1. Raw scraper JSON/CSV có `ProductSpecifications`, `ProductDescription`, `ProductPromotions` không.
2. Output sau `BaseImportAdapter` có `specs`, `description`, `promotions` không.
3. Validator cleaned object có làm mất item nào không.
4. Payload upsert có field rỗng không.
5. Document MongoDB sau import có field gì.
6. API response có giữ field không.
7. Frontend adapter có lọc item không.
8. React state `laptop` và `convertedLaptop` có field không.
9. Panel có active hay đang hidden.

Một panel có nội dung:

```html
<p>Chưa có thông số kỹ thuật</p>
```

chỉ chứng minh state render đang empty. Nó không chứng minh scraper đã cào được hoặc database đã lưu `ProductSpecifications`.

## 10. Checklist trước khi chạy lại seed

- [ ] Có raw staging của batch mới.
- [ ] Có completeness report theo field.
- [ ] Không có field rỗng tăng đột biến so với batch trước.
- [ ] Không cho upsert ghi đè field tốt bằng empty value ngoài policy rõ ràng.
- [ ] Kiểm tra một sample ở từng category.
- [ ] Kiểm tra JSON-LD và HTML thực tế của sample.
- [ ] Kiểm tra specs, description, promotions, main image và gallery.
- [ ] Có thể rollback bằng run ID hoặc snapshot.
- [ ] Kiểm tra API response sau import.
- [ ] Kiểm tra active tab và hydration trước khi đánh giá frontend.

## 11. Phạm vi chưa thể kết luận

Repository hiện chưa có một báo cáo runtime đầy đủ cho toàn bộ batch chứa:

- số lượng field rỗng theo từng scraper;
- tỷ lệ trước/sau validator;
- diff trước/sau upsert;
- HTML snapshot của tất cả sản phẩm lỗi;
- tỷ lệ field rỗng theo từng version parser.

Do đó các nguyên nhân selector và upsert đã có bằng chứng từ code, nhưng phần trăm sản phẩm bị ảnh hưởng cần được đo bằng raw staging và field-completeness report.

## 12. Kết luận

Ưu tiên an toàn là ngăn pipeline ghi đè dữ liệu tốt bằng empty value trước khi mở rộng selector. Sau đó bổ sung extractor fallback và quality gate có số liệu. Frontend cần được kiểm tra theo API/state/active tab thay vì chỉ nhìn DOM snapshot.

Thứ tự triển khai khuyến nghị:

```text
1. Field-level observability và quarantine
2. Non-destructive upsert
3. Fallback extractor cho specs/description/promotions
4. Đồng bộ schema và parser version
5. Asset quality report
6. Frontend dynamic state và accessibility
7. Performance optimization cho carousel/search/sticky UI
```
