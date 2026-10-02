# Sự cố chất lượng retranslate và kế hoạch khắc phục

## Tóm tắt

Chuyển provider sang Cloudflare AI không tự đảm bảo bản dịch đạt chuẩn. Các log cho thấy request Cloudflare trả kết quả, nhưng validator vẫn từ chối phần lớn bản dịch; lượt chạy sau tiếp tục bị HTTP 429 và dừng. Chạy lại bằng cùng model/prompt không phải cách xử lý gốc và có nguy cơ ghi thêm kết quả không đạt vào catalog.

**Trạng thái cập nhật:** code đã có các thay đổi cho checkpoint/report, bảo toàn technical token, cache theo field, candidate-before-commit và usage telemetry; đã bổ sung regression tests cho cache field, candidate chưa commit, source đổi giữa lúc dịch và usage thực trả. Syntax check và `git diff --check` đã qua. Chưa chạy được test suite vì môi trường thiếu `chai`, `sinon` và `mongoose`; chưa chạy canary, chưa truy cập/cập nhật database, chưa chạy retranslate và chưa triển khai production. Usage Neurons chỉ có thể báo số thực nếu response từ Cloudflare cung cấp trường usage tương ứng.

## Tóm tắt vấn đề và cách giải quyết

### Vấn đề

- Provider trả kết quả không đồng nghĩa bản dịch đạt chuẩn; nhiều bản dịch vẫn bị validator đánh lỗi, trong khi dịch lại diện rộng có thể tiếp tục tiêu tốn quota mà không cải thiện chất lượng.
- Một product/language có nhiều field dịch. Chỉ đổi một phần nội dung nguồn vẫn có thể làm hash toàn sản phẩm đổi và khiến các field không đổi bị dịch lại, phát sinh request/token không cần thiết.
- Nếu candidate mới không đạt, không nên ghi đè bản catalog hiện hành; đồng thời phải giữ candidate và lỗi để chẩn đoán, tránh báo “fixed” khi thực tế chưa commit.
- Checkpoint, số liệu batch và usage provider cần cùng phản ánh đúng policy, số việc đã commit/chưa commit và usage API thực trả về; số ký tự không phải phép đo thay thế cho Neurons.

### Cách giải quyết đã được đưa vào code

1. Tạo fingerprint riêng theo field, bao gồm field identity, nội dung nguồn, locale và translation policy. Chỉ tái sử dụng bản field hiện có/cache khi policy tương thích; vẫn validate lại trước khi chấp nhận.
2. Chỉ commit catalog khi các field tự động cần dịch đều đạt `approved` và không có lỗi validation. Candidate không đạt được lưu riêng cùng lỗi; giữ nguyên translation đang dùng và không tính là fixed.
3. Kiểm tra source hash lần nữa trước khi lưu để không commit kết quả dựa trên dữ liệu nguồn đã thay đổi giữa lúc dịch.
4. Đưa model/prompt/validator policy vào khóa cache/checkpoint; đo request, ký tự prompt đầy đủ, token và Neurons từ response nếu provider có trả, đồng thời ghi delta theo batch/config/model.
5. Giữ giới hạn request/concurrency hiện có; chưa bật batching JSON vì chưa chứng minh giảm Neurons và có rủi ro parse/mất field. Không đổi sang model self-hosted vì chất lượng thử nghiệm trước đó không đạt yêu cầu.

### Ranh giới trước khi rollout

Các thay đổi trên mới là implementation, chưa phải bằng chứng chất lượng hay tiết kiệm quota trong production. Trước khi chạy lại cần hoàn tất kiểm tra syntax/regression, xác nhận accounting và hành vi candidate/checkpoint; sau đó mới canary nhỏ có review thủ công. Không chạy retranslate diện rộng, không ghi DB và không tuyên bố mức tiết kiệm Neurons nếu response API không cung cấp usage đáng tin cậy.

## Số liệu ghi nhận

### Tình trạng catalog trước lượt chạy mới nhất

Kết quả truy vấn do người dùng chạy trên MongoDB:

| Ngôn ngữ | Approved | Needs retranslate | Pending | Tổng |
|---|---:|---:|---:|---:|
| de | 190 | 183 | 239 | 612 |
| en | 342 | 180 | 90 | 612 |
| es | 255 | 104 | 253 | 612 |
| fr | 158 | 243 | 211 | 612 |
| it | 12 | 412 | 188 | 612 |
| nl | 209 | 339 | 64 | 612 |
| pt | 132 | 230 | 250 | 612 |
| sv | 138 | 241 | 233 | 612 |
| **Tổng** | **1.436** | **1.932** | **1.528** | **4.896** |

Tỷ lệ approved catalog xấp xỉ **29,3%**. `status: success` chỉ cho biết provider trả kết quả và record đã được lưu; chất lượng được quyết định riêng bởi `qualityStatus`, điểm và lỗi validation.

### Lượt `--reset-progress`

Theo log người dùng:

- Có 3.460 việc được đưa vào lượt chạy.
- Dừng ở khoảng 39% sau khi Cloudflare hết cấu hình chưa bị rate limit.
- Báo cáo: 1 fixed, 1.349 still has issues, 1 failed do HTTP 429 và 3.459 remaining.
- Ví dụ đầu ra có đổi hoặc chuẩn hóa thông số, như `Ryzen 540HS` thành `Ryzen 5 7640HS`; cần so sánh với dữ liệu nguồn thô trước khi xác định model hay nguồn là nguyên nhân.

### Lượt `--retry-unresolved`

- Khôi phục 1.351 mục checkpoint, xóa 1.349 mục chưa fixed khỏi checkpoint để thử lại.
- Tìm thấy 3.459 catalog jobs còn cần xử lý.
- Cả 9 cấu hình trong pool đều nhận 429 ngay ở job đầu tiên; báo cáo là 0 fixed, 1 failed và 3.459 remaining.

429 xác nhận request bị giới hạn tại thời điểm chạy; riêng log này không xác định được giới hạn ngày, giới hạn theo request hay nguyên nhân chính sách cụ thể. Cần xem dashboard/response headers của Cloudflare để biết quota áp dụng.

### Tình trạng storefront

Kết quả truy vấn cho biết 618 sản phẩm active, trong đó 3 `storefrontReady`, 615 chưa ready và 6 chưa có thời điểm kiểm tra readiness. Đây là cờ readiness hiện tại trong DB, không phải phép join đối chiếu toàn bộ ID sản phẩm với catalog translation.

## Nguyên nhân và rủi ro đã xác định trong code

### 1. Provider success khác với quality approval

`productCatalogRetranslationService.js` gọi Cloudflare, validate các trường, rồi ghi catalog với `status: 'success'` cùng `qualityStatus`, `qualityScore` và `validationErrors`. Vì vậy, bản dịch chất lượng thấp vẫn có thể được ghi vào DB nhưng không được xem là approved.

### 2. Catalog retranslate dịch lại nhiều trường của sản phẩm

Khi một product/language được chọn, `productCatalogRetranslationService.js` dịch lại tất cả trường tự động như tên, mô tả, technical description, specs, alt text và promotion; các trường đánh dấu `manualFields` mới được bỏ qua. Đây không phải luồng chỉ dịch lại chính xác field có lỗi. Một lỗi ở một field có thể tạo nhiều request và ghi lại toàn bộ catalog translation cho sản phẩm/ngôn ngữ đó.

### 3. Checkpoint giữ trạng thái chưa đạt để tránh lặp vô hạn

Checkpoint lưu kết quả theo product/language và từng field. Lần chạy bình thường có thể khôi phục checkpoint và bỏ qua mục đã xử lý nhưng chưa fixed. `--retry-unresolved` xóa checkpoint chưa fixed cùng payload field liên quan; `--reset-progress` xóa checkpoint để chạy lại các mục còn match selector. Hai cờ có tác động đến lượng request rất khác nhau; không dùng reset như cách mặc định để lặp lại.

Có một trường hợp cần test/fix: nếu Cloudflare lỗi giữa chừng khi dịch một product/language, các payload field đã hoàn tất có thể đã nằm trong checkpoint, nhưng chưa có checkpoint cha `catalog:*`. `clearUnfixedCheckpointEntries` hiện chọn field payload để xóa thông qua các checkpoint cha chưa fixed; vì vậy job bị ngắt trước khi ghi checkpoint cha có thể được schedule lại nhưng tái sử dụng một phần output field cũ. Cần quyết định rõ resume hay force-retranslate và xử lý checkpoint field mồ côi/partial theo chính sách đó.

### 4. Validator có thể vừa bỏ lọt vừa từ chối nhầm

`translationValidator.js` kiểm tra token kỹ thuật bằng regex/sub-string, brand theo danh sách cấu hình, ngôn ngữ, markup, độ dài, rò rỉ cụm tiếng Việt và tính nhất quán.

- Kiểm tra `inconsistent` so sánh chuỗi với bản approved cũ; hai bản dịch tương đương về nghĩa nhưng diễn đạt khác có thể bị đánh lỗi.
- Kiểm tra token hiện tại chưa đảm bảo mọi model/SKU/giá trị spec luôn được bảo toàn đúng về ngữ nghĩa. Báo cáo có ví dụ đổi thông số nhưng lỗi token không phải lúc nào cũng xuất hiện trong log.
- Validator không thể sửa dữ liệu nguồn sai. Phải đối chiếu `Product` nguồn trước khi quy lỗi cho model.
- Một record chỉ được approved khi thỏa các ngưỡng và không có validation error chặn.

### 5. Báo cáo retranslate cần được kiểm chứng số đếm

Trong log lượt chạy cũ có lúc `Total to retranslate: 531` nhưng `Still has issues: 3460`. Lượt `--retry-unresolved` sau đó cho thấy 3.459 jobs sau khi checkpoint được xóa. Cần kiểm tra cách cộng kết quả resumed, current run, lỗi và số remaining; không nên dùng riêng các dòng progress/report để khẳng định số record DB đã sửa.

### 6. Storefront có điều kiện chặt hơn số lượng catalog

`translationHelper.js` chỉ xem một catalog translation hợp lệ khi:

- `status: success`, `qualityStatus: approved`, không có `validationErrors`;
- `sourceHash` trùng với hash sản phẩm nguồn hiện tại;
- đủ trường bắt buộc và đủ các spec source cần thiết;
- sản phẩm có dữ liệu nguồn hợp lệ;
- mọi ngôn ngữ đích được hỗ trợ (ngoại trừ tiếng Việt nguồn) đều có translation hợp lệ.

Do đó 4.896 record catalog không tương đương 4.896 sản phẩm sẵn sàng storefront. Ngôn ngữ có số approved thấp nhất tạo ra mức trần sơ bộ; chỉ join theo cùng tập product ID active mới xác định được giới hạn thực tế. Điều kiện hash/trường có thể làm số ready thấp hơn nữa.

## Kế hoạch khắc phục

### Giai đoạn 0 — Bảo vệ dữ liệu và giữ bằng chứng

1. Tạm dừng retranslate diện rộng cho tới khi hoàn tất canary.
2. Tạo backup nhất quán dữ liệu của các model `Product`, `ProductCatalogTranslationCache`, `LiveTranslationCache`, `TranslationQualityLog`, `RetranslationProgress`, `RetranslationRunLock` và checkpoint cục bộ; xác nhận tên collection vật lý theo cấu hình MongoDB trước khi dump.
3. Ghi lại thời điểm chạy, command/cờ, model, ngôn ngữ, số request, response 429/`Retry-After`, report file và git revision.
4. Không xóa lịch sử cũ hoặc cập nhật thủ công `approved` chỉ để tăng số storefront.

### Giai đoạn 1 — Đối chiếu dữ liệu nguồn và output

1. Chọn tối thiểu 20 mẫu từ các nhóm lỗi đại diện: `inconsistent`, `missing_technical_token`, `mixed_language`, `missing_brand`, lỗi mô tả/spec và các tên laptop có `Griffithing`/`Eclipseing`.
2. Với mỗi mẫu, đối chiếu trực tiếp `Product` nguồn, catalog hiện tại, source hash, `manualFields`, provider/model, validation errors, quality score và version/history.
3. Phân loại nguyên nhân thành: nguồn sai/thiếu; model thay đổi dữ liệu; output không đầy đủ; validator false positive; checkpoint/report sai; hoặc thiếu dữ liệu ngôn ngữ.
4. Không coi cột `original` trong report là dữ liệu nguồn cho đến khi xác nhận cách report dựng trường đó.

### Giai đoạn 2 — Sửa luồng dịch và kiểm tra trước khi ghi

1. Tách bước sinh output khỏi bước commit catalog: dịch và validate xong, chỉ ghi đè catalog khi đạt tiêu chí đã thống nhất; nếu không đạt, giữ bản đang dùng và lưu ứng viên/lỗi vào nơi review phù hợp.
2. Dịch theo field lỗi khi có thể; với product catalog cần bảo đảm các field còn lại không bị thay đổi ngoài ý muốn. Respect `manualFields`.
3. Trích xuất và bảo toàn chính xác model, SKU, CPU/GPU, RAM, storage, kích thước, tần số, chuẩn kết nối và số liệu từ nguồn. Nếu output đổi/xóa/thêm giá trị kỹ thuật thì từ chối ghi.
4. Bổ sung kiểm tra cấu trúc theo field: name không được bịa model; specs phải giữ nguyên giá trị nguồn; description phải đủ ý và không trộn ngôn ngữ; markup phải khớp.
5. Rà lại validator `inconsistent`: phân biệt bất nhất thực sự với cách diễn đạt khác nhau; giữ yêu cầu nhất quán ở mức phù hợp với field và ngôn ngữ.
6. Gắn version/chính sách validator vào checkpoint signature khi thay đổi cách dịch/kiểm tra để tránh tái sử dụng payload từ chính sách cũ.
7. Kiểm tra trạng thái khi lỗi provider: 429 phải dừng nhận việc mới, không ghi giả `success`, bảo toàn bản trước và tính remaining theo danh sách job thực sự chưa hoàn thành.
8. Không tăng concurrency để bù quota. Tôn trọng quota/rate limit đã được cấp; lưu lại thời điểm retry phù hợp từ `Retry-After` hoặc chính sách backoff.

### Giai đoạn 3 — Test và canary không ảnh hưởng production

1. Unit test cho việc trích xuất/bảo toàn technical token và nhận diện thay đổi model/SKU.
2. Unit/integration test đảm bảo output không đạt không ghi đè catalog, checkpoint retry-unresolved gọi provider lại, checkpoint field của job bị ngắt được resume/clear đúng theo chính sách, provider 429 dừng batch đúng cách và status/report đếm đúng.
3. Test selector trên fixture cho `approved`, `pending`, `needs_retranslate`, lỗi provider, manual fields và source hash thay đổi.
4. Tạo chế độ canary chỉ trả preview (không ghi catalog, không đổi storefront). Chạy 3–5 sản phẩm trên 1 ngôn ngữ trước; sau review mới thử 20–30 jobs.
5. Tiêu chí canary: không có thay đổi model/SKU/spec; không có lỗi blocking; nội dung được người review chấp nhận; validator và log phản ánh đúng kết quả. Nếu một lỗi nghiêm trọng xuất hiện, dừng và chỉnh tiếp.
6. Không chạy thử Cloudflare nếu toàn bộ cấu hình đang 429; trước tiên xác nhận quota/rate-limit đã hồi phục trong dashboard hoặc bằng request kiểm soát nhỏ.

### Giai đoạn 4 — Rollout có giới hạn và kiểm chứng storefront

1. Chỉ chọn record còn lỗi/thiếu, theo từng ngôn ngữ và batch nhỏ; giữ nguyên bản approved sạch.
2. Chạy tuần tự với concurrency thấp, giới hạn số job/lô và ngân sách request/input; lưu report theo từng lô.
3. Sau mỗi lô đối chiếu số job bắt đầu, approved, vẫn lỗi, failed do provider, chưa chạy và số record thực sự được ghi.
4. Tính lại source hash/readiness cho sản phẩm bị tác động; kiểm tra storefront chỉ hiển thị sản phẩm đạt mọi ngôn ngữ yêu cầu.
5. Dừng rollout nếu tỷ lệ approved thấp, số liệu report lệch, số `storefrontReady` giảm ngoài dự kiến hoặc xuất hiện thay đổi technical token.

## Truy vấn và chỉ số cần theo dõi

- Catalog: group theo `targetLang`, `status`, `qualityStatus`; thống kê validation errors, score và provider.
- Coverage: so distinct `entityId` catalog với tập `Product` active theo từng ngôn ngữ; không suy ra missing product chỉ từ chênh lệch tổng số documents.
- Source integrity: đếm source hash stale và thiếu trường bắt buộc.
- Storefront: đếm active, ready, not-ready, unchecked; phân tích lý do không ready theo locale, missing translation, quality error, source hash và field/spec thiếu.
- Job accounting: dùng tập khóa job duy nhất, tách resumed/current/failed; `remaining` phải bằng số việc thực sự chưa fixed hoặc chưa chạy, không cộng trùng.

## Điều kiện trước khi chạy diện rộng

- Backup đã xác minh đọc được.
- Mẫu lỗi đã được so với dữ liệu nguồn thô.
- Canary đạt tiêu chí chất lượng và không ghi đè dữ liệu không đạt.
- Retry/checkpoint/report có test bảo vệ.
- Quota/rate limit Cloudflare đủ cho batch dự kiến và có cơ chế dừng/backoff.
- Có đối chiếu sau chạy cho approved, validation errors, source hash và storefront readiness.

## File code cần xem khi triển khai

- `online-store-backend/src/services/productCatalogRetranslationService.js`
- `online-store-backend/src/services/productTranslationService.js`
- `online-store-backend/src/services/cloudflareAiService.js`
- `online-store-backend/src/seeds/retranslateSeeder.js`
- `online-store-backend/src/utils/productRetranslationSelector.js`
- `online-store-backend/src/utils/retranslateProgress.js`
- `online-store-backend/src/utils/translationValidator.js`
- `online-store-backend/src/utils/translationHelper.js`
- `online-store-backend/src/utils/translationReporter.js`
- `online-store-backend/src/test/translation-product-cache.test.js`
- `online-store-backend/src/test/retranslate-progress.test.js`
- `online-store-backend/src/test/cloudflare-ai-service.test.js`
