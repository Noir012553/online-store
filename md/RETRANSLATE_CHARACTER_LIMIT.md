# Giới hạn ký tự mỗi request khi retranslate

## Ngưỡng hiện tại

Trong luồng retranslate sản phẩm, văn bản được chia thành các đoạn tối đa **6.000 đơn vị `string.length`** trước khi gửi request đến LibreTranslate hoặc Cloudflare AI. Đây là ngưỡng mặc định do ứng dụng đặt, không phải giới hạn tối đa được xác nhận của hai dịch vụ. Có thể thay đổi bằng biến môi trường `LIBRETRANSLATE_DESCRIPTION_CHUNK_SIZE`.

Vì vậy, với luồng retranslate thông thường dùng Cloudflare làm provider chính, mỗi request đến model nhận tối đa một đoạn 6.000 đơn vị `string.length`; văn bản dài hơn được gửi qua nhiều request nối tiếp. Đây là giới hạn do luồng ứng dụng áp dụng, không phải Cloudflare quy định một mức chung là 6.000 ký tự.

Lưu ý: JavaScript tính `string.length` theo đơn vị UTF-16 code unit; một số emoji chiếm 2 đơn vị, nên con số này không phải lúc nào cũng tương đương với số Unicode code point mà người dùng nhìn thấy.

**Ngoại lệ:** `cloudflareAiService.translate()` không tự chia văn bản. Nếu được gọi trực tiếp ngoài luồng retranslate nói trên, nó gửi nguyên văn bản đầu vào trong một request; giới hạn khi đó phụ thuộc vào model và API đang cấu hình.

## Luồng Cloudflare AI

- `online-store-backend/src/services/libretranslateProductService.js` chia đầu vào bằng `splitText` trước khi gọi Cloudflare cho từng đoạn.
- `translateWithFailover()` là đường đi Cloudflare chính của retranslate khi không bật `--libretranslate-only`. Nếu LibreTranslate được bật, service có thể dịch nháp cùng đoạn trước; sau đó gửi nội dung gốc và bản nháp làm ngữ cảnh cho Cloudflare model.
- Nếu Cloudflare gặp rate limit/quota và `LIBRETRANSLATE_FAILOVER_ON_CLOUDFLARE_OVERLOAD=true`, đoạn đó có thể được chuyển sang LibreTranslate. Một đoạn lỗi không được ghép vào kết quả một phần; lỗi cuối cùng được truyền lên luồng batch.
- Request đến Cloudflare đặt `max_tokens` cho đầu ra: mặc định **2.048 token**, có thể đổi bằng `CLOUDFLARE_AI_MAX_TOKENS`. Đây là giới hạn token đầu ra, không phải giới hạn ký tự đầu vào. Đầu vào 6.000 ký tự không đảm bảo model luôn trả được bản dịch đầy đủ nếu đầu ra chạm giới hạn token.
- `CLOUDFLARE_AI_MAX_INPUT_CHARS_PER_DAY` là ngân sách ký tự đầu vào theo ngày để kiểm soát tổng sử dụng; nó không phải giới hạn ký tự cho mỗi request. Timeout request Cloudflare trong service hiện đặt 120 giây.
- Client CF thử lại một số lỗi tạm thời và có thể thử config/key khác khi bị rate limit. Retry không tự chia nhỏ đoạn; nếu hết retry/config hoặc provider vẫn lỗi, lời gọi thất bại.

Các điểm trên được triển khai trong `online-store-backend/src/services/cloudflareAiService.js`.

## Cách chia và gửi đoạn

- `libretranslate-tool/src/productTranslator.js` định nghĩa ngưỡng mặc định 6.000 và hàm `splitText` dùng chung.
- Nếu văn bản dài hơn ngưỡng, hàm ưu tiên ngắt tại xuống dòng, dấu câu hoặc khoảng trắng gần giới hạn. Nếu không có ranh giới phù hợp, đoạn được cắt tại giới hạn.
- Các đoạn được gửi lần lượt. Khi nhận đủ kết quả, ứng dụng ghép chúng theo đúng thứ tự; phần ghép có xét khoảng trắng ở ranh giới.
- Backend retranslate dùng cơ chế này trong `online-store-backend/src/services/libretranslateProductService.js` cho các trường sản phẩm, dù provider cuối cùng là LibreTranslate hay Cloudflare AI.
- Kiểm thử `libretranslate-tool/test/productTranslator.test.js` xác nhận các đoạn nguồn ghép lại bằng đúng văn bản đầu vào và kiểm tra giữ khoảng trắng khi ghép bản dịch.

Lưu ý: JavaScript tính `string.length` theo đơn vị UTF-16 code unit; một số emoji chiếm 2 đơn vị, nên con số này không phải lúc nào cũng tương đương với số Unicode code point mà người dùng nhìn thấy.

## Cách chia và gửi đoạn

- `libretranslate-tool/src/productTranslator.js` định nghĩa ngưỡng mặc định 6.000 và hàm `splitText`.
- Nếu văn bản dài hơn ngưỡng, hàm ưu tiên ngắt tại xuống dòng, dấu câu hoặc khoảng trắng gần giới hạn. Nếu không có ranh giới phù hợp, đoạn được cắt tại giới hạn.
- Các đoạn được gửi lần lượt. Khi nhận đủ kết quả, ứng dụng ghép chúng theo đúng thứ tự; phần ghép có xét khoảng trắng ở ranh giới.
- Backend retranslate sử dụng cơ chế này trong `online-store-backend/src/services/libretranslateProductService.js` cho các trường văn bản được gửi qua LibreTranslate.
- Kiểm thử `libretranslate-tool/test/productTranslator.test.js` xác nhận các đoạn nguồn ghép lại bằng đúng văn bản đầu vào và kiểm tra giữ khoảng trắng khi ghép bản dịch.

## Khi request thất bại

Client LibreTranslate thử lại một số lỗi tạm thời theo cấu hình retries. Nếu một đoạn vẫn thất bại, lời gọi dịch báo lỗi; ứng dụng không ghép các đoạn đã dịch dở thành kết quả đầy đủ. Với bản dịch catalog, bản cập nhật được thực hiện sau khi các trường cần dịch đã xử lý xong (`online-store-backend/src/services/productCatalogRetranslationService.js`). Batch cũng theo dõi lỗi và trạng thái validation; không nên xem record có lỗi hoặc còn vấn đề kiểm định là đã dịch thành công.

## Mức độ đảm bảo và giới hạn

Cơ chế chia đoạn bảo toàn nội dung nguồn ở bước cắt chuỗi: các đoạn bao phủ liên tiếp văn bản đầu vào và được xử lý theo thứ tự. Điều này **không đảm bảo tuyệt đối rằng mô hình dịch sẽ giữ nguyên mọi ý, thuật ngữ hoặc chi tiết trong bản dịch**. Validator có thể phát hiện một số trường hợp như bản dịch quá ngắn/quá dài, dấu hiệu bị cắt cụt, thiếu technical token hoặc sai markup, nhưng không phát hiện được mọi kiểu bỏ sót nội dung (`online-store-backend/src/utils/translationValidator.js`).

Tài liệu trạng thái `md/RETRANSLATE_BATCH_STATUS.md` ghi nhận lần chạy direct-only trước đó bị `missing_technical_token`, và log gần nhất có timeout khi dịch mô tả dài. Cơ chế chunking bảo toàn đầu vào khi chia đoạn, nhưng không đảm bảo model không bỏ sót ý; riêng giới hạn `max_tokens` có thể làm đầu ra ngắn hơn mong muốn. Chất lượng cuối cùng vẫn cần được xác nhận bằng validation và kiểm tra mẫu thực tế.
