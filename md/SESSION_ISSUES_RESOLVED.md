# Tổng kết các vấn đề đã xử lý

Tài liệu này tổng hợp những thay đổi đã áp dụng và các vấn đề đã được chẩn đoán trong quá trình làm việc trên Laptop Store. Những mục chỉ mới được phân tích sẽ được ghi rõ, không xem là đã khắc phục hoàn toàn.

## Thay đổi đã áp dụng

### Logo và favicon

- Cắt bỏ phần lề trắng thừa của logo, tạo asset `online-store-frontend/public/assets/branding/logo-cropped.png` để logo hiển thị lớn và rõ hơn.
- Cập nhật logo ở header, footer và trang đăng nhập sang asset đã cắt; giữ cách co giãn theo kích thước màn hình.
- Thay favicon của website bằng logo Laptop Store. Favicon của website khác biểu tượng trong giao diện Builder Visual Editor.

### Responsive trang About

- Điều chỉnh hero của trang About từ chiều cao cố định theo viewport sang chiều cao tối thiểu có padding, phù hợp hơn với nội dung và màn hình khác nhau.

### Chuẩn hóa một số Tailwind utility

- Thay các giá trị tùy ý bằng utility chuẩn khi có giá trị tương đương, ví dụ `min-w-[900px]` thành `min-w-225`.
- Giữ lại các biểu thức `calc()`, selector hoặc giá trị đặc thù khi không có utility chuẩn tương đương.
- Typecheck frontend đã chạy thành công ở lần kiểm tra trước. Không chạy `npm run build`.

### Hoàn tác thay đổi ngoài ý muốn ở hero trang chủ

- Chiều cao hero trang chủ từng bị thay đổi do hiểu nhầm nhận xét “dài quá” là nói về giao diện.
- Thay đổi đó đã được hoàn tác; class ban đầu tại `online-store-frontend/src/components/HomeContent.tsx` được kiểm tra lại.

## Vấn đề backend và vận hành đã được chẩn đoán

### Cloudflare Workers AI và bản dịch

- Xác định HTTP `429` là giới hạn từ Workers AI tại thời điểm gọi; token còn hoạt động và có quyền đọc danh sách model không chứng minh quota Neurons còn lại.
- Kiểm tra 13 cấu hình: cả 13 token đều hoạt động và đọc được danh sách model; có 12 Account ID khác nhau vì slot 10 và 11 dùng cùng một account.
- Endpoint đã kiểm tra không cung cấp số Neurons còn lại. Cần xem usage/quota trong Cloudflare Dashboard; không có quota chính xác nào được xác nhận qua lệnh kiểm tra token.
- Log có nhiều lỗi rate limit và có cả lỗi phản hồi AI không hợp lệ (`CLOUDFLARE_RESPONSE_INVALID`, thiếu `result.response`); không phải mọi lỗi đều là 429.
- Các bản dịch hết retry được ghi nhận là `failed_rate_limit` hoặc `failed_error`, không tự động được chạy lại ngay. Có luồng retry riêng.
- Con số khoảng 4.367/4.704 bản ghi cần chú ý là trạng thái được báo trong log, không tự nó chứng minh có bản ghi trùng hoặc xác nhận số sản phẩm duy nhất còn thiếu.
- Ước tính 0,5–1 triệu Neurons cho khoảng 600 sản phẩm chỉ là khoảng dự trù sơ bộ cho phần dịch sản phẩm. Với 8 ngôn ngữ đích, có khoảng 4.800 cặp sản phẩm-ngôn ngữ trước khi tính độ dài và số trường. Đây không phải số đo quota thực tế và chưa bao gồm review, category hay nội dung khác.

### Đối soát bản dịch và kiểm tra định dạng phản hồi (2026-10-11)

- Người dùng chạy `translation:revalidate-source-changed -- --apply --all` trên production. Kết quả cuối: đã đọc 50.166 bản dịch; 38.885 bản khớp nguồn và đạt validator được cập nhật; phần còn lại không tự duyệt. Lệnh này không gọi Cloudflare AI.
- Storefront report sau đó ghi nhận 588 sản phẩm active, chỉ 2 ready và 586 not ready. Các lý do là thiếu mô tả (3.753 slot), thiếu specs (2.310 slot), quality chưa approved/validation errors (4.189 slot mỗi nhóm; các nhóm có thể chồng nhau). Sản phẩm phải đạt yêu cầu trên cả 8 locale `en, pt, fr, de, it, es, nl, sv`.
- Audit chỉ đọc ghi nhận 106.408 LiveTranslationCache: 59.685 `needs_retranslate`, 43.129 `approved`, 3.575 `pending`, 19 `retranslated`; có 59.592 lỗi `source_content_changed` và 2.872 lỗi `translation_failed`. Catalog cache có 4.189 `pending`, 515 `approved`. Audit không sửa dữ liệu.
- Dry-run `retranslate -- --dry-run --filter=translation_failed --limit=100` tìm thấy 662 nhóm sản phẩm-ngôn ngữ, gom từ 2.860 bản ghi field cache. Theo locale: `en` 92 nhóm/541 field; `pt` 91/530; `fr` 89/518; `de` 92/549; `it` 86/222; `es` 72/155; `nl` 72/181; `sv` 68/164. Dry-run không gọi AI và không ghi DB.
- Người dùng kiểm tra Cloudflare trực tiếp bằng PowerShell inline, không tạo file `.ps1`. Lệnh dùng Node `dotenv` để đọc `.env` trong backend, gửi một yêu cầu thử với nội dung `100` tới cấu hình đầu tiên, rồi chỉ in metadata, không in token hoặc nội dung trả về. Đây là một yêu cầu AI thật, độc lập với DB và lệnh retranslate.
- Kết quả PowerShell: HTTP 200, `success: true`; `result.response` là `Int32`, nhưng `result.choices[0].message.content` là chuỗi dài 3 ký tự. Như vậy API có trả văn bản, nhưng khác cấu trúc mà parser cũ của ứng dụng mong đợi.
- Lượt retranslate thử `--filter=translation_failed --lang=en --limit=1` trước khi cập nhật parser đã thất bại: 0 bản dịch được sửa, 1 tác vụ lỗi `CLOUDFLARE_RESPONSE_INVALID` sau các lần thử lại. Không tiếp tục chạy backlog bằng phiên bản parser cũ.
- Đã cập nhật `online-store-backend/src/services/cloudflareAiService.js` để ưu tiên `result.response` khi đó là chuỗi không rỗng, nếu không thì đọc `result.choices[].message.content` dạng chuỗi. Thêm kiểm tra hồi quy vào `online-store-backend/src/test/cloudflare-ai-service.test.js` cho trường hợp `response` là số nhưng `choices` chứa văn bản.
- `node --check` cho service và test, cùng `git diff --check`, đã đạt. Chưa chạy được test runtime trong môi trường trợ lý vì thiếu package `axios`; không gọi Cloudflare thật trong bước kiểm tra code.
- Bước tiếp theo: lấy code mới về bản local rồi thử lại đúng một nhóm tiếng Anh bằng `npm run retranslate -- --filter=translation_failed --lang=en --limit=1`. Chỉ tăng phạm vi nếu lượt thử thành công và được kiểm tra; không chạy cả 662 nhóm ngay.

### Giới hạn upload R2

- Phân biệt được giới hạn do cấu hình ứng dụng (`R2_MAX_UPLOAD_COUNT`, `R2_MAX_UPLOAD_BYTES`) với usage/quota hiển thị trong Cloudflare Dashboard.
- Giá trị được người dùng cung cấp là 5.000 lượt upload và 8 GiB; không có bằng chứng trong phiên rằng giới hạn đã được tăng hoặc các logo thương hiệu đã được upload lên R2.

### Seeder, crawler và bảo vệ dữ liệu

- Xác định `npm run seed` chạy chế độ đầy đủ, nhưng product pipeline chỉ bỏ qua crawler khi có điều kiện phù hợp như `--skip-scrape`, dữ liệu đầu vào chỉ định hoặc file sản phẩm hiện có hợp lệ; có thể gọi crawler khi không tìm được file phù hợp.
- Lượt chạy được xem trong log đã thực sự bắt đầu `scrape:all`. Để chạy seed mà không scrape lại, đã xác định tùy chọn `npm run seed -- --skip-scrape`.
- Product import dùng kiểu upsert nên không đồng nghĩa với xóa toàn bộ sản phẩm. Tuy nhiên, review seeder có gọi `Review.deleteMany({})` trước khi tạo lại review.
- Kiểm tra `npm run clear` cho thấy lệnh này xóa dữ liệu các collection MongoDB, index, tài nguyên R2 của dự án và file upload cục bộ. Đã khuyến nghị không chạy lệnh này để xử lý lỗi dịch hoặc rate limit.
- `npm run seed -- --only-module=__product-pipeline__ --skip-scrape --skip-translate --file="..."` chỉ chạy product pipeline trên đúng file chỉ định. File `Razer_Headphone.json` có 13 sản phẩm nên output `updated: 13`, `inserted: 0` là hoàn tất đúng phạm vi, không phải seed bị treo. `inserted: 0` cho biết các sản phẩm đã tồn tại và được upsert.
- Muốn import tất cả file hiện có trong `data/scraped-products/current` mà không cào/dịch, bỏ `--file=...` nhưng giữ `--only-module=__product-pipeline__ --skip-scrape --skip-translate`. Bỏ thêm `--only-module` sẽ chạy các seed module khác, không chỉ sản phẩm; cần xác nhận `MONGO_URI` trước khi chạy.
- Lỗi HTTP 404 ở ảnh mô tả Razer là URL nguồn đã mất. Pipeline bỏ từng ảnh mô tả lỗi nhưng vẫn import sản phẩm nếu ảnh chính/gallery hợp lệ; không tự suy đoán URL thay thế. Nếu ảnh chính/gallery không chuẩn bị được, sản phẩm vẫn có thể bị từ chối.
- Dòng `Storefront readiness: 4 ready, 584 not ready` là kết quả refresh trên 588 sản phẩm trong database, không phải số sản phẩm của riêng file Razer. `--skip-translate` không dịch hoặc duyệt bản dịch; các file locale được load là dữ liệu giao diện, không phải bản dịch sản phẩm.
- HTTP 530 / Cloudflare 1033 khi gọi Categories/API storefront là lỗi kết nối upstream backend, khác với lỗi category slug và lỗi ảnh mô tả. Frontend đã đổi trạng thái category để không báo nhầm “không tìm thấy danh mục” khi API lỗi, đồng thời có nút thử lại; danh sách sản phẩm vẫn cần API backend hoạt động.

### Thiết lập môi trường và phạm vi quyền thao tác

- Backend local nạp cấu hình từ `.env`; seed log xác nhận biến môi trường đã được nạp. Frontend có thể cần `NEXT_PUBLIC_API_BASE_URL` để trỏ API tới backend đang chạy thay vì URL mặc định.
- Trước lệnh đọc/ghi MongoDB, xác nhận `MONGO_URI` trỏ đúng database local/dev. Không chép URI, password, token, API key hoặc giá trị của biến môi trường vào Markdown, log chia sẻ hay lệnh minh họa; chỉ ghi tên biến hoặc dùng placeholder.
- Người dùng đã cho phép dùng cấu hình môi trường, MongoDB, terminal và PowerShell cho các bước kiểm tra/sửa dữ liệu trong phạm vi công việc này. Do dữ liệu và `.env` nằm trên máy Windows local, một số thao tác không truy cập được từ môi trường assistant; khi đó người dùng chạy lệnh PowerShell cục bộ và gửi lại output.
- Quyền này không bao gồm xóa database, chạy `npm run clear`, thay đổi dữ liệu rộng ngoài mục tiêu, hoặc vượt qua giới hạn ACL. Xác nhận riêng trước thao tác phá hủy hoặc có phạm vi lớn; quyền truy cập thực tế phụ thuộc ACL của môi trường.

### Cloudflared tunnel

- Chẩn đoán `spawn UNKNOWN` là do `cloudflared.exe` trong thư mục làm việc thực chất là Git LFS pointer dạng văn bản, không phải file thực thi.
- Người dùng đã tải binary Windows chính thức thay thế. Chưa có kết quả `--version` hoặc xác nhận `npm run tunnel` chạy thành công, nên chưa ghi nhận tunnel đã được khắc phục hoàn toàn.

### Sửa dữ liệu mô tả sản phẩm scrape

- Không coi JSON scrape, document Product trong MongoDB, ProductCatalogTranslationCache và LiveTranslationCache là cùng một bản dữ liệu. Trước khi sửa, cần đối chiếu đúng sản phẩm bằng cả `sku` và `sourceProductId`, rồi đọc riêng `description`, `technicalDescription`, `specs` và bản dịch.
- Schema lưu specs có thể dùng key chuẩn hóa như `connection`, trong khi dữ liệu crawler dùng nhãn tiếng Việt như `Phương thức kết nối`; không giả định key/value giữa hai nguồn giống nhau. `description` và `technicalDescription` cũng là hai trường riêng.
- Product pipeline có thể loại sản phẩm trước upsert nếu thiếu ảnh main/gallery đã chuẩn bị, kể cả khi mục tiêu chỉ là sửa văn bản. Không bỏ qua validation ảnh hoặc chạy seed toàn bộ để ép cập nhật một bản ghi; dùng cập nhật đúng một document sau preview và giữ nguyên các field ảnh.
- Dry-run có thể kết thúc exit code 0 dù `read: 0`, `invalid: 1` hoặc `ready to import: 0`. Luôn đọc số lượng và lỗi validation trong log; không xem thông báo hoàn tất chung là bằng chứng đã import.
- Khi dùng PowerShell, kiểm tra shape ngay sau `ConvertFrom-Json`. Root JSON dạng array, property access trên array có thể trả các property từ nhiều item; khi tạo JSON tạm một sản phẩm, xác minh lại array/count và SKU trước khi đưa vào importer.
- Khi pipe JavaScript chứa tiếng Việt từ Windows PowerShell sang `node -`, code page có thể làm hỏng ký tự. Dùng escape Unicode cho literal trong script hoặc giữ nội dung UTF-8 trong file; không nới guard dữ liệu chỉ để vượt lỗi encoding.
- Sửa nguồn sản phẩm phải đồng bộ trạng thái bản dịch: đánh dấu machine-managed translations `needs_retranslate`, giữ các field dịch thủ công, và đặt storefront readiness về chưa xác nhận. Không tự đánh dấu bản dịch mới là approved.
- Trong sự cố BlackShark V2 X, seed preview bị chặn bởi lỗi asset nên không ghi Product. Người dùng sau đó chạy local transaction có preview/đối chiếu SKU, cập nhật đúng document và nhận output báo hoàn tất; phiên này không xác nhận lại document bằng một lượt đọc độc lập sau transaction. Không ghi giá trị bí mật hoặc URI vào báo cáo.

## Những việc chưa hoàn tất hoặc chưa xác nhận

- Chưa xác nhận quota Neurons còn lại của các tài khoản Cloudflare; trạng thái token/API không thay thế được kiểm tra usage.
- Chưa xác nhận kết quả cuối cùng của lượt seed thứ ba hoặc số bản dịch được hoàn tất sau lượt đó.
- Chưa khôi phục hoặc xác minh upstream backend trả API Categories/products thành công sau lỗi Cloudflare 530/1033; vì vậy chưa xác nhận lại sản phẩm trên `/products/headphones` sau seed.
- Storefront readiness tại báo cáo mới nhất sau revalidation là 2/588 sản phẩm ready; 586 sản phẩm chưa đạt yêu cầu. Revalidation không giải quyết nội dung thiếu hoặc các bản dịch cần dịch lại. Chưa chạy retranslate hàng loạt; cần xác nhận parser Cloudflare mới bằng một nhóm nhỏ trước khi quyết định tiếp tục.
- Các URL ảnh mô tả Razer trả 404 vẫn cần được thay bằng file/URL nguồn còn tồn tại nếu muốn hiển thị lại các ảnh đó.
- Chưa xác nhận tunnel hoạt động sau khi tải binary cloudflared.
- Chưa thực hiện upload logo thương hiệu lên R2 hoặc cập nhật dữ liệu thương hiệu.
- Chưa xác nhận giới hạn `R2_MAX_UPLOAD_COUNT` đã được thay đổi.
- Chưa có ảnh chụp xác nhận trực quan cuối cùng cho các thay đổi responsive.

## Phạm vi an toàn

- Không ghi token, API key hoặc giá trị bí mật vào tài liệu này.
- Không chạy `npm run clear`.
- Không chạy `npm run build`.
- Các nhận định về quota và số lượng bản dịch được giữ ở mức phù hợp với log đã xem; không coi số liệu ước tính là kết quả đo.
