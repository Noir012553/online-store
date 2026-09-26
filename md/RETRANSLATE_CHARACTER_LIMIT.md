# Giới hạn ký tự mỗi request khi retranslate

## Ngưỡng hiện tại

Luồng LibreTranslate chia văn bản thành các đoạn tối đa **6.000 đơn vị `string.length`** trước khi gửi request. Đây là ngưỡng mặc định do ứng dụng đặt, không phải giới hạn tối đa được xác nhận của LibreTranslate. Có thể thay đổi bằng biến môi trường `LIBRETRANSLATE_DESCRIPTION_CHUNK_SIZE`.

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

Tài liệu trạng thái `md/RETRANSLATE_BATCH_STATUS.md` ghi nhận lần chạy direct-only trước đó bị `missing_technical_token`, và log gần nhất có timeout khi dịch mô tả dài. Do đó, cơ chế chunking ngăn mất đoạn do giới hạn request ở tầng ứng dụng, nhưng chất lượng cuối cùng vẫn cần được xác nhận bằng validation và kiểm tra mẫu thực tế.
