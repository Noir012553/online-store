## Giới hạn đầu vào Cloudflare

Luồng dịch sản phẩm chia văn bản thành các đoạn trước khi gửi Cloudflare AI. Kích thước mặc định là **1.800 ký tự** (`CLOUDFLARE_AI_INPUT_CHUNK_SIZE`); service giới hạn tối đa **6.000 ký tự** mỗi đoạn. Đây là giới hạn của ứng dụng, không phải giới hạn API/model.

JavaScript tính `string.length` theo UTF-16 code unit; một số emoji chiếm hai đơn vị.

## Chia và ghép đoạn

`online-store-backend/src/services/productTranslationService.js` chia ở ranh giới xuống dòng, dấu câu hoặc khoảng trắng gần giới hạn. Các đoạn được gửi tuần tự rồi ghép đúng thứ tự, giữ khoảng trắng ở ranh giới.

Trước khi ghép, mỗi output phải là string không rỗng. Nếu đoạn dài từ 40 ký tự bị rút xuống dưới 20% độ dài nguồn, output bị từ chối. Khi Cloudflare báo output không đầy đủ, service có thể chia nhỏ đoạn và thử lại tối đa hai cấp; các lỗi rate limit/quota được truyền lên để tác vụ được ghi nhận chưa hoàn tất.

`cloudflareAiService.translate()` không tự chia đầu vào. Các caller trực tiếp của service đó gửi văn bản trong một request, nên cần tự chọn luồng chunking khi dịch nội dung dài.

## Giới hạn đầu ra và kiểm định

Cloudflare đặt `max_tokens` cho phản hồi, mặc định **2.048 token** (`CLOUDFLARE_AI_MAX_TOKENS`). Giới hạn này không tương đương số ký tự đầu vào và không bảo đảm mọi bản dịch đầy đủ.

Chunking bảo toàn thứ tự và nội dung nguồn khi chia, nhưng không chứng minh bản dịch giữ đủ ý. Validator kiểm tra một số dấu hiệu như output quá ngắn, thiếu technical token, markup sai hoặc bị cắt; vẫn cần kiểm tra mẫu thực tế.
