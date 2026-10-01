# Ghi nhận sự cố retranslate và storefront

## Mục đích và phạm vi

Tài liệu này ghi lại các vấn đề đã được quan sát khi cài dependency, chạy `retranslate`, kiểm tra Redis/Cloudflare và đối chiếu điều kiện hiển thị storefront. Các số liệu là kết quả lịch sử tại thời điểm người dùng chạy lệnh trên máy Windows.

Không ghi giá trị `.env`, API key, token, MongoDB URI, mật khẩu hoặc nội dung secret vào tài liệu này.

## Tóm tắt hiện trạng

- Backend `.env` được tạo từ `.env.example` trên máy Windows.
- Redis không lắng nghe trên `localhost:6379`; sau đó `PRODUCT_SEED_LOCK_MODE=memory` được xác nhận. Chế độ này phù hợp cho một tiến trình local, không dùng cho production hoặc nhiều tiến trình song song.
- Provider LibreTranslate cũ từng timeout/`ECONNREFUSED` và cho chất lượng không đủ; đã gỡ client, CLI và thư mục tool khỏi luồng hiện tại.
- Probe gửi một request ngắn cho mỗi 9 cấu hình Cloudflare; cả 9 đều trả `HTTP 429`, không có `Retry-After`. Cloudflare chưa sẵn sàng chạy lại batch tại thời điểm probe.
- Storefront chỉ có 3/618 sản phẩm sẵn sàng theo cờ hiện lưu và phép tính readiness chạy lại.
- Chưa xác định được một sản phẩm cụ thể nào mất bản dịch; cần kiểm tra catalog theo một mã sản phẩm và ngôn ngữ mục tiêu sau khi provider hoạt động.

## 1. Cài package và audit

### Cảnh báo ghi nhận

- `node-domexception@1.0.0` bị cảnh báo deprecated theo chuỗi dependency gián tiếp `google-auth-library -> gaxios -> node-fetch -> fetch-blob`.
- `@scarf/scarf@1.4.0` có postinstall telemetry bị npm chặn do chưa được duyệt. Đã giữ script bị chặn; không cần bật telemetry để backend chạy.
- `npm fund` chỉ là thông báo tài trợ.
- Audit ban đầu ghi nhận lỗ hổng moderate ở Nodemailer và Multer.

### Thay đổi dependency đã thực hiện

- `online-store-backend/package.json`: Multer `^2.4.0`, Nodemailer `^10.0.12`.
- `online-store-backend/package-lock.json` được cập nhật tương ứng.
- `npm audit` sau cập nhật: 0 vulnerabilities.
- Smoke test CommonJS cho Nodemailer/Multer thành công; 2 test upload boundary đạt.
- Chạy toàn bộ `import-file-validator.test.js` có 2 assertion mapping sản phẩm thất bại (`sourceUrl` dư trong mô tả ảnh và thiếu issue `sourceProductId`). Đây không phải lỗi do thay đổi package đã xác minh; cần xử lý riêng nếu muốn sửa.

Không chạy `npm audit fix --force` hoặc `npm update` lặp lại để xử lý cảnh báo deprecated: có thể gây thay đổi ngoài phạm vi và không loại được nguồn dependency hiện tại. Không override `node-domexception` một cách cưỡng ép nếu chưa xác nhận tương thích.

## 2. `.env` và Redis

### `.env`

- Lần kiểm tra đầu tiên chạy từ `C:\Windows\system32`, nên không tìm thấy `.env`; báo cáo TXT lúc đó phản ánh trạng thái cũ.
- Sau đó `.env` được sao chép từ `online-store-backend/.env.example`; `Test-Path` trả `True`.
- `REDIS_PASSWORD` có thể để trống nếu Redis không bật xác thực. Không đặt secret thật trong `.env.example` hoặc Git.

### Redis

- `Test-NetConnection localhost -Port 6379` trả `False`; Windows không liệt kê dịch vụ Redis/Memurai.
- `redis` trong `package.json` là client Node.js, không phải Redis server.
- `.env` ban đầu dùng `REDIS_URL=redis://localhost:6379`, `PRODUCT_SEED_LOCK_MODE=redis`; code thử kết nối và nhận `ECONNREFUSED`, rồi trong môi trường local dùng in-memory fallback.
- Sau đó biến mode được kiểm tra là `memory`. Với local một tiến trình, mode này bỏ qua Redis; không an toàn cho các tiến trình seed/retranslate chạy đồng thời. Production chặn mode `memory`.
- `REDIS_PASSWORD` rỗng không phải nguyên nhân của `ECONNREFUSED`; lỗi đó cho biết không có server lắng nghe tại host/cổng được cấu hình.

## 3. Khóa retranslate trong MongoDB

Khóa chạy retranslate là khóa riêng trong MongoDB, không phải Redis lock. Nó có lease 10 phút và được gia hạn khi tiến trình còn hoạt động.

- Có lần lệnh báo `Retranslate is already running for this database`, dù không thấy `node.exe` chứa `retranslate.js` trên máy.
- Lệnh Node kiểm tra khóa sau đó trả “không có” tại thời điểm truy vấn. Một lần chạy sau lại gặp thông báo khóa đang tồn tại.
- Khởi động lại máy không bảo đảm xóa khóa đang được một tiến trình khác gia hạn. Khác Mongo URI hoặc một tiến trình/máy khác dùng cùng database cũng có thể gây xung đột.
- Khi kiểm tra Node từ `C:\Windows\system32`, lệnh lỗi `Cannot find module 'dotenv'`; cần chạy từ thư mục backend để Node resolve đúng dependency và `.env`.
- Lần bị lock dừng trước khi dịch; cờ `--shutdown` không lên lịch tắt máy.

Không xóa document khóa bằng tay và không dùng `--reset-progress` để chữa lỗi khóa. Nếu lỗi lặp lại, kiểm tra tiến trình local và run lock ngay sau lỗi bằng cùng `.env`/Mongo URI, không gửi URI vào chat.

## 4. Provider đã gỡ

Các log LibreTranslate ở tài liệu này chỉ là lịch sử. Backend hiện không chứa client, CLI option, cấu hình hay fallback LibreTranslate; luồng dịch/retranslate chỉ dùng Cloudflare AI. Không dùng lệnh hoặc `.env` mẫu cũ của LibreTranslate.

Khi Cloudflare bị rate limit/quota, tác vụ được ghi nhận là chưa hoàn tất để retry sau; không đánh dấu thành công bằng kết quả từ provider khác.

## 5. Cloudflare rate limit

- Log cũ có cảnh báo rate-limit Cloudflare xen kẽ lỗi LibreTranslate; hành vi fallback đó đã bị gỡ.
- Probe từng cấu hình gửi tối đa một request nhỏ cho 9 cấu hình; cả 9 trả `RATE_LIMITED (HTTP 429)`, không có `Retry-After`.
- Kết quả chỉ xác nhận tình trạng tại lúc probe. Không biết giờ reset từ response đó; kiểm tra quota/usage trong dashboard Cloudflare. Nếu nhiều key cùng account, quota account có thể ảnh hưởng tất cả.
- Cooldown trong service Cloudflare là trạng thái trong bộ nhớ của tiến trình, còn quota/rate limit do Cloudflare trả về là trạng thái provider; restart app không khôi phục quota provider.
- Ngân sách nội bộ của service tính ngày UTC; điều đó không bảo đảm thời điểm reset quota Cloudflare cũng là nửa đêm UTC.

Không lặp probe 9 key hoặc chạy batch khi cả 9 còn 429; mỗi probe vẫn là request tới provider.

## 6. Ý nghĩa kết quả retranslate và checkpoint

Một lần gọi Cloudflare thành công không đồng nghĩa job sản phẩm hoàn tất hoặc được duyệt.

- Product retranslate gom các trường sản phẩm/ngôn ngữ, validate chúng và chỉ sau đó upsert `ProductCatalogTranslationCache`.
- Một số kết quả field có thể được checkpoint trước khi toàn bộ product translation được lưu; lỗi ở field/chunk khác có thể khiến catalog tổng hợp chưa được cập nhật.
- Catalog dùng `status: success` và `provider`; `qualityStatus` độc lập, ví dụ `approved`, `pending`, `needs_retranslate` hoặc `rejected`.
- `Fixed successfully` chỉ đếm job đạt approval và không còn validation errors. `Still has issues`, `Failed` và `Remaining` không phải các nhóm số luôn cộng được thành tổng job.
- Timeout/provider failure không tạo bản dịch hợp lệ cho field đó; checkpoint của các field đã thành công có thể được dùng khi tiếp tục.
- Checkpoint đã xử lý nhưng `fixed: false` không tự chạy lại trong lần sau. `--retry-unresolved` dùng để mở lại các mục chưa fixed; xem giới hạn CLI hiện hành trước khi kết hợp `--lang`, `--limit` hoặc `--dry-run`.
- `--shutdown` chỉ lên lịch `shutdown.exe /s /t 60` khi toàn bộ run báo success. Lỗi/remaining/issues đồng nghĩa không lên lịch tắt máy. Có thể hủy đếm ngược bằng `shutdown /a`.

Log batch đã ghi nhận `1` fixed, `2540` still issues, `3` failed, `3461` remaining trong lượt có `2478` jobs. Đây là snapshot của lần chạy đó; `Remaining` có thể bao gồm các mục checkpoint chưa fixed và mục chưa xử lý, không nên cộng các dòng thành tổng độc lập.

## 7. Điều kiện storefront và số liệu đã kiểm tra

Storefront không hiển thị chỉ vì một provider log “Translation success”. Readiness cần bản catalog:

- `status: success`;
- `qualityStatus: approved`;
- `sourceHash` khớp product hiện tại;
- đủ field bắt buộc, description/spec nguồn tương ứng;
- có bản hợp lệ cho cả 8 ngôn ngữ ngoài tiếng Việt trong inventory hiện hành.

Tiếng Việt có thể dùng nội dung nguồn, nên `vi: 0/0` bản catalog không nhất thiết là lỗi. Product listing lọc `storefrontReady: true`; product detail cũng kiểm tra readiness. Bản dịch `legacy` trong `LiveTranslationCache` không thay cho catalog trong phép tính readiness của storefront.

Kết quả PowerShell đọc MongoDB tại thời điểm kiểm tra:

- Products không xóa: `618`.
- `storefrontReady` lưu sẵn: `3`.
- Tính readiness lại bằng helper storefront: `3`.
- Catalog `approved/total` theo locale: `en 353/612`, `pt 138/612`, `fr 159/612`, `de 190/612`, `it 12/612`, `es 255/612`, `nl 210/612`, `sv 143/612`, `vi 0/0`.
- Số legacy product translation approved cao hơn nhiều (ví dụ `en 5022/7571`, `es 4437/5587`), nhưng các bản này không được dùng làm readiness catalog.

Số đếm locale là số bản ghi riêng rẽ, không phải cùng một tập sản phẩm; `sourceHash` và completeness còn phải khớp. Dữ liệu cho thấy chỉ 3 sản phẩm hiện qua gate, không phải vấn đề cờ readiness cũ (giá trị lưu và tính lại đều bằng 3).

Trang quản trị bản dịch và storefront khác nhau: admin có thể xem/chỉnh catalog theo locale; storefront áp readiness nghiêm hơn. Với trang admin, cần chọn đúng locale và bật Edit để xem field dịch.

## 8. Thư mục scraper `data` và `current`

Code không đổi tên `data` thành `current`. Output scraper mặc định là:

```text
data/scraped-products/current/<nhóm-sản-phẩm>/
```

`current` là thư mục output bên trong `data/scraped-products`; `SCRAPER_OUTPUT_DIR` có thể ghi đè vị trí này. Đường dẫn đó chứa dữ liệu scraper, không phải kho bản dịch MongoDB. `data/scraped-products/` bị Git ignore. Lệnh `Get-ChildItem ..` chạy từ backend liệt kê thư mục cha, không phải thư mục con của backend.

## 9. Các bước xử lý an toàn tiếp theo

1. Tạm dừng retranslate khi Cloudflare trả 429; kiểm tra quota tài khoản và đợi hạn mức phục hồi.
2. Khi sẵn sàng, thử một request nhỏ trên một cấu hình Cloudflare; không lặp probe tất cả keys khi provider vẫn rate limit.
3. Dùng checkpoint hiện tại; cân nhắc `--retry-unresolved` cho job đã xử lý nhưng chưa fixed. Không xóa checkpoint/lock bằng tay.
4. Chọn chính sách storefront rõ ràng: hoàn thiện đủ mọi locale trước khi mở sản phẩm, hoặc thay đổi thiết kế gate sang readiness theo locale và fallback tiếng Việt cho locale thiếu. Hai lựa chọn có trade-off khác nhau; chưa có thay đổi gate nào được thực hiện trong phiên.
5. Khi dùng `--shutdown`, lưu công việc đang mở và cắm nguồn; máy chỉ tắt sau khi run thành công hoàn toàn.

## 10. Độ đầy đủ nội dung của từng trường và cách khắc phục

### Kết luận

Không có bảo đảm tuyệt đối rằng provider trả đủ nội dung cho mọi đoạn. Mục tiêu cũng không nên là số ký tự đích phải bằng số ký tự nguồn: bản dịch giữa các ngôn ngữ thường dài/ngắn khác nhau. Cần bảo đảm mọi đoạn nguồn đều có kết quả không rỗng, các dữ kiện bắt buộc được giữ, không có dấu hiệu bị cắt cụt và toàn bộ trường đạt validation.

Luồng dịch Cloudflare chia văn bản thành các đoạn đầu vào mặc định 1.800 ký tự. Kết quả chỉ được ghép khi mọi chunk có output string không rỗng và chunk nguồn từ 40 ký tự không bị rút xuống dưới 20%. Cloudflare giới hạn đầu ra mặc định ở `2048` token mỗi request (`CLOUDFLARE_AI_MAX_TOKENS` có thể cấu hình); nếu response báo chạm token limit, pipeline từ chối output và thử chia nhỏ lại tối đa hai cấp. Đây là biện pháp phát hiện lỗi, không phải chứng minh đầy đủ ngữ nghĩa.

Catalog sản phẩm dịch `name`, `description`, `technicalDescription`, giá trị specs, alt ảnh và các field promotion có dữ liệu. Brand được giữ từ nguồn; các field trong `manualFields` có thể được giữ nguyên thay vì dịch. Kết quả field có thể được ghi checkpoint trước, nhưng catalog chỉ được upsert sau khi các bước dịch trường kết thúc. Vì vậy checkpoint field không có nghĩa cả product/language đã hoàn tất.

### Giới hạn validation hiện tại

- Validator đánh dấu `too_short` khi output ngắn hơn 20% nguồn và `too_long` khi dài hơn 300%; `too_long` hiện là lỗi không chặn approval.
- Có kiểm tra token kỹ thuật, markup, ngôn ngữ, một heuristic `truncated` và kiểm tra output tối thiểu theo chunk. Heuristic `truncated` chỉ bắt một số trường hợp nguồn dài từ 40 ký tự, kết thúc bằng dấu câu, trong khi bản dịch không kết thúc bằng dấu câu.
- Chưa có xác nhận ngữ nghĩa độc lập rằng mọi thông tin/câu nguồn đều có trong bản dịch. Output đủ dài vẫn có thể bỏ sót dữ kiện; không yêu cầu số ký tự hai ngôn ngữ bằng nhau.

### Trạng thái của lần chạy mới nhất

Lần chạy lịch sử có `Matched 3461`, `Completed checkpoint: 2540`, `remaining this run: 921`, nhưng `Fixed successfully: 0`, `Still has issues: 2540`, `Failed: 3` và `Remaining: 3461`. Cả 9 cấu hình Cloudflare bị rate-limit/cooldown; provider LibreTranslate cũ trả `ECONNREFUSED`. Không có cơ sở kết luận output bị cắt cho các job không nhận được kết quả. Không cộng các số trong report thành tổng độc lập.

### Khắc phục theo thứ tự an toàn

1. Dừng batch khi Cloudflare bị rate limit; xác nhận quota đã phục hồi trước khi gửi request thử. Không lặp probe nhiều key khi provider vẫn 429.
2. Chạy pilot nhỏ với validation mặc định đang bật, một ngôn ngữ và concurrency 1; ví dụ từ thư mục backend: `npm run retranslate -- --lang=es --limit=3 --concurrency=1`. Đây là lệnh ghi DB, không phải dry-run; không thêm `--shutdown` trong lúc kiểm chứng.
3. Kiểm tra catalog trong MongoDB cho các product/language vừa xử lý: `status`, `qualityStatus`, `sourceHash`, `validationErrors`, `provider`/`providersUsed`, và completeness của `name`, `description` (nếu nguồn có), các spec, alt và promotion tương ứng. So sánh với product nguồn, không chỉ nhìn log “Translation success”.
4. Chỉ khi pilot được lưu đủ và đạt chất lượng mới chạy retry phần unresolved bằng provider đã xác nhận khỏe. `--retry-unresolved` không kết hợp với `--lang` hoặc `--limit`; giữ checkpoint hiện có, không xóa thủ công.

### Cải tiến code nên làm

- Thêm preflight health check thật cho provider trước khi lập batch; nếu không có provider dùng được thì dừng ngay, không để batch bắt đầu rồi mới phát hiện endpoint/quota lỗi.
- Điều chỉnh chunk size theo giới hạn output thực tế của model, không tăng `CLOUDFLARE_AI_MAX_TOKENS` mù quáng; kiểm thử trên trường dài và locale có output mở rộng.
- Bổ sung validation ngữ nghĩa theo câu/dữ kiện quan trọng hoặc một bước review phù hợp; các phép đo ký tự/token chỉ là tín hiệu cảnh báo, không chứng minh bản dịch đầy đủ.
- Cân nhắc chỉ upsert catalog khi mọi field bắt buộc đã hoàn tất và pass validation; hiện catalog có thể được lưu với `qualityStatus` chưa approved để admin xem/sửa, còn storefront vẫn chặn theo readiness gate.
- Giữ validation bật; không dùng `--no-validate` để ép tăng số lượng approved. Sau khi provider khỏe, concurrency thấp ở pilot; tăng dần sau khi tỷ lệ timeout/429 và lỗi quality ổn định.

### Safeguards đã bổ sung trong code

- Mọi chunk phải có output dạng string không rỗng; chunk thiếu hoặc ngắn dưới 20% nguồn (với nguồn từ 40 ký tự) bị từ chối trước khi ghép/lưu.
- Nếu Cloudflare báo finish reason do chạm giới hạn output, kết quả bị đánh dấu `TRANSLATION_OUTPUT_INCOMPLETE`. Chunk lớn bị thiếu output được chia lại tối đa hai cấp; nếu vẫn thiếu, job thất bại thay vì ghi nhận như bản dịch hoàn tất.
- Cloudflare dùng chunk đầu vào mặc định 1.800 ký tự (`CLOUDFLARE_AI_INPUT_CHUNK_SIZE`); Cloudflare request concurrency và `retranslate` mặc định là 1 để tránh burst. Các biến concurrency trong `.env` có thể override giá trị mẫu.
- Query retranslate chỉ lấy các field cần xử lý; kết quả giữ trong RAM không còn giữ nguyên văn toàn bộ output cho từng job. Báo cáo giữ tối đa 5 ví dụ lỗi, mỗi ví dụ giới hạn 240 ký tự.
- Hook storefront không bị sửa: `useProductTranslation` dùng TanStack Query, truyền `AbortSignal` cho request, có `gcTime` 5 phút và không ghi translation vào `localStorage`.

Các kiểm tra này chặn nhiều lỗi rỗng/cắt ngắn rõ ràng, nhưng không chứng minh được bản dịch đúng nghĩa hoặc không bỏ sót thông tin tinh vi; vẫn cần validation chất lượng và kiểm tra mẫu trước khi chạy batch lớn.

## Tham chiếu code

- `online-store-backend/src/scripts/retranslate.js`
- `online-store-backend/src/seeds/retranslateSeeder.js`
- `online-store-backend/src/services/productCatalogRetranslationService.js`
- `online-store-backend/src/services/distributedLockService.js`
- `online-store-backend/src/utils/retranslateProgress.js`
- `online-store-backend/src/services/translationHelper.js`
- `online-store-backend/src/controllers/productController.js`
- `online-store-backend/src/services/cloudflareAiService.js`
- `online-store-backend/src/services/productTranslationService.js`
- `online-store-backend/src/test/cloudflare-ai-service.test.js`
- `online-store-backend/src/test/translation-product-cache.test.js`
- `online-store-backend/src/models/ProductCatalogTranslationCache.js`
- `online-store-backend/src/config/languageInventory.js`
- `online-store-backend/python/scraper_paths.py`
