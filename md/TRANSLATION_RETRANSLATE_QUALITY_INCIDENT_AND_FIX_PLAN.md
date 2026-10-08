# Sự cố chất lượng retranslate và kế hoạch khắc phục

## Tóm tắt

Chuyển provider sang Cloudflare AI không tự đảm bảo bản dịch đạt chuẩn. Các log cho thấy request Cloudflare trả kết quả, nhưng validator vẫn từ chối phần lớn bản dịch; lượt chạy sau tiếp tục bị HTTP 429 và dừng. Chạy lại bằng cùng model/prompt không phải cách xử lý gốc và có nguy cơ ghi thêm kết quả không đạt vào catalog.

**Trạng thái tài liệu:** đã triển khai một phần các bảo vệ trong code cho checkpoint, accounting/report và technical token. Chưa chạy migration, chưa truy cập/cập nhật database, chưa chạy retranslate hoặc canary. Luồng candidate-before-commit và kiểm thử đầy đủ vẫn còn tiếp tục.

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

**Trạng thái: chỉ là kế hoạch; chưa xuất dữ liệu, dịch, gọi provider hay cập nhật MongoDB.**

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
