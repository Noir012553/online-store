# Nhật ký vấn đề dịch sản phẩm và UI quản trị — 2026-10-21

Tài liệu này tổng hợp các vấn đề dịch sản phẩm, retry, approval và giao diện quản trị được xử lý trong phiên. Trạng thái DB/log được nêu là snapshot tại thời điểm kiểm tra, không phải dữ liệu live. Quy trình chuẩn nằm ở [TRANSLATION_RETRANSLATE_QUALITY_INCIDENT_AND_FIX_PLAN.md](TRANSLATION_RETRANSLATE_QUALITY_INCIDENT_AND_FIX_PLAN.md); nhật ký chung ở [SESSION_ISSUES_RESOLVED.md](SESSION_ISSUES_RESOLVED.md).

## Tóm tắt tiến độ

- Sửa luồng retry để lỗi riêng từng job không dừng cả backlog; lỗi quota/rate limit vẫn dừng an toàn. `--skip-scrape`, tái sử dụng bản dịch hợp lệ và quy tắc shutdown chỉ sau khi backlog sạch đã được xác định trong backlog storefront.
- Sửa lỗi `getCanonicalSpecKey is not defined` bằng cách bổ sung import còn thiếu.
- Cải thiện retry chất lượng cho technical token, mixed-language, truncation và commentary; validator tiếp tục là điều kiện commit.
- Sửa UI duyệt assistant draft: chỉ rõ điều kiện xác nhận `inconsistent` và ghi chú tối thiểu 10 ký tự; cập nhật local status/toast ngay sau khi endpoint approve thành công.
- Nút “Dịch lại” trước đây chỉ gửi locale đang chọn; hiện chạy tuần tự cả 8 locale đích (`en, pt, fr, de, it, es, nl, sv`), không bao gồm tiếng Việt nguồn. Kết quả từng locale vẫn phụ thuộc selector và validator; lỗi dừng các locale kế tiếp, không xóa kết quả đã hoàn tất.
- Alt ảnh mô tả được xác nhận là `descriptionImages[].alt` và là optional. `null`, số `0` và chuỗi `"0"` không được dịch; hàng/nhóm alt không có nội dung không hiện trong form. Giá trị này không được làm thay đổi translation readiness.
- Không chạy `npm run build`. Không chạy thao tác tái dịch đa ngôn ngữ sau thay đổi UI; không ghi dữ liệu sản phẩm trong bước cập nhật code gần nhất.

## 1. Backlog và lỗi retry

### Lỗi và thay đổi

- `getCanonicalSpecKey is not defined` làm job đầu tiên dừng do service thiếu import. Đã thêm import helper từ `specKeyTranslationService` và có test liên quan.
- Trước đó lỗi của một job có thể làm dừng toàn bộ storefront backlog. Script hiện ghi nhận lỗi job thường và tiếp tục; quota/rate limit vẫn dừng batch để tránh gọi provider lặp không an toàn.
- Đã giữ hành vi skip scrape theo lựa chọn chạy, tái sử dụng field translation hợp lệ trong `seed`/`reseed`/`retranslate`, và chỉ shutdown khi backlog thật sự hoàn tất, không còn failed/review/blocked job.
- Candidate checkpoint có lỗi token kỹ thuật, mixed-language, truncation hoặc commentary được đưa vào retry có hướng dẫn. Casing token nguồn được giữ nguyên. Candidate chỉ được commit khi validator đạt; retry không đồng nghĩa auto-approve.
- Lỗi Cloudflare HTTP 429/quota vẫn là giới hạn provider, không phải lỗi UI approval. Không có quota Neurons live được xác nhận trong phiên.

### Snapshot batch đã báo trước đó

Log batch người dùng cung cấp ghi nhận job ở khoảng `1251/4603`, HTTP 429, `remainingJobs: 4366`, `failedJobCount: 1`, `needsReviewCount: 1013`, `readyForStorefront: 7`, `notReady: 597`. Các bộ đếm này là snapshot của report; nếu hiểu cùng một tập job thì số processed/remaining không tự khớp số tổng, vì vậy cần đối chiếu cách report tính `remainingJobs` trước khi dùng để kết luận backlog hiện tại.

## 2. Draft assistant, approval và toast

- Tách rõ `status: success` từ provider với `qualityStatus: approved`. Lưu manual edit không tự duyệt; assistant batch import vẫn là draft `pending` cho tới khi thao tác approval đạt điều kiện backend.
- Với lỗi chỉ gồm `inconsistent`, dialog yêu cầu tick xác nhận và review note từ 10 ký tự trở lên. Trước đó người dùng đã nhập note ngắn hơn mức tối thiểu nên handler không gửi request và không có toast; UI đã thêm hướng dẫn ngay trong dialog.
- Trước đây handler chờ status refresh xong mới hiện toast. Đã chuyển để cập nhật local status và báo thành công ngay sau response approval, còn refresh chạy nền.
- **Chuột không dây Razer Viper V3 Pro SE / English:** đối chiếu bản approved cũ cho thấy 5 field không khớp (`name`, `description`, `technicalDescription`, `specs.connection`, `specs.maxDPI`). Các giá trị được đồng bộ theo canonical approved, validator sạch; bản dịch được giữ `pending` cho đến khi người dùng duyệt qua UI. Lần kiểm tra DB sau đó xác nhận `approved`, không có validation errors và có approval audit. Không nhầm sản phẩm này với Razer Viper V3 Pro Counter-Strike 2 Edition bên dưới.

## 3. Sản phẩm Razer Viper V3 Pro Counter-Strike 2 Edition

- Người dùng bấm “Dịch lại” hai lần nhưng bản English vẫn `needs_retranslate`.
- Snapshot DB chỉ đọc cho thấy catalog translation có `validationErrors: [source_content_changed]`, source hash cũ và bản cache `description` chưa có giá trị. Đây là trạng thái từ lần kiểm tra, không được xem là trạng thái live hiện tại.
- Checkpoint của mô tả có lỗi `missing_technical_token` cho token `CS2` và `mixed_language` do còn cụm “sensor thế”. Candidate không đạt nên service giữ bản catalog cũ; đây là chặn chất lượng chủ ý, không phải nút approve bị lỗi.
- Retry trước đó chỉ nhắc chung dịch phần còn mixed-language. Prompt hiện bổ sung token/cụm cụ thể mà validator nhận diện. Có regression test cho hướng dẫn phrase cụ thể.
- Sau sửa prompt, không gọi Cloudflare và không ghi DB để tránh chạy thay người dùng hoặc phát sinh provider calls. Sản phẩm cần một lượt retranslate thật để xác nhận kết quả; nếu vẫn fail, status phải tiếp tục báo lỗi và cần xem validation details mới.

## 4. Alt ảnh mô tả null/0

- Khu vực “Ảnh mô tả” trong editor là field alt của từng ảnh, không phải nội dung mô tả sản phẩm hoặc chú thích dưới ảnh.
- `null`, số `0` và chuỗi `"0"` được xem như không có alt: service bỏ qua translation/validation của các giá trị này, hash sản phẩm canonical hóa 0 về null, import so sánh theo canonical source, và UI chỉ hiện mục khi có alt thực chất.
- Lỗi validation của alt vốn là optional warning và không được chặn quality status; các test bổ sung xác nhận alt null/0 không tạo provider request hoặc làm invalidation, trong khi alt thật vẫn được validate như warning.
- Không xóa các ảnh khỏi sản phẩm; chỉ ẩn phần nhập/dịch alt khi giá trị alt nguồn không có nội dung.

## 5. Tái dịch toàn bộ ngôn ngữ

- Trước cập nhật, `handleRetranslate` chỉ gọi endpoint một lần với `selectedLanguage`; vì vậy một lần bấm chỉ xử lý locale đang chọn.
- Hiện frontend lần lượt gọi endpoint hiện có cho từng locale đích, không chạy song song để tránh đụng distributed lock và tạo áp lực rate limit. Dialog thông báo số ngôn ngữ đích.
- Nếu một locale lỗi/timeout/quota, luồng dừng, giữ các kết quả locale đã hoàn thành và báo locale lỗi; các locale phía sau lượt đó chưa được xử lý.
- Locale chỉ được chuyển sang status `approved` khi retranslation service trả kết quả qua validator. Đây là auto-accept theo validator của Cloudflare pipeline, không phải human review. Assistant draft không được biến thành Cloudflare translation; selector có thể bỏ qua record không đủ điều kiện.
- Frontend typecheck, locale JSON validation và dev compilation đã pass. Chưa chạy tương tác browser end-to-end hoặc lượt dịch thật cho cả 8 locale.

## 6. Các chỉnh sửa UI khác trong phạm vi phiên

- Bỏ nhãn `[Laptop]` không cần thiết khỏi promo ở Quick View và product detail.
- Hiển thị nội dung mô tả theo bullet.
- Đổi nhãn “Ảnh trong mô tả” thành “Ảnh mô tả”.
- Giữ nút “Dịch lại” thay vì đổi text thành “Đang dịch lại...” trong lúc xử lý; `aria-busy` vẫn biểu thị trạng thái bận.

## Kiểm tra và giới hạn

- Frontend `npm run typecheck --prefix online-store-frontend`: pass.
- Regression tests mục tiêu cho mixed-language retry, null/0 alt và import invalidation: pass.
- JSON locale và fallback parse hợp lệ; dev server compiled thành công.
- Không chạy `npm run build`.
- Không xác nhận lại readiness tổng catalog sau các thay đổi. Mọi số ready/not-ready ở trên là snapshot; cần chạy report trên database đích đã xác minh để có số hiện hành.

## Chọn ngôn ngữ khi bấm “Dịch lại”

**Trạng thái: đã triển khai UI, chưa chạy dịch thật.** Không gọi AI và không ghi MongoDB trong phiên triển khai.

### Vấn đề được báo cáo

- Admin báo rằng trên trang `/admin/translationsDynamic`, bấm “Dịch lại” hiện chỉ dịch một ngôn ngữ mỗi lần. Lặp thao tác theo từng locale làm tăng thời gian xử lý thủ công.
- Dịch cả 8 locale không phải lựa chọn phù hợp cho mọi lần chạy vì có thể phát sinh nhiều lời gọi AI và tiêu thụ token ngoài nhu cầu.
- Trước cập nhật UI, `online-store-frontend/src/pages/admin/translationsDynamic.tsx` tạo danh sách locale đích và gửi request tuần tự cho cả danh sách (mỗi request có một `lang`). Cách này không cho admin chọn giữa tiết kiệm token và xử lý nhiều locale trong một lượt.
- Báo cáo giao diện chỉ dịch một ngôn ngữ chưa khớp với source đã kiểm tra; chưa tái hiện được nguyên nhân trên browser. Vì vậy, thay đổi này tập trung thêm lựa chọn locale, không khẳng định đã sửa được nguyên nhân chênh lệch ban đầu.

### Thiết kế đã áp dụng

1. Trong hộp thoại xác nhận, cho phép admin chọn một hoặc nhiều locale đích; mặc định chọn locale đang được chọn trong trang để hạn chế chi phí bất ngờ và giữ thao tác nhanh cho nhu cầu phổ biến.
2. Có thao tác chọn tất cả 8 locale khi admin chủ động cần chạy toàn bộ. Hiển thị rõ tên và số locale sẽ chạy trước khi xác nhận.
3. Chỉ gửi request cho locale đã chọn, chạy tuần tự qua endpoint hiện có; không thêm concurrency song song hoặc mở rộng sang toàn catalog.
4. Giữ nguyên quy tắc bảo vệ field chỉnh sửa thủ công và chỉ công nhận kết quả theo validator hiện tại. Tổng kết trạng thái/lỗi theo từng locale; lỗi một locale không được che mất kết quả các locale khác.
5. Khi nghiệm thu thủ công, đối chiếu network requests với locale đã chọn; source ban đầu và hành vi được báo cáo trên preview chưa khớp nhau.

### Kiểm tra chấp nhận

- Mặc định chỉ chạy locale hiện hành; xác nhận chỉ có đúng một request cho locale đó.
- Chọn một số locale chạy đúng tập locale đã chọn, không gọi locale ngoài danh sách.
- Chọn tất cả chạy đủ 8 locale tuần tự; UI báo rõ số lượng, kết quả từng locale và lỗi/timeout nếu có.
- Trạng thái busy ngăn gửi trùng lượt; sau hoàn tất, status được làm mới mà không đổi nội dung field thủ công.
- UI đã được triển khai trong `online-store-frontend/src/pages/admin/translationsDynamic.tsx`: hộp thoại mặc định chọn locale đang xem, cho phép chọn nhiều locale hoặc chọn/bỏ chọn tất cả; handler chỉ gửi request cho lựa chọn hiện tại và xử lý tuần tự.
- Thêm nhãn tiếng Việt/Anh trong `online-store-frontend/src/locales/uiFallbacks.json`; nút chạy bị vô hiệu hóa khi không chọn locale nào.
- Typecheck frontend, parse JSON locale và `git diff --check` đạt; dev server compile thành công và preview được mở tại `/admin/translationsDynamic`.
- Chưa thực hiện tương tác browser end-to-end hoặc xác minh network requests theo từng lựa chọn; chưa gọi provider thật. Cần kiểm tra thủ công các lựa chọn một locale, nhiều locale, tất cả và tình huống lỗi trước khi xác nhận đầy đủ hành vi.
- Không đổi API/backend, không chạy lượt dịch, không cập nhật dữ liệu sản phẩm và không chạy `npm run build` trong phiên này.
