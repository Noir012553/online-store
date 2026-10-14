# Sự cố chất lượng retranslate và kế hoạch khắc phục

## Tóm tắt

Chuyển provider sang Cloudflare AI không tự đảm bảo bản dịch đạt chuẩn. Các log cho thấy request Cloudflare trả kết quả, nhưng validator vẫn từ chối phần lớn bản dịch; lượt chạy sau tiếp tục bị HTTP 429 và dừng. Chạy lại bằng cùng model/prompt không phải cách xử lý gốc và có nguy cơ ghi thêm kết quả không đạt vào catalog.

**Trạng thái tài liệu:** đã triển khai một phần các bảo vệ trong code cho checkpoint, accounting/report và technical token. Câu “chưa truy cập/cập nhật database, chưa chạy retranslate hoặc canary” mô tả trạng thái tại thời điểm ghi phần incident ban đầu; kết quả pilot trợ lý và thao tác DB có kiểm soát được cập nhật ở cuối tài liệu.

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

Snapshot truy vấn tại thời điểm incident ghi nhận 618 sản phẩm active, trong đó 3 `storefrontReady`, 615 chưa ready và 6 chưa có thời điểm kiểm tra readiness. Đây là số liệu lịch sử theo trạng thái/rule lúc đó, không phải readiness hiện tại sau thay đổi điều kiện description; cần chạy lại report để có số mới và không so trực tiếp với snapshot 588 sản phẩm ở các cập nhật sau.

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
- source và translation đều có `name`, `brand`; description không bắt buộc nếu source description rỗng, nhưng translation description phải có nội dung khi source có description;
- mọi spec có giá trị trong source đều có spec translation tương ứng; specs không thay thế description;
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
4. Bổ sung kiểm tra cấu trúc theo field: name không được bịa model; specs phải giữ nguyên giá trị nguồn; nếu source description có nội dung thì bản dịch phải đủ ý và không trộn ngôn ngữ; markup phải khớp.
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

## Cập nhật 2026-10-06 — Seed dịch sản phẩm, review và ảnh nguồn

### Bằng chứng từ report seed

- Report `seed-report-2026-10-05T17-30-33.txt`: lệnh lọc rate limit trả **0 dòng**; summary trước đó cũng ghi `rateLimitCount: 0` cho 8 ngôn ngữ. `totalRequests: 429` là bộ đếm request thành công, không phải HTTP 429.
- Report ghi nhận **4.696 product-language records cần xử lý** (587 × 8 ngôn ngữ). Đây là số liệu của lần chạy trước; chưa có lần retry sau các sửa đổi trong mục này.
- Token verify cho 12 cấu hình Cloudflare đều `ACTIVE`, nhưng verify không xác nhận Workers AI permission hoặc account/token pairing.
- Lỗi ảnh 404 là URL nguồn không còn truy cập được; không thể suy ra URL thay thế từ code.

### Những gì đã sửa trong code

- Lỗi `CONCURRENT_FIELDS is not defined` đã được sửa trước đó; `_translateProduct` dùng concurrency được cấu hình trong đúng scope.
- `productSeedPipeline.js`: không thay ảnh chính bằng ảnh gallery. Nếu ảnh chính lỗi (kể cả HTTP 404), sản phẩm bị bỏ qua và ghi log; pipeline không tiếp tục upload gallery/ảnh mô tả cho sản phẩm đó. Cần sửa URL ảnh chính trong nguồn rồi chạy lại sản phẩm.
- `cloudflareAiService.js`: prompt ghi tên ngôn ngữ nguồn/đích thay vì chỉ mã như `sv`; từ chối response thiếu `result.response` hoặc trả câu trả lời “không có văn bản” thay vì coi là bản dịch.
- `translationSeederHelper.js`: bản dịch review truyền nguồn `en` (nội dung review seed đang là tiếng Anh); cache không còn dùng chung khóa giữa nguồn tiếng Anh và tiếng Việt, đồng thời vẫn giữ nguyên khóa lịch sử cho nguồn mặc định tiếng Việt. Output không đầy đủ được retry có giới hạn và chia nhỏ; lỗi 401/403 dừng sớm, không retry hàng loạt.
- `LiveTranslationCache.js`: enum chấp nhận `review_name` và `review_comment`, là các entity type review seeder vốn đã ghi.
- `productTranslationSeederService.js`: nhận diện 420/429/quota qua status và thông báo provider; dừng các nhóm request sản phẩm mới khi gặp 401/403 thay vì tiếp tục gửi lỗi cho mọi field.
- Thêm lệnh retry chuyên biệt `npm run translate:retry`; không chạy crawler, import hoặc clear. Có thể giới hạn bằng `--products-only`, `--reviews-only` hoặc `--languages=de,en`. Bản dịch được duyệt sẽ được dùng lại; các field chưa được duyệt sẽ được thử lại. Lệnh trả lỗi khác rate limit với exit code khác 0; rate limit được báo riêng.

### Kiểm tra và giới hạn hiện tại

- `node --check` đã qua cho các file JavaScript đã sửa và `package.json` parse hợp lệ.
- Chưa chạy được suite i18n: workspace thiếu package `dotenv`. Python image test cũng không chạy được do môi trường thiếu package `requests`; không có file Python nào được thay đổi.
- Không chạy `npm run build`, không kết nối MongoDB, không gọi Cloudflare AI/R2 và không cập nhật dữ liệu người dùng trong phiên này.
- Chưa xác minh lại 4.696 mục sau retry. Cần xác nhận Workers AI permission/account-token pairing trước khi chạy; nếu còn 401/403, lệnh retry sẽ dừng sau các request đang chạy.
- Quyết định cập nhật: không dùng fallback ảnh gallery khi ảnh chính nguồn lỗi, vì việc đổi ảnh đại diện có thể làm sai dữ liệu sản phẩm. Các URL ảnh chính trả 404 cần được sửa trong dữ liệu nguồn; code không tự tạo, đoán URL thay thế hoặc chọn ảnh khác.

Lệnh chạy sau khi cấu hình Cloudflare đã được xác nhận:

```powershell
npm run translate:retry -- --products-only
```

Chạy giới hạn một số ngôn ngữ để canary:

```powershell
npm run translate:retry -- --products-only --languages=en,de
```

Sau khi chạy, cần đối chiếu report/cache theo từng ngôn ngữ để xác nhận số bản dịch được duyệt và số lỗi không phải rate limit; không xem lệnh kết thúc là bảo đảm toàn bộ catalog đã hoàn tất.

## Đề xuất — Dùng trợ lý để bổ sung bản dịch từ nguồn sản phẩm

**Trạng thái lúc lập đề xuất:** chưa xuất dữ liệu, dịch, gọi provider hay cập nhật MongoDB. Kết quả pilot được thực hiện sau đó được ghi tại mục cập nhật cuối tài liệu.

### Mục tiêu và số liệu đầu vào

Kết quả người dùng kiểm tra gần nhất là 588 sản phẩm đang hoạt động, 4.704 vị trí dịch cho 8 ngôn ngữ đích, 4.704 cache ở trạng thái `success`, nhưng chỉ 231 cache được `approved`; hiện 1/588 sản phẩm đủ điều kiện storefront. Điều này chưa chứng minh 4.473 vị trí bị thiếu bản dịch: trước tiên cần biết chúng `pending`, `needs_retranslate`, lỗi validator hay có `sourceHash` cũ.

### Giai đoạn A — Audit chỉ đọc

1. Lấy trường nguồn tiếng Việt của sản phẩm đang hoạt động cùng `sourceHash`, ngôn ngữ đích, `qualityStatus`, `qualityScore` và `validationErrors` của cache.
2. Đối chiếu nguồn trong MongoDB với JSON scraper tương ứng nếu file còn tồn tại; không dùng nội dung hoặc URL bên ngoài làm nguồn thay thế khi chưa xác minh.
3. Thống kê từng nhóm lý do chưa đạt theo ngôn ngữ và product ID; lấy mẫu nhỏ để xác nhận quy tắc validator trước khi tính số lượng cần dịch.
4. Chỉ đưa vào candidate các trường thiếu, stale hoặc không đạt; giữ nguyên bản dịch approved, field thủ công và mọi cache sạch. Không gửi `.env`, thông tin kết nối hay dữ liệu người dùng vào batch.

### Giai đoạn B — Chốt nguồn gốc và nơi lưu kết quả

Bản dịch do trợ lý tạo **không phải bản dịch Cloudflare**. Schema hiện tại giới hạn provider ở `cloudflare`; vì vậy không ghi bản dịch của trợ lý vào cache rồi gắn nhãn Cloudflare hoặc tự đặt `approved`.

Trước khi áp dụng production cần chọn một cách rõ ràng:

- Dùng bản dịch của trợ lý làm bản nháp để rà soát; Cloudflare vẫn là provider duy nhất tạo bản dịch production. Cách này giữ nguyên chính sách hiện tại nhưng không thay thế được rate limit.
- Cho phép một luồng bản dịch thủ công có nguồn gốc riêng, được review và validate trước khi nhập. Cách này cần thay đổi schema/import/readiness và ghi nhận provenance trung thực; chỉ làm sau khi được duyệt riêng.

### Giai đoạn C — Pilot giới hạn credit

1. Sau audit, chọn một sản phẩm đại diện có tên, mô tả và thông số kỹ thuật; thử 1–2 ngôn ngữ trước, trong đó có một ngôn ngữ đang có nhiều lỗi. Không bắt đầu với cả 588 sản phẩm.
2. Xuất candidate tối thiểu gồm `productId`, `targetLang`, `sourceHash`, các trường nguồn cần dịch và lỗi validator; bỏ toàn bộ secret.
3. Dịch theo schema cache hiện tại, giữ nguyên brand, model/SKU, số liệu, đơn vị, giá trị spec và cấu trúc markup; không suy đoán phần thiếu trong nguồn.
4. Ghi số credit hiển thị trước/sau pilot. Chưa có quy đổi đáng tin từ credit sang số ký tự; chỉ mở rộng nếu mức dùng thực tế nằm trong ngân sách 15 credits do người dùng xác nhận.
5. Đối chiếu bản dịch với nguồn, chạy validator và review nội dung. Nếu sai model/spec, sai ý hoặc không đạt validator thì dừng pilot và phân tích, không tăng batch.

### Giai đoạn D — Batch có kiểm soát

1. Chỉ sau khi pilot đạt, chia candidate thành batch nhỏ theo độ dài; giới hạn ngân sách credit và chờ xác nhận trước mỗi đợt mở rộng.
2. Mỗi kết quả cần giữ `productId`, ngôn ngữ, `sourceHash`, trường dịch, trạng thái kiểm định và nguồn tạo bản dịch để phát hiện stale data hoặc sai provenance.
3. Không dịch lại mọi trường của product-language khi chỉ một field có lỗi; không ghi đè field thủ công hay bản approved hiện hành.
4. Xuất preview/report trước khi ghi; tổng hợp số candidate, dịch xong, đạt validator, cần review, lỗi và credit tiêu thụ theo batch.

### Giai đoạn E — Nhập và xác nhận storefront

1. Chỉ thực hiện sau khi thống nhất phương án lưu ở Giai đoạn B, có backup các product/cache liên quan và chấp thuận ghi DB.
2. Validate `sourceHash`, nội dung bắt buộc, spec/model/SKU và mọi lỗi blocking; không duyệt hàng loạt chỉ vì `status: success`.
3. Ghi theo batch có thể rollback; cập nhật readiness cho các product bị tác động rồi kiểm tra lại số sản phẩm đạt đủ 8 ngôn ngữ và một mẫu trên storefront.
4. Dừng nếu số lỗi tăng, số liệu không khớp, có thay đổi spec/model, vượt ngân sách credit hoặc readiness giảm ngoài dự kiến.

### Điều kiện bắt đầu

- Hoàn tất audit chỉ đọc và xác định lý do cụ thể của nhóm chưa approved.
- Người dùng chọn rõ giữa bản nháp trợ lý và luồng nhập thủ công có provenance riêng.
- Pilot nhỏ được review và ngân sách 15 credits được xác nhận bằng mức tiêu thụ thực tế.
- Có backup và chấp thuận riêng trước mọi lần ghi dữ liệu production.

Không có bản dịch, lệnh seed/retranslate, lời gọi Cloudflare hay thay đổi MongoDB nào được thực hiện khi soạn kế hoạch này.

## Cập nhật — Luồng trợ lý dịch bổ sung theo lô có duyệt

### Vấn đề

Số cache có `status: success` không đồng nghĩa với số bản dịch được duyệt hoặc sản phẩm có thể hiển thị trên storefront. Một bản dịch chỉ đóng góp vào readiness khi nội dung hiện hành đầy đủ, đạt kiểm tra chất lượng, không có lỗi blocking và `sourceHash` còn khớp. Sản phẩm vẫn cần đạt điều kiện ở tất cả ngôn ngữ đích bắt buộc; dịch xong một ngôn ngữ không tự làm sản phẩm sẵn sàng.

Chờ Cloudflare hết rate limit không giải quyết được nhu cầu bổ sung bản dịch trong lúc đó. Tuy nhiên, không được ghi bản dịch do trợ lý tạo thành bản Cloudflare hoặc tự đánh dấu approved: cần provenance riêng, preview, review và thao tác duyệt rõ ràng.

### Cách xử lý đã triển khai

Đã thêm luồng riêng **trợ lý dịch → bản nháp → review → duyệt**, tách khỏi luồng Cloudflare:

1. Trong trang quản trị bản dịch sản phẩm, export các sản phẩm/ngôn ngữ cần bổ sung. File có nguồn sản phẩm, `productId`, `targetLang` và `sourceHash` để giữ đúng danh tính và phát hiện nguồn đã thay đổi.
2. Gửi JSON export cho trợ lý theo prompt mẫu bên dưới. Chỉ điền các trường nội dung cần dịch; giữ nguyên ID, hash, cấu trúc, thông số kỹ thuật, SKU/model, đơn vị và giá trị số. Không đoán phần thiếu trong nguồn.
3. Upload JSON đã dịch lên trang quản trị để chạy preview/validation. Preview là chỉ đọc; chưa ghi cache.
4. Khi preview hợp lệ, admin chủ động nhập bản dịch thành draft. Draft có `provider: assistant`, `providerSource: assistant_batch`, trạng thái `pending`; không bị nhận nhầm thành bản Cloudflare và không được Cloudflare retry selector lấy xử lý lại.
5. Review nội dung trong editor. Chỉ dùng thao tác approve khi bản dịch đạt yêu cầu. Backend kiểm tra provenance, trạng thái, chất lượng, tính đầy đủ, lỗi validation và `sourceHash` hiện tại trước khi duyệt.
6. Sau khi duyệt, readiness được tính lại. Sản phẩm chỉ đủ điều kiện storefront khi đáp ứng đủ điều kiện của tất cả ngôn ngữ bắt buộc; approval một bản dịch riêng lẻ không bảo đảm sản phẩm sẽ hiển thị.

Import assistant mặc định là dry-run; chỉ thao tác nhập draft riêng biệt mới ghi dữ liệu. Bản dịch có `sourceHash` cũ phải được export/dịch lại từ nguồn hiện hành. Các field thủ công tiếp tục được bảo vệ.

### Prompt mẫu cho lần dịch sau

Trước tiên export một lô nhỏ từ trang quản trị, rồi gửi file JSON export kèm prompt sau. Thay các phần trong ngoặc vuông cho phù hợp:

> Hãy dịch bổ sung theo lô cho storefront từ JSON nguồn đính kèm. Dịch sang các ngôn ngữ được chỉ định trong từng record: [ngôn ngữ hoặc mã ngôn ngữ]. Chỉ dịch các trường nội dung nằm trong cấu trúc JSON; giữ nguyên chính xác `productId`, `targetLang`, `sourceHash`, tên key, cấu trúc mảng/object và các metadata khác. Không tự thêm hoặc bỏ record, không đổi model/SKU, thông số kỹ thuật, số liệu, đơn vị, tên thương hiệu hay ý nghĩa từ nguồn. Dịch tự nhiên, đúng thuật ngữ ngành hàng và đầy đủ ý cho storefront; không suy đoán thông tin nguồn bị thiếu. Trả về JSON hoàn chỉnh đúng schema đầu vào, không kèm Markdown hoặc lời giải thích bên ngoài JSON. Nếu có nội dung nguồn mơ hồ/thiếu khiến không thể dịch chính xác, giữ nguyên record đó và báo riêng `productId`, ngôn ngữ, field cùng lý do. Chỉ tạo nội dung để review; không import, approve, gọi API dịch bên ngoài hoặc ghi database.

Khuyến nghị bắt đầu với 5–10 sản phẩm và 1–2 ngôn ngữ, kiểm tra preview và review chất lượng trước khi mở rộng lô. Chọn các ngôn ngữ cần dịch ngay trong trang quản trị và prompt; không mặc định rằng một batch đã bao phủ đủ toàn bộ 8 ngôn ngữ.

### Phạm vi và kiểm chứng

- Đã thêm provenance assistant, metadata approval, export batch, import draft có preview, approval có kiểm tra freshness, giao diện admin và test tương ứng.
- Bản dịch do trợ lý tạo không được gắn nhãn Cloudflare. Assistant draft vẫn là `pending` cho đến khi admin duyệt.
- Tại thời điểm kiểm chứng luồng code, chưa có dữ liệu bản dịch production nào được dịch/import/approve; pilot DB có kiểm soát được thực hiện sau đó và ghi tại mục cập nhật 2026-10-10.
- Các kiểm tra đã chạy: 9 test mục tiêu pass; frontend typecheck pass; JavaScript syntax, JSON parse và `git diff --check` pass. Không chạy `npm run build`.
- Chưa xác minh giao diện bằng browser vì preview không khả dụng trong phiên đó.

### Các điểm vào code

- `online-store-backend/src/controllers/translationController.js`: export, import draft, validation, approval và readiness.
- `online-store-backend/src/routes/translationRoutes.js`: các endpoint admin cho export và approval.
- `online-store-backend/src/models/ProductCatalogTranslationCache.js`: provider/provenance và metadata duyệt.
- `online-store-backend/src/utils/productRetranslationSelector.js`: loại assistant draft khỏi Cloudflare catalog retry.
- `online-store-frontend/src/pages/admin/translationsDynamic.tsx`: export/upload/preview/import/review/approval trong trang quản trị.
- `online-store-backend/src/test/translation-product-cache.test.js`: kiểm thử các quy tắc an toàn của luồng.

Các nội dung kế hoạch ở trên vẫn mô tả incident và hướng xử lý Cloudflare riêng; luồng trợ lý theo lô có duyệt là bổ sung, không thay thế provider Cloudflare hay tự động dịch toàn bộ catalog.

## Kế hoạch: Kiểm định bản dịch bằng AI vòng hai và duyệt có kiểm soát

**Trạng thái: đề xuất, chưa triển khai; chưa gọi Cloudflare để kiểm tra, chưa ghi cache hoặc approve dữ liệu.**

### Mục tiêu

Dùng Cloudflare AI như một bộ kiểm định thứ hai để rà bản dịch sản phẩm đã có, tìm lỗi nghĩa và lỗi bảo toàn thông số trước khi admin quyết định duyệt. Đây là luồng kiểm định riêng, không phải dịch lại và không thay đổi ý nghĩa của `provider`/provenance hiện có.

Theo lần kiểm tra gần nhất của người dùng, 588 sản phẩm active có đủ 4.704 slot (`success` hiện hành ở 8 ngôn ngữ), nhưng chỉ 432 slot được báo `approvedCurrent` và chỉ 1 sản phẩm đủ điều kiện storefront. Các slot approved không nhất thiết thuộc cùng một tập sản phẩm; mục tiêu là xác định chính xác vấn đề theo từng product-language, không chỉ tăng tổng số approved.

### Nguyên tắc an toàn

- Không chạy lại seed/retranslate để thực hiện audit.
- Chỉ đưa candidate có source hash hiện hành vào kiểm tra; source stale hoặc thiếu dữ liệu phải được báo riêng.
- Giai đoạn audit chỉ đọc: không sửa translation, không đổi `qualityStatus`, không ghi kết quả vào cache và không tự approve.
- Giữ nguyên validator, kiểm tra completeness và yêu cầu storefront hiện có. Kết quả AI không thể bỏ qua lỗi blocking, sai model/SKU/spec/số liệu, field thiếu hoặc hash stale.
- Tính và giới hạn riêng ngân sách request/input characters cho judge; không vượt budget Cloudflare đã cấu hình. Không retry vô hạn; dừng khi rate limit, lỗi response rỗng hoặc đạt giới hạn pilot.
- Ghi provenance rõ trong report rằng đây là AI second-pass judge, không phải bản dịch hoặc approval của Cloudflare.

### Giai đoạn 1 — Audit chỉ đọc và chọn candidate

1. Xuất danh sách product-language chưa approved cùng `productId`, `targetLang`, source hash hiện tại, source text, translated text, validation errors và score; loại secret và dữ liệu không liên quan.
2. Chia nhóm theo ngôn ngữ, loại lỗi, độ dài và trường dịch. Ưu tiên kiểm tra mẫu có lỗi validator hoặc technical/spec để hiểu nguyên nhân trước khi mở rộng.
3. Loại bản dịch đã approved, source stale, field thủ công không được kiểm tra và record không có đủ nguồn đối chiếu; giữ một lý do loại rõ ràng trong report.
4. Đếm số request/input characters dự kiến trước khi gọi provider. Nếu không thể xác định ngân sách an toàn thì dừng tại bước export.

### Giai đoạn 2 — Thiết kế judge riêng

1. Tạo prompt chuyên kiểm định, không dùng prompt dịch hiện có. Đưa vào judge ngôn ngữ nguồn/đích, nguồn, bản dịch, field type và spec/model liên quan khi cần.
2. Yêu cầu verdict có cấu trúc: `pass`, `review` hoặc `fail`; danh sách issue theo mức độ; cờ riêng cho sai nghĩa, bỏ sót, thêm thông tin, sai brand/model/SKU/spec/số liệu/đơn vị và độ tự nhiên; giải thích ngắn dựa trên đoạn nguồn/bản dịch.
3. Chỉ chấp nhận response JSON đúng schema. Response rỗng, malformed, thiếu verdict hoặc lỗi provider là `review/error`, tuyệt đối không coi là `pass`.
4. Giữ judge ở chế độ stateless, không có quyền gọi API ghi cache/approve. Thực hiện kiểm tra hash/completeness/validator bằng code trước khi gọi AI để không trả quota cho candidate vốn đã stale hoặc không đủ field.
5. Nếu dùng cùng model đã dịch để kiểm tra, ghi nhận nguy cơ hai lượt cùng mắc một lỗi. So sánh model judge khác chỉ khi được cấu hình/cho phép và budget đủ; không tự đổi model production.

### Giai đoạn 3 — Pilot không ghi database

1. Bắt đầu bằng 10–20 product-language records trên 1–2 ngôn ngữ; lấy mẫu đại diện, gồm mô tả dài, field ngắn/spec, bản bị validator chặn và bản có nhiều technical token.
2. Chạy judge chỉ đọc, lưu report cục bộ theo batch; không cập nhật cache hay readiness.
3. Người review đối chiếu từng verdict với nguồn. Ghi nhận AI false-pass, false-fail, bất đồng người-review, lỗi kỹ thuật và quota thực tế.
4. Dừng ngay nếu có false-pass về model/SKU/spec/số liệu, judge trả JSON sai, source hash không khớp, mức dùng vượt budget hoặc Cloudflare rate limit.

### Giai đoạn 4 — Đánh giá và quyết định

- Không dùng tỉ lệ đồng thuận tổng thể để che lấp lỗi nghiêm trọng: tiêu chí bắt buộc là **không có false-pass về thông số kỹ thuật trong pilot**.
- Phân tích false-pass/false-fail theo ngôn ngữ và loại field; chỉnh prompt hoặc thu hẹp phạm vi rồi chạy lại pilot chỉ khi được chấp thuận.
- Kết quả `review` không tự chuyển thành `approved`; chuyển cho admin review thủ công.
- Chỉ đề xuất mở rộng khi pilot đạt tiêu chí, report/quota khớp và người dùng chấp thuận batch tiếp theo. Không tự chạy toàn bộ 4.272 slot còn chưa approved.

### Giai đoạn 5 — Duyệt sau kiểm định

1. AI `pass` chỉ tạo candidate để xem xét, không phải lệnh approve.
2. Backend phải chạy lại các điều kiện hiện hành: source hash mới nhất, status thành công, nội dung đủ, validator không có lỗi blocking, chất lượng đạt ngưỡng và manual-field protection.
3. Chỉ admin mới thực hiện thao tác approve tường minh; mọi thao tác ghi cần batch scope, report trước/sau và log người duyệt/thời điểm.
4. Sau khi duyệt, tính lại storefront readiness theo từng product ID. Không suy luận readiness từ tổng số slot approved; một sản phẩm cần đủ mọi ngôn ngữ bắt buộc.
5. Dừng batch nếu xuất hiện sai technical token, freshness conflict, readiness giảm hoặc số liệu report không khớp.

### Report tối thiểu

Mỗi dòng ghi `productId`, `targetLang`, field, source hash, verdict, lỗi validator gốc, AI issues, trạng thái review của admin và số request/input characters tiêu thụ. Report tổng hợp candidate, pass/review/fail/error, false-pass/false-fail, số lỗi kỹ thuật, số slot/product được admin approve và readiness sau batch. Không ghi API token hoặc secret.

### Điều kiện trước khi bắt đầu

- Có prompt/schema judge riêng và test cho JSON rỗng/sai cấu trúc, lỗi provider, rate limit, technical-token mismatch và stale hash.
- Có giới hạn budget rõ ràng cùng cách dừng an toàn khi quota hết.
- Pilot được chạy chỉ đọc và được người dùng xem xét trước mọi thao tác ghi.
- Approval vẫn là thao tác admin; nếu muốn tự động approve ở giai đoạn sau phải có quyết định và kế hoạch kiểm soát riêng.

Tên ngắn để tham chiếu: **AI Second-Pass Translation Audit** — **Kiểm định bản dịch bằng AI vòng hai**.

## Cập nhật 2026-10-10 — Kết quả pilot trợ lý và bài học

### Vấn đề gặp phải

- Candidate cũ gồm 5 sản phẩm × 8 locale được lưu trong `reports/`, thư mục bị ignore khỏi Git. Sau khi workspace được làm mới, các file không còn trong cây dự án và không thể khôi phục từ nhánh đã push. Không được coi các candidate cũ là đã import.
- Khi dựng lại pilot từ nguồn DB, một số nguồn ban đầu có mô tả quá ngắn hoặc lẫn nội dung sản phẩm khác; các nguồn đó bị loại, không dịch hoặc duyệt.
- Validator phát hiện technical token bị đổi định dạng trong bản nháp đầu, gồm `Φ13mm`, `Bluetooth v5.4` và `60ms`. Candidate được sửa để giữ nguyên token theo nguồn trước khi import.
- Lỗi `inconsistent` phát sinh do bản dịch khác chuỗi với bản approved cũ; đây không tự chứng minh bản dịch mới sai. Chỉ các locale được admin xem xét và xác nhận riêng mới được approve có audit.

### Kết quả đã xác minh

- Tại thời điểm cập nhật này, phạm vi đã hoàn tất mới là **1 sản phẩm**: Edifier True Wireless X1 Lite White; 4 sản phẩm còn lại được xử lý riêng trong cập nhật tiếp theo bên dưới.
- Import 4 assistant draft cho `en`, `fr`, `de`, `nl`. Các locale `pt`, `it`, `es`, `sv` đã approved trước đó nên được giữ nguyên, không ghi đè.
- Cả 4 draft đạt ngưỡng điểm và không còn lỗi blocking ngoài `inconsistent`; `en`, `de`, `nl` được duyệt sau xác nhận có ghi audit, `fr` được duyệt không cần override.
- Kiểm tra tại thời điểm đó xác nhận đủ 8/8 locale bắt buộc, `sourceHash` hiện hành, không còn validation error và sản phẩm đạt storefront readiness. Kết quả tổng hợp cả 5 sản phẩm được ghi ở cập nhật tiếp theo.

### Bài học vận hành

1. Candidate trong thư mục bị ignore không phải bằng chứng lưu trữ bền vững. Cần giữ export/candidate ở nơi có thể khôi phục hoặc tạo lại từ nguồn DB và kiểm tra `sourceHash` trước khi tiếp tục.
2. Trước khi dịch, kiểm tra nguồn có khớp sản phẩm, mô tả đủ nghĩa và thông số nhất quán; loại nguồn lẫn sản phẩm hoặc thiếu dữ liệu thay vì tự suy đoán.
3. Bảo toàn model/SKU, số liệu, đơn vị và technical token nguyên dạng, gồm cả ký hiệu Unicode và khoảng trắng có ý nghĩa; chạy validator và dry-run trước khi import.
4. Chỉ dịch locale thiếu hoặc lỗi; giữ nguyên locale đã approved, field thủ công và hash còn mới.
5. Phân biệt lỗi nội dung với `inconsistent` do khác chuỗi so với cache cũ. Override chỉ áp dụng khi các điều kiện khác đều đạt và phải có xác nhận cùng ghi chú audit.
6. Approval từng locale không đồng nghĩa storefront-ready. Sau cùng phải kiểm tra completeness, validation errors, source hash và cờ readiness tính lại trên sản phẩm.

## Cập nhật 2026-10-10 — Hoàn tất 4 sản phẩm còn lại của pilot

- Audit lại nguồn và trạng thái locale hiện hành trước khi ghi; hash nguồn khớp, không có manual field bị ghi đè. Các locale approved/current được giữ nguyên.
- Import và duyệt thêm **17 assistant draft**: Razer Huntsman V3 Pro Mini (`pt`, `fr`, `de`, `it`, `nl`); Edifier W830NB Gray (`fr`, `de`); Edifier W830NB Black (`fr`, `de`); Logitech M650 Signature Graphite (đủ 8 locale do các slot đều cần bổ sung nội dung/spec).
- Candidate đạt 17/17 record hợp lệ ở dry-run, đạt ngưỡng điểm và không còn lỗi validation ngoài `inconsistent`; technical token của Razer được giữ nguyên trước khi import. Các override `inconsistent` được xác nhận riêng và ghi audit.
- Kiểm tra cuối với đầy đủ fields xác nhận cả **5/5 sản phẩm** có đủ 8/8 locale approved hiện hành, hash mới, không blocker và stored `storefrontReady = true`. Cả 5 đạt điều kiện storefront; điều này không đại diện cho readiness của toàn catalog.
- Tổng cộng pilot có 21 assistant draft được duyệt trong 5 sản phẩm; các slot approved có sẵn không bị ghi đè. Không gọi Cloudflare AI trong các thao tác pilot này.

### Bổ sung bài học

- Dry-run cần kiểm tra cả payload hoàn chỉnh lẫn phép tính readiness sau import; truy vấn xác minh phải chọn đủ source và translation fields mà classifier sử dụng.
- Với validator đếm số lần xuất hiện của technical token, giữ đủ số lần token model trong nội dung dịch; không loại token để làm câu văn ngắn hơn.
- Khi mở rộng pilot, cập nhật rõ tổng scope, số draft mới, số slot được giữ nguyên và trạng thái từng sản phẩm để không nhầm một sản phẩm đã ready với toàn bộ batch.

Không chạy `npm run build` trong lần cập nhật này.

## Cập nhật tiến độ — Kiểm tra backlog, crawler và storefront readiness

### Tình trạng được ghi nhận

- Một snapshot do người dùng cung cấp ghi nhận **588 sản phẩm**, trong đó **2 ready** và **586 chưa ready**; storefront dry-run xác định **4.186 product-locale jobs**. Đây là số liệu tại thời điểm kiểm tra trước các thay đổi readiness bên dưới, không phải số liệu live đã tính lại.
- Một lượt Cloudflare thành công không đồng nghĩa sản phẩm đã sẵn sàng storefront. Bản dịch cần có trạng thái/quality được duyệt, không có lỗi blocking, `sourceHash` hiện hành, đủ specs theo nguồn và description đã dịch khi source description có nội dung; description nguồn rỗng không bắt buộc dịch. Các điều kiện này phải đạt trên mọi locale bắt buộc.

### Nguồn crawler và đơn vị dịch

- `online-store-backend/python/scraper_runner.py` tạo **17 khóa cấp cao nhất** cho product record. Đây không phải số field dịch cố định: specs, ảnh mô tả và promotions có số lượng biến đổi theo sản phẩm.
- `ProductDescription` và `ProductSpecifications` là hai trường nguồn độc lập; `BaseImportAdapter` map chúng riêng, không dùng specs làm fallback description. Seeder tạo job cho description, từng spec value và các field nội dung khác; số translation units phải tính từ dữ liệu từng sản phẩm.
- Với mẫu Acer được kiểm tra, source description thực tế có khoảng 3.600 ký tự. Candidate thêm nội dung X-Rock/ASUS không có trong nguồn là lỗi chất lượng, không phải dữ liệu crawler.

### Chất lượng dịch và retry

- Đã sửa các false positive technical-token đã gặp: `VND` không bị tách nhầm thành volt, `inch`/`inches` được chuẩn hóa tương đương, và ordinal như `12th` không bị coi là token kỹ thuật cần giữ nguyên.
- Đã bổ sung chặn lời bình ngoài bản dịch (`extra_commentary`) và retry có hướng dẫn dịch đủ nội dung, không thêm giải thích. Hướng dẫn retry được đặt trước source text trong prompt để giảm nguy cơ model chép chỉ dẫn vào candidate.
- Các thay đổi liên quan nằm trong `translationValidator.js`, `translationValidation.js`, `productCatalogRetranslationService.js` và `cloudflareAiService.js`; có test hồi quy cho token và thứ tự prompt.

### Tự động hóa field-level

- Đã thêm lệnh `retranslate:product-fields`, mặc định dry-run, giới hạn theo product ID và locale. Lệnh phân loại field approved, thiếu translation hoặc candidate bị validator từ chối; `--apply` mới gọi provider/ghi kết quả.
- Đã sửa report sau apply để reload catalog/checkpoint thay vì in snapshot cũ. Việc chạy trên máy người dùng và các output cũ từ bản local copy không được xem là xác nhận trạng thái hiện tại của workspace hoặc database.

### Quy tắc storefront hiện tại

- Source `name` và `brand` vẫn bắt buộc. **Description không bắt buộc**: nếu source description vắng/rỗng thì cả source lẫn bản dịch description không chặn readiness; nếu source có nội dung thì translation description vẫn phải có nội dung.
- Specs được validate riêng theo từng spec có giá trị trong source; không dùng specs làm fallback cho description. `descriptionImages`/ảnh mô tả là tùy chọn, không phải điều kiện storefront.
- Đã cập nhật `translationHelper.js` và `storefrontReadinessReport.js`; thêm test cho description nguồn vắng, description bản dịch thiếu khi source có nội dung, và phân loại source fields. Chưa chạy lại readiness report trên toàn database sau thay đổi này; các số ready hiện hành cần được tính lại.

### Kết quả kiểm tra local mới nhất (2026-10-13)

- `npm ci` hoàn tất, cài 392 packages và báo 0 vulnerabilities. Lệnh `cd .\\online-store-backend` đầu tiên lỗi vì PowerShell đã ở trong thư mục backend; các lệnh sau chạy đúng từ thư mục hiện tại.
- `npm run test:all -- --suites=i18n,products` chưa đạt toàn bộ: runner báo 1 file test lỗi. Các test liên quan trực tiếp đến readiness pass: `translation-helper.test.js` 30/30 và `storefront-readiness-report.test.js` 6/6, gồm trường hợp source description rỗng và trường hợp bản dịch description thiếu khi source có nội dung.
- `translation-product-cache.test.js` có 106 passing, 5 failing: một assertion technical-token cho `15.6\"` so với `15.6 inch`; một assertion về query không tái sử dụng cache chưa approved; ba test timeout khi Mongoose buffer operation ở `retranslationprogresses.updateOne()`/`livetranslationcaches.findOne()`.
- Hai assertion trên không phải test của rule description storefront. Ba timeout cần kiểm tra test MongoDB/mock và trạng thái kết nối; chưa đủ bằng chứng để kết luận do code readiness.
- Người dùng chạy `npm run backfill:storefront`: setup-production-indexes kết nối MongoDB, đồng bộ/xác minh các index và backfill readiness cho toàn bộ **588 sản phẩm**; output ghi `588 changed`. Con số này là số document được cập nhật, không phải số sản phẩm ready.
- Người dùng tiếp tục chạy `npm run storefront:report`. Snapshot report ghi nhận **588 active, 2 ready, 586 not ready**, `Stored ready flag: 2`, `unchecked: 0`, `mismatches: 0`; readiness được backfill theo cùng rule hiện tại. Bắt buộc có 8 locale: `en, pt, fr, de, it, es, nl, sv`.
- Blocker theo slot: `missing_description: 3.752`, `missing_specs: 2.307`, `quality_not_approved: 4.186` và `validation_errors: 4.186`. Các nhóm có thể chồng nhau. `missing_description` chỉ được báo khi source description có nội dung mà bản dịch locale bị thiếu; source description rỗng không tạo blocker theo code hiện tại.
- Report được lưu cục bộ ở `reports/storefront-readiness/storefront-readiness-2026-10-13T09-12-01-473Z.json`. Output không tiết lộ database/host đích; cần xác nhận `.env` đã trỏ đúng local/dev, vì backfill trước đó đã cập nhật 588 readiness flags và setup/verify indexes trong database được kết nối.
- `npm run build` không chạy.

### Cập nhật — Tách warning alt ảnh mô tả khỏi blocker storefront

- Quy tắc hiện hành: source description rỗng thì translated description không bắt buộc; source description có nội dung thì bản dịch phải có nội dung và đạt validation. Specs được đối chiếu riêng theo từng spec có giá trị ở source, không thay thế description.
- Ảnh mô tả và alt text đều tùy chọn, không quyết định readiness. Validation alt vẫn được ghi thành `optionalFieldWarnings` theo field; không gộp vào `validationErrors`, quality status/score hoặc blocker count. Không có yêu cầu phải hiển thị ảnh mô tả trên storefront.
- Áp dụng tách warning ở catalog retranslation, model catalog cache, admin save/import, product/spec seed aggregation và storefront readiness report. Admin/report có thể xem warning theo field; warning-only locale vẫn được đánh giá readiness theo các điều kiện bắt buộc khác.
- Các điều kiện blocking vẫn gồm name/brand, description khi source có nội dung, specs có giá trị và lỗi validation bắt buộc. Lỗi legacy tổng hợp không có field provenance vẫn blocking; không được coi chúng là lỗi alt nếu chưa revalidate theo field.
- Đã thêm/cập nhật test cho warning alt không chặn readiness, lỗi catalog legacy vẫn blocking, source description rỗng/đầy đủ và retranslation vẫn ghi các field bắt buộc khi alt validation lỗi.
- File thay đổi chính: `productCatalogRetranslationService.js`, `ProductCatalogTranslationCache.js`, `translationController.js`, `productTranslationSeederService.js`, `specTranslationSeeder.js`, `storefrontReadinessReport.js`, `report-storefront-readiness.js` và các test `translation-product-cache.test.js`, `storefront-readiness-report.test.js`.

- `node --check` cho các file sửa và `git diff --check` đã đạt. Chưa xác nhận runtime test: lần thử trong workspace dừng vì thiếu dependency `dotenv`; không chạy `npm run build`.
- Report 588 sản phẩm ở phần trên là snapshot trước khi chạy lại report với phần tách warning này, không xác nhận số readiness/warning hiện hành. Sau khi dependencies sẵn sàng, chạy test liên quan rồi `npm run storefront:report` trên database local/dev đã xác minh; không chạy backfill production chỉ để làm mới report.

#### Tiêu chí đọc report sau cập nhật

- `readyCount` chỉ dựa trên blocker bắt buộc; `optionalWarningCounts` được xem riêng và không làm giảm số ready.
- `missing_description` chỉ là blocker khi source description có nội dung nhưng bản dịch thiếu.
- `validation_errors` tổng hợp cũ vẫn là blocker đến khi được phân loại an toàn theo field.
- Các số blocker là slot product-locale và có thể chồng lấn; không phải số sản phẩm duy nhất.

#### Kiểm tra còn lại

- Cài/khôi phục dependencies trong đúng bản local, chạy `storefront-readiness-report.test.js` và `translation-product-cache.test.js`, sau đó suite phù hợp rộng hơn.
- Chỉ chạy `npm run storefront:report` khi đã xác nhận `.env` trỏ đúng database local/dev; đối chiếu riêng blockers và `Optional field warnings (non-blocking)`.
- Lập phạm vi revalidate các catalog legacy còn `validationErrors` không phân loại; không xóa hoặc hạ mức blocker hàng loạt trước khi có field-level evidence.

---

### Cập nhật 2026-10-13 — Snapshot readiness trước thay đổi optional alt

- Snapshot người dùng cung cấp ghi nhận 588 active, 2 ready, 586 not ready; 3.752 missing-description slots, 2.307 missing-specs slots và 4.186 quality/validation slots. Đây là kết quả tại thời điểm chạy report, không phải kết quả xác minh sau thay đổi tách alt warning.
- Backfill `588 changed` là số document readiness được cập nhật, không phải số sản phẩm đạt storefront. Cần tạo report mới để xác nhận readiness sau code mới.
- `npm run build` không chạy.

## Cập nhật 2026-10-14 — Tách trạng thái sản phẩm, readiness bản dịch và hiển thị trang chủ

### Vấn đề được xác nhận

Người dùng xác nhận sản phẩm thiếu description hoặc ảnh vẫn có thể được chấp nhận trong catalog; sản phẩm thiếu các nội dung này không nên xuất hiện ở trang chủ. Đây là các điều kiện riêng: trạng thái duyệt/đăng bán, readiness của bản dịch và eligibility của trang chủ.

Hiện `Product.storefrontReady` được tính từ chất lượng dịch, source hash, validation, name/brand, description khi nguồn có nội dung, specs và độ phủ mọi locale bắt buộc (`translationHelper.js:163-234`). Cờ này cũng đang chặn public catalog, featured/home, top-rated, brand list và product detail (`productController.js:337-351, 655-687, 715-722, 1354-1368`; `brandController.js:41-43`). Trang chủ gọi endpoint featured và có các filter featured/deal, tồn kho, specs, category; hiện chưa có filter rõ ràng thiếu ảnh chính/description. Model chưa có cờ duyệt/đăng bán riêng; `isDeleted` là soft-delete. `Product.image` bắt buộc trong schema và create controller, còn `description` optional.

Vì vậy translation readiness đang bị dùng như cổng xuất bản/hiển thị chung; sản phẩm translation-pending bị loại khỏi cả catalog và chi tiết, không chỉ home.

### Bằng chứng mới nhất

- Report người dùng chạy ngày 2026-10-14: 588 active, 2 ready, 586 not ready; 4.180 locale slots `quality_not_approved`/`validation_errors`, 3.748 thiếu translated description, 2.304 thiếu translated specs. Blockers là slot product-locale và có thể chồng lặp.
- Apply Cloudflare dừng ở job 273/4.181 với HTTP 429; còn 4.180 jobs, 271 jobs cần review và vẫn 2 sản phẩm ready. Chưa chạy tiếp apply diện rộng.
- Readiness theo rule hiện tại không đại diện cho số sản phẩm admin đã duyệt hay số sản phẩm đủ điều kiện trang chủ.

### Kế hoạch đề xuất — chi tiết, tối ưu, chưa triển khai

#### Mục tiêu thiết kế

Tách ba trách nhiệm độc lập, không để một lần đọc request storefront phải join/đánh giá bản dịch:

1. **Product publication/approval:** quyết định sản phẩm có được bán và trả bởi public API hay không.
2. **Translation readiness:** chất lượng, độ mới, validation và coverage locale; dùng cho report/admin/retranslation, không dùng làm publication gate.
3. **Homepage eligibility:** điều kiện riêng để sản phẩm vào các khu vực home, gồm publication, ảnh chính và description theo yêu cầu nghiệp vụ, cùng featured/deal và các filter merchandising của từng section.

#### Giai đoạn 0 — Chốt contract, không thay đổi dữ liệu

- Xác nhận trạng thái publication hiện tại sẽ được dùng hay cần thêm `isPublished`/approval workflow. `isDeleted` chỉ là soft-delete; không được mặc định suy ra approval từ đó khi chưa có xác nhận.
- Xác nhận policy cho sản phẩm thiếu ảnh chính: hiện Product schema và `POST /api/products` bắt buộc ảnh. Nếu muốn chấp nhận sản phẩm thiếu ảnh, phải sửa contract ở create/import/admin và xác định placeholder cho catalog/detail; homepage vẫn loại chúng.
- Chốt homepage eligibility: ảnh chính không rỗng và source description có nội dung; giữ điều kiện section hiện có như `featured`, active deal, `inStock`, `hasSpecs`, category/price.
- Ghi nhận localization fallback cần tiếp tục hoạt động với translation pending/missing; không yêu cầu đủ 8 locale để sản phẩm đã publish được xem ở public routes.

#### Giai đoạn 1 — Tách domain và dữ liệu

- Đổi tên khái niệm `storefrontReady` thành `translationReady` trong code/report/schema vì nó mô tả freshness, approval, validation, required fields/specs và locale coverage của bản dịch, không phải product publication hay home eligibility.
- Tính `translationReady` khi nguồn hoặc translation cache thay đổi và theo report; không chạy translation-cache lookup để quyết định public GET.
- Dùng publication state riêng làm điều kiện public. Nếu cần approval workflow, tạo trạng thái/metadata và quyền admin tương ứng; nếu không, xác định một rule publication tường minh theo quyết định ở Giai đoạn 0.
- Khi đổi field/index, thiết kế migration dữ liệu có kiểm tra trước/sau, idempotent và rollback rõ; không chuyển giá trị `storefrontReady` cũ thành trạng thái đã duyệt. Không chạy migration production khi chưa được xác nhận.

#### Giai đoạn 2 — Tách query/filter backend

- Áp publication gate chung cho public catalog, brand facets, top-rated, featured/home và product detail; bỏ gate translation readiness khỏi các route này.
- Tạo query builder/eligibility riêng cho homepage để điều kiện ảnh chính/description được áp trước pagination và count. Kết hợp publication cùng filter section, không hậu-lọc sau khi đã lấy page để tránh thiếu item/sai total.
- Giữ các filter request như category, brand, stock, specs, discount/deal, featured và search riêng theo endpoint; tên/nhóm điều kiện rõ ràng, không trộn vào hàm tính translation readiness.
- Product detail kiểm tra publication và soft-delete trực tiếp; không gọi `getStorefrontVisibleProductIds`/query đủ 8 locale cho từng request detail.
- Dùng translation overlay/fallback để render ngôn ngữ yêu cầu; không thay đổi cache/provider hay gọi Cloudflare trong request path.

#### Giai đoạn 3 — Tối ưu query và index

- Ưu tiên một Mongo query lọc publication + `isDeleted` + điều kiện home/section trước sort, pagination và count; tránh `$lookup` translation cache hoặc quét toàn bộ locales trên mỗi request.
- Kiểm tra index hiện có (`featured`, `isDeleted`, category, stock) và query shape thực tế; chỉ thêm/đổi compound index sau khi dùng `explain('executionStats')` trên dataset đại diện. Index candidate phụ thuộc filter phổ biến, ví dụ publication + deleted + category + featured; không tạo index cho mọi tổ hợp tùy chọn.
- Ảnh/description non-empty có thể vẫn là residual filter nếu index không chọn lọc; đo `docsExamined`, `keysExamined`, latency, count/pagination trước và sau. Không thêm cờ materialized `homeEligible` trừ khi profiling chứng minh query này là bottleneck; nếu thêm thì phải cập nhật nguyên tử khi image/description/publication thay đổi.
- Bỏ index cũ phụ thuộc translation readiness chỉ sau khi xác nhận không còn query production dùng nó; migration index là bước riêng có kế hoạch và xác minh.

#### Giai đoạn 4 — Test và rollout có giới hạn

- Unit tests: translation pending không đổi publication; translationReady tính đúng mà không sửa publication; home loại thiếu ảnh/description; source description rỗng không đạt home theo policy đã chốt; translation overlay fallback vẫn hoạt động.
- API tests: catalog/detail/brand/top-rated chỉ dùng publication gate; homepage query áp đủ điều kiện trước pagination/count và giữ featured/deal/stock/spec/category; deleted/unpublished không public.
- Kiểm tra regression trên product create/import/update: field publication mặc định đúng theo quyết định, thay đổi nguồn cập nhật translation readiness nhưng không tự publish/unpublish; ảnh thiếu dùng fallback ở nơi cho phép.
- Rollout: chạy test mục tiêu; audit counts chỉ đọc trên database đã xác nhận; deploy code; chạy migration riêng nếu được duyệt; so sánh API totals, candidate counts, p95 latency và `explain` trước/sau. Rollback bằng cách khôi phục query/index theo release trước, không sửa hàng loạt translation quality.
- Không chạy Cloudflare, retranslate, backfill production hoặc `npm run build` trong bước lập kế hoạch.

#### Tiêu chí chấp nhận

- Translation readiness không còn quyết định public availability.
- Publication, translation readiness và homepage eligibility được report/kiểm thử riêng.
- Không có truy vấn translation-cache nhiều locale trên request catalog/home/detail.
- Pagination/count chính xác với homepage eligibility; existing merchandising filters giữ nguyên.
- Latency/query execution không tăng đáng kể trên dataset đại diện; index chỉ thay sau đo đạc.
- Quy tắc missing image, publication default và migration được xác nhận trước khi thay đổi dữ liệu.

### Quyết định chờ người dùng trước triển khai

- Product publication dùng một trạng thái hiện có nào hay cần workflow approval riêng? Nếu trạng thái hiện tại là `isDeleted: false`, xác nhận rõ đây là quyết định business (không phải giả định kỹ thuật).
- Có cho phép tạo/import sản phẩm thiếu ảnh chính không? Nếu có, chấp nhận placeholder trên catalog/detail và loại sản phẩm đó khỏi home?
- Xác nhận home bắt buộc có ảnh chính và source description; giữ featured/deal/stock/spec/category filters như hiện tại?
- Có đồng ý đổi tên dữ liệu/khái niệm `storefrontReady` thành `translationReady` và lập migration riêng sau audit không?

Chưa sửa code/schema/database hoặc gọi provider khi ghi nhận issue này.
