# Tổng hợp vấn đề dịch thuật và kế hoạch phòng ngừa

## 1. Phạm vi tài liệu

Tài liệu này ghi lại các vấn đề dịch thuật đã phát hiện trong trang chi tiết sản phẩm, nguyên nhân kỹ thuật, các thay đổi đã thực hiện và các rủi ro cần theo dõi tiếp theo.

Sản phẩm được dùng để kiểm tra chính:

```text
ID: 6aad5417f008195af2ef6092
Tên: Logitech G515 RAPID TKL RGB White
Trang: /product/6aad5417f008195af2ef6092
Ngôn ngữ nguồn: vi
Ngôn ngữ hỗ trợ: vi, en, pt, fr, de, it, es, nl, sv
```

## 2. Các vấn đề đã phát hiện

### 2.1. Nhãn thông số không được dịch qua i18n

Một số dữ liệu từ backend có nhãn không dấu như:

```text
Chat lieu vo
```

Component `SpecsTable` ban đầu hiển thị trực tiếp `specLabels[key] || key`, vì vậy nhãn không được chuyển sang ngôn ngữ hiện tại.

Đã sửa tại:

```text
online-store-frontend/src/components/SpecsTable.tsx
```

Các biến thể được chuẩn hóa về khóa:

```ts
spec_case_material
```

Các bản dịch fallback:

```text
vi: Chất liệu vỏ
en: Case material
pt: Material da carcaça
fr: Matériau du boîtier
de: Gehäusematerial
it: Materiale della scocca
es: Material de la carcasa
nl: Materiaal van de behuizing
sv: Material på höljet
```

Các biến thể như `Chat lieu vo`, `Chất liệu vỏ`, `case_material` và `Case material` đều được đưa về cùng một khóa chuẩn.

### 2.2. Bản dịch mô tả dài bị cắt giữa câu

Mô tả tiếng Anh trước đây kết thúc bất thường ở đoạn:

```text
... through the Logitech G HUB software. Users can
```

Nguyên nhân:

- Nội dung dài được gửi trong một request duy nhất.
- Request Cloudflare AI chưa truyền `max_tokens`.
- Model có thể sử dụng giới hạn output mặc định thấp và dừng trước khi hoàn tất.
- Cache cũ đã lưu bản dịch bị cắt nên sửa code không tự sửa được dữ liệu đã lưu.

Đã sửa bằng hai lớp:

1. Chia nội dung dài thành nhiều chunk trước khi gửi model.
2. Gửi giới hạn output rõ ràng cho Cloudflare AI:

```js
max_tokens: getMaxOutputTokens()
```

Giá trị mặc định:

```text
2048 token cho mỗi phản hồi
```

Có thể cấu hình bằng:

```env
CLOUDFLARE_AI_MAX_TOKENS=2048
```

Các file liên quan:

```text
online-store-backend/src/services/cloudflareAiService.js
online-store-backend/src/services/libretranslateProductService.js
libretranslate-tool/src/productTranslator.js
```

### 2.3. AI trả thêm prefix không mong muốn

Một số phản hồi có dạng:

```text
Here's the translated text:
...
```

Prefix này làm nội dung hiển thị không tự nhiên và có thể xuất hiện ở đầu bản dịch cache.

Đã thêm xử lý loại bỏ các prefix phổ biến ở frontend và backend:

```text
Here's the translated text:
Here is the translated text:
Here is the translation:
Translated text:
Translation:
```

Frontend xử lý tại:

```text
online-store-frontend/src/components/ProductDescriptionFormatter.tsx
```

Backend xử lý tại:

```text
online-store-backend/src/services/cloudflareAiService.js
online-store-backend/src/services/libretranslateProductService.js
```

Regex được neo ở đầu chuỗi để không xóa nhầm nội dung hợp lệ ở giữa mô tả.

### 2.4. Số thập phân bị xuống dòng sai

Formatter cũ xuống dòng sau mọi dấu chấm. Vì vậy các thông số như:

```text
0.1mm
2.5mm
```

có thể bị hiển thị thành:

```text
0.
1mm
```

Đã sửa bằng cách phân biệt dấu chấm thập phân với dấu chấm kết thúc câu:

```ts
const isDecimalPoint = /\d/.test(previousChar) && /\d/.test(nextChar);
const isSentenceEnd = !nextChar || /\s/.test(nextChar);

if (!isDecimalPoint && isSentenceEnd) {
  breakPositions.push(nextChar === ' ' ? i + 2 : i + 1);
}
```

### 2.5. Bản dịch bị trộn nhiều ngôn ngữ

Ví dụ bản tiếng Bồ Đào Nha hiển thị:

```text
Bàn phím có dây Logitech G515 RAPID TKL RGB White é uma opção de teclado gaming...
```

Phần `é uma opção...` là tiếng Bồ Đào Nha nhưng `Bàn phím có dây` vẫn là tiếng Việt.

Nguyên nhân:

- Model dịch được phần lớn nội dung nhưng giữ lại một số cụm nguồn.
- Kiểm tra ngôn ngữ toàn văn vẫn có thể nhận diện kết quả là tiếng đích vì phần tiếng đích chiếm đa số.
- Validator trước đây chỉ có `wrong_language`, chưa có kiểm tra rò rỉ từng cụm của ngôn ngữ nguồn.
- Cache cũ đã được đánh dấu `approved` trước khi có kiểm tra này.

Đã sửa tại:

```text
online-store-backend/src/utils/translationValidator.js
online-store-backend/src/config/translationValidation.js
online-store-backend/src/services/cloudflareAiService.js
online-store-backend/src/controllers/translationController.js
```

Validator mới có lỗi:

```text
mixed_language
```

Validator kiểm tra các cụm từ tiếng Việt có dấu từ nội dung nguồn, sau đó xác định chúng có còn xuất hiện trong bản dịch không. Lỗi này được xem là lỗi nghiêm trọng và chuyển bản dịch sang trạng thái:

```text
needs_retranslate
```

Prompt Cloudflare AI cũng được tăng cường:

```text
Do NOT leave Vietnamese words or sentences in the translation,
except brand names, model names, and technical identifiers.
```

Endpoint storefront không trả phần mô tả đã phát hiện bị trộn ngôn ngữ. Frontend sẽ tạm dùng mô tả nguồn thay vì hiển thị một bản dịch sai.

### 2.6. Cache cũ không tự thay đổi sau khi sửa code

Thay đổi pipeline chỉ áp dụng cho các lần dịch mới. Các bản dịch đã lưu trong:

```text
ProductCatalogTranslationCache
LiveTranslationCache
```

vẫn giữ nội dung cũ, bao gồm:

- Bản dịch bị cắt.
- Prefix từ AI.
- Cụm tiếng Việt còn sót trong bản dịch ngôn ngữ khác.

Cần dùng thao tác quản trị **Dịch lại sản phẩm** để tạo lại cache cho từng ngôn ngữ.

Endpoint thao tác:

```text
POST /api/translations/admin/products/:id/retranslate
```

Body mẫu:

```json
{
  "lang": "pt"
}
```

Cần thực hiện cho các ngôn ngữ:

```text
en, pt, fr, de, it, es, nl, sv
```

## 3. Kiến trúc pipeline dịch hiện tại

```text
Product tiếng Việt
        |
        v
Chia nội dung thành chunk nếu vượt giới hạn
        |
        v
LibreTranslate tạo draft tùy chọn
        |
        v
Cloudflare AI dịch bản cuối
        |
        v
Strip prefix và chuẩn hóa output
        |
        v
TranslationValidator
        |
        +--> approved
        +--> pending
        +--> needs_retranslate
        |
        v
ProductCatalogTranslationCache / LiveTranslationCache
        |
        v
API storefront
```

LibreTranslate chỉ tạo bản nháp cho sản phẩm nếu bật:

```env
LIBRETRANSLATE_ENABLED=true
```

Cloudflare AI vẫn là provider tạo bản dịch cuối cùng. Khi LibreTranslate lỗi hoặc bị tắt, Cloudflare AI dịch trực tiếp từ nội dung gốc.

## 4. Các file quan trọng

### Frontend

```text
online-store-frontend/src/pages/product/[id].tsx
```

- Hiển thị mô tả theo locale.
- Dùng bản dịch nếu locale khác `vi`.
- Fallback về mô tả nguồn nếu API không có bản dịch hợp lệ.

```text
online-store-frontend/src/hooks/useProductTranslation.ts
```

- Gọi endpoint:

```text
GET /api/products/:id/translations?lang=...
```

```text
online-store-frontend/src/components/ProductDescriptionFormatter.tsx
```

- Loại prompt leak và prefix.
- Xử lý HTML/XML.
- Không tách số thập phân.
- Chia mô tả thành các dòng dễ đọc.

```text
online-store-frontend/src/components/SpecsTable.tsx
```

- Chuẩn hóa khóa nhãn thông số.
- Dịch nhãn `spec_case_material` theo locale.

### Backend

```text
online-store-backend/src/services/cloudflareAiService.js
```

- Gọi Cloudflare AI.
- Thêm `max_tokens`.
- Strip prefix.
- Retry, rate limit và quota.

```text
online-store-backend/src/services/libretranslateProductService.js
```

- Chia nội dung mô tả thành chunk.
- Gọi LibreTranslate để tạo draft nếu được bật.
- Gọi Cloudflare AI cho bản dịch cuối.
- Ghép các chunk sau khi dịch.

```text
libretranslate-tool/src/productTranslator.js
```

- Chia chunk theo newline, ranh giới câu hoặc ranh giới từ.
- Giữ lại khoảng trắng sau `. `, `! ` và `? `.
- Không làm mất nội dung khi ghép chunk.

```text
online-store-backend/src/utils/translationValidator.js
```

Các kiểm tra hiện có:

- Nội dung rỗng.
- Thiếu brand.
- Tỷ lệ độ dài bất thường.
- Sai ngôn ngữ chính.
- Trộn ngôn ngữ nguồn trong mô tả.
- Không nhất quán với cache đã duyệt.

```text
online-store-backend/src/config/translationValidation.js
```

- Trọng số lỗi.
- Ngưỡng `approved`, `pending`, `needs_retranslate`.
- Danh sách lỗi nghiêm trọng.

```text
online-store-backend/src/controllers/translationController.js
```

- Trả bản dịch sản phẩm cho storefront.
- Retranslate một sản phẩm theo ngôn ngữ.
- Không trả mô tả cache nếu phát hiện rò rỉ ngôn ngữ nguồn.

```text
online-store-backend/src/models/ProductCatalogTranslationCache.js
```

- Cache tổng hợp một sản phẩm theo từng ngôn ngữ.
- Unique theo `entityId + targetLang`.

```text
online-store-backend/src/models/LiveTranslationCache.js
```

- Cache bản dịch field động và schema cũ.

## 5. Các lỗi không thuộc pipeline dịch nhưng đã gặp trong cùng trang

### 5.1. Đổi vị trí Mô tả và Thông số

Yêu cầu giao diện cuối cùng:

- Card bên phải hiển thị **Thông số**.
- Tab đầu tiên bên dưới hiển thị **Mô tả**.
- Giữ lại tab **Khuyến mãi** và **Đánh giá**.

Đã sửa tại:

```text
online-store-frontend/src/pages/product/[id].tsx
online-store-frontend/src/components/product/ProductOverview.tsx
online-store-frontend/src/components/product/ProductInformationTabs.tsx
```

### 5.2. Điều khiển số lượng bị hiểu là không hoạt động

Nguyên nhân thực tế là sản phẩm có:

```text
countInStock = 1
max = 1
```

Logic hiện tại giới hạn số lượng không vượt quá tồn kho và không cho giảm dưới 1. Đây là hành vi đúng theo nghiệp vụ, không phải lỗi nút bấm.

### 5.3. Tối ưu giao diện

Đã bổ sung style cho:

- Gallery.
- Product overview.
- Giá và badge tồn kho.
- Quantity control.
- Nút mua hàng.
- Product tabs.
- Icon, hover state, focus state và responsive layout.

## 6. Cấu hình khuyến nghị

```env
CLOUDFLARE_AI_ENABLED=true
CLOUDFLARE_AI_MAX_REQUESTS_PER_DAY=...
CLOUDFLARE_AI_MAX_INPUT_CHARS_PER_DAY=...
CLOUDFLARE_AI_MAX_TOKENS=2048

LIBRETRANSLATE_ENABLED=false
LIBRETRANSLATE_DESCRIPTION_CHUNK_SIZE=6000
```

Khuyến nghị không đặt secret thật vào Git hoặc `.env.example`.

Nếu mô tả dài hơn hoặc model có output ngắn, có thể giảm chunk size hoặc tăng `CLOUDFLARE_AI_MAX_TOKENS` trong giới hạn context window của model.

## 7. Các vấn đề dịch thuật có thể phát sinh tiếp theo

### 7.1. Model vẫn cắt nội dung dù đã chia chunk

Dấu hiệu:

- Chunk kết thúc bằng từ dở dang.
- Bản dịch kết thúc bằng `Users can`, `The product`, `This keyboard` hoặc một cụm chưa có động từ/tân ngữ hoàn chỉnh.
- Nội dung nguồn kết thúc bằng dấu câu nhưng bản dịch không có dấu câu tương ứng.

Hướng xử lý:

- Kiểm tra `max_tokens`.
- Giảm `LIBRETRANSLATE_DESCRIPTION_CHUNK_SIZE`.
- Thêm kiểm tra kết thúc câu vào validator.
- Tự động retry chunk lỗi với kích thước nhỏ hơn.

### 7.2. Model giữ lại ngôn ngữ nguồn nhưng không có dấu tiếng Việt

Kiểm tra hiện tại ưu tiên các từ tiếng Việt có dấu để giảm false positive. Tuy nhiên model có thể giữ lại từ không dấu như:

```text
chat lieu vo
ban phim co day
```

Hướng xử lý:

- Dùng danh sách từ khóa tiếng Việt phổ biến theo domain.
- So sánh cụm từ nguồn có độ dài tối thiểu.
- Không đánh dấu brand, model, mã sản phẩm và thông số kỹ thuật là lỗi.

### 7.3. Dịch nhầm brand hoặc model

Dấu hiệu:

- `Logitech`, `G515`, `RAPID`, `TKL`, `RGB` bị thay đổi.
- Mã như `16GB`, `1TB`, `2.5mm`, `i7` bị biến dạng.

Hướng xử lý:

- Giữ danh sách `PRESERVED_BRANDS`.
- Bổ sung kiểm tra các token kỹ thuật trước và sau dịch.
- So sánh số lượng token số giữa source và translation.

### 7.4. Sai locale hoặc sai mã ngôn ngữ

Dấu hiệu:

- Chọn `pt` nhưng nhận tiếng Tây Ban Nha.
- Chọn `fr` nhưng nhận tiếng Anh.
- Locale frontend khác với `targetLang` backend.

Hướng xử lý:

- Kiểm tra `languageInventory.js` là nguồn sự thật duy nhất.
- Log `sourceLang`, `targetLang`, `locale` và `resolvedLang`.
- Không dùng tên ngôn ngữ tự do trong request; chỉ dùng mã chuẩn `vi`, `en`, `pt`, `fr`, `de`, `it`, `es`, `nl`, `sv`.

### 7.5. Cache cũ được dùng lại sau khi source product thay đổi

Dấu hiệu:

- Mô tả hoặc tên hiển thị không khớp dữ liệu sản phẩm hiện tại.
- Bản dịch vẫn chứa câu cũ sau khi admin sửa sản phẩm.

Hướng xử lý:

- Hash cache phải bao gồm nội dung nguồn hiện tại.
- Khi source field thay đổi, đánh dấu bản dịch là `needs_retranslate`.
- Không chỉ kiểm tra cache có tồn tại; phải kiểm tra phiên bản/nội dung nguồn.

### 7.6. Cache `approved` nhưng chất lượng không đạt

Dấu hiệu:

- `qualityStatus = approved` nhưng mô tả vẫn bị cắt hoặc trộn ngôn ngữ.

Hướng xử lý:

- Chạy audit định kỳ cho cache sản phẩm.
- Không cho phép admin approve nếu có `mixed_language`, `wrong_language` hoặc `empty`.
- Dùng endpoint retranslate để thay thế bản dịch lỗi.

### 7.7. LibreTranslate tạo draft sai nhưng Cloudflare giữ nguyên lỗi

Dấu hiệu:

- Draft chứa câu dịch sai và bản cuối gần như sao chép draft.

Hướng xử lý:

- Prompt phải nói rõ draft chỉ là tài liệu tham khảo.
- Validator phải kiểm tra bản cuối, không kiểm tra draft.
- Khi draft lỗi, có thể tắt `LIBRETRANSLATE_ENABLED` để Cloudflare dịch trực tiếp từ source.

### 7.8. Chunk bị nối thiếu khoảng trắng hoặc lặp khoảng trắng

Dấu hiệu:

```text
keyboard.The
```

hoặc:

```text
keyboard.  The
```

Hướng xử lý:

- Chunk boundary phải giữ dấu cách sau dấu câu.
- Test invariant:

```js
chunks.join('') === sourceText
```

- Không dùng `trim()` trên từng chunk trước khi ghép nếu chunk chứa formatting có ý nghĩa.

### 7.9. HTML, XML hoặc markdown bị model dịch nhầm

Dấu hiệu:

- Tag HTML bị thay đổi.
- Entity bị hỏng.
- Dấu xuống dòng hoặc danh sách bị mất.

Hướng xử lý:

- Gửi prompt rõ ràng: chỉ dịch text content, không dịch tag.
- Sanitize ở frontend như lớp bảo vệ cuối.
- Bổ sung kiểm tra tag mở/đóng trước và sau bản dịch.

### 7.10. Rate limit hoặc quota làm bản dịch thiếu một phần

Dấu hiệu:

- Một số locale có bản dịch, một số locale rỗng.
- Cache có `failed_rate_limit`, `failed_error` hoặc `pending_retry`.

Hướng xử lý:

- Kiểm tra `CLOUDFLARE_AI_MAX_REQUESTS_PER_DAY`.
- Kiểm tra `CLOUDFLARE_AI_MAX_INPUT_CHARS_PER_DAY`.
- Không đánh dấu bản dịch rỗng là `approved`.
- Chạy retry có giới hạn và ghi lại lỗi vào cache.

## 8. Checklist sau mỗi lần thay đổi pipeline

1. Kiểm tra cú pháp:

```bash
node --check online-store-backend/src/services/cloudflareAiService.js
node --check online-store-backend/src/services/libretranslateProductService.js
node --check online-store-backend/src/utils/translationValidator.js
node --check online-store-backend/src/controllers/translationController.js
```

2. Kiểm tra chunk không mất nội dung:

```bash
node --test libretranslate-tool/test/productTranslator.test.js
```

3. Kiểm tra whitespace trong diff:

```bash
git diff --check
```

4. Retranslate sản phẩm kiểm thử cho tất cả locale.

5. Kiểm tra API:

```text
GET /api/products/6aad5417f008195af2ef6092/translations?lang=en
GET /api/products/6aad5417f008195af2ef6092/translations?lang=pt
```

6. Kiểm tra các tiêu chí:

- Không có prefix `Here's the translated text:`.
- Không có cụm tiếng Việt trong bản dịch đích.
- Không bị cắt giữa câu.
- Không tách sai `0.1mm`, `2.5mm`.
- Brand và model được giữ nguyên.
- Số liệu kỹ thuật không bị thay đổi.
- Nội dung đầy đủ tương đương source.

7. Kiểm tra trang bằng preview ở tất cả locale.

## 9. Trạng thái hiện tại

Đã hoàn thành:

- Chuẩn hóa nhãn thông số đa ngôn ngữ.
- Loại prefix do AI sinh.
- Sửa xuống dòng sai số thập phân.
- Chia chunk nội dung dài.
- Bảo toàn khoảng trắng khi ghép các chunk dịch.
- Cấu hình `max_tokens` cho Cloudflare AI.
- Retry Cloudflare thống nhất hơn cho timeout, rate limit và lỗi server.
- Phát hiện bản dịch bị trộn ngôn ngữ, bao gồm một số cụm tiếng Việt không dấu theo domain.
- Kiểm tra token kỹ thuật và số liệu như `G515`, `2.5mm`, `16GB`.
- Kiểm tra bảo toàn HTML/XML/entity/Markdown token.
- Phát hiện bản dịch có dấu hiệu bị cắt giữa câu.
- Không approve bản dịch có lỗi nghiêm trọng.
- Không trả mô tả cache bị trộn ra storefront.
- Thêm `sourceHash` cho `ProductCatalogTranslationCache` để phát hiện cache stale.
- Invalidate cả cache mới và cache legacy khi source product thay đổi.
- Validator được áp dụng trước khi lưu bản dịch từ API, manual save, import và retranslate.
- LibreTranslate local hỗ trợ endpoint HTTP và có test hồi quy.
- Tối ưu layout product detail và tabs.

Đã kiểm thử code:

- `node --check` cho toàn bộ file backend và LibreTranslate đã thay đổi.
- Test LibreTranslate và chunk: `4/4` test pass.
- Test validator cho mixed-language, technical token và markup mismatch: pass.
- `git diff --check`: pass.

Còn cần thực hiện trên dữ liệu/vận hành:

- Dịch lại sản phẩm Logitech G515 cho `en`, `pt`, `fr`, `de`, `it`, `es`, `nl`, `sv`.
- Kiểm tra lại độ dài và ký tự cuối của từng bản dịch sau khi retranslate.
- Kiểm tra các sản phẩm khác có cache được tạo trước khi có validator `mixed_language`, technical token và source fingerprint.
- Chạy audit để tìm cache `approved` cũ nhưng không có `sourceHash`.
- Cân nhắc tạo job audit/retranslate tự động cho cache đã `approved` nhưng có dấu hiệu bất thường.
- Backend integration test cần chạy trong môi trường có đầy đủ dependency và MongoDB.

Không chạy `npm run build` theo quy ước của môi trường hiện tại.
