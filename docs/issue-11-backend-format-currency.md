# Issue 11: Backend format tiền tệ

## Vấn đề

Frontend và backend đang cùng xử lý locale, nội dung đa ngôn ngữ, tính toán tiền và format giá tiền, dẫn đến nguy cơ không đồng nhất giữa hai hệ thống về:

- Ngôn ngữ và locale hiện tại của người dùng.
- Nội dung được dịch.
- Currency gốc, currency sau quy đổi và tỷ giá.
- Subtotal, discount, phí vận chuyển và tổng tiền.
- Ký hiệu tiền tệ, số chữ số thập phân và cách hiển thị theo vùng.

Frontend không nên tự tính toán, quy đổi hoặc format lại dữ liệu do backend trả về. Chuỗi tiền đã format không được dùng cho tính toán, sắp xếp hoặc thanh toán.

## Cách giải quyết

Backend là nguồn xử lý thống nhất cho đa ngôn ngữ và tiền tệ. Frontend chỉ gửi lựa chọn hiện tại của người dùng, nhận response và render dữ liệu.

- Frontend gửi ngôn ngữ và locale hiện tại trong mọi request cần dịch hoặc format, ví dụ `lang: "vi"` và `locale: "vi-VN"`.
- Frontend gửi `currencyCode` khi người dùng chọn currency hiển thị hoặc currency thanh toán.
- Backend xác định ngôn ngữ từ `query.lang`, `body.lang`, `Accept-Language` hoặc ngôn ngữ mặc định; giữ mã ngôn ngữ ở `req.lang` cho dịch nội dung và locale đầy đủ ở `req.locale` cho format số.
- Backend chịu trách nhiệm dịch nội dung động, tính toán giá, quy đổi currency, áp dụng tỷ giá, phí, discount và tổng tiền.
- Backend lấy `currencyCode` cùng metadata currency để format.
- API giữ cả giá trị số raw và chuỗi hiển thị đã format.
- Frontend chỉ render các field `formatted*`, không tính toán hoặc format lại chúng.
- Frontend vẫn quyết định layout, style, trạng thái UI và vị trí render. Trong tài liệu này, "render" không bao gồm việc tự quy đổi hoặc tạo lại chuỗi tiền bằng số raw, `currencyCode` hay formatter riêng.

### Chính sách fallback hiển thị

- Không fallback từ `formatted*` sang `String(amount)`, `${amount} ${currencyCode}` hoặc formatter riêng của client.
- Không dùng giá trị đã format để tính toán, sắp xếp hoặc thanh toán.
- Nếu response nghiệp vụ thiếu field `formatted*`, đó là lỗi contract cần được ghi nhận và sửa ở API/consumer; UI chỉ được hiển thị trạng thái chưa sẵn sàng hoặc placeholder cố định, không tự ghép chuỗi tiền.
- Locale hoặc currency không hợp lệ chỉ được fallback về giá trị mặc định đã cấu hình ở boundary; không lấy bản dịch, currency hoặc format đầu tiên tìm thấy trong object.
- Quy ước này áp dụng cho product list/detail, search, cart, checkout, order history/success, payment, shipping, coupon và admin.

Các nhãn giao diện tĩnh cũng phải dùng cùng lựa chọn `lang` của người dùng. Có thể trả dictionary từ backend hoặc dùng bộ dịch frontend, nhưng nguồn locale phải thống nhất và không được để hai hệ thống tự suy luận khác nhau.

Ví dụ request:

```json
{
  "lang": "vi",
  "locale": "vi-VN",
  "currencyCode": "VND"
}
```

Ví dụ:

```json
{
  "locale": "fr-FR",
  "currencyCode": "EUR",
  "amount": 1250,
  "formattedAmount": "1 250,00 €"
}
```

Thiết kế áp dụng cho mọi locale được cấu hình, không hardcode riêng `vi` hoặc `en`.

## Quy ước field

- `amount`, `price`, `totalPrice`, `rate`: luôn là số gốc.
- `formattedAmount`, `formattedPrice`, `formattedTotalPrice`, `formattedRate`: chuỗi dành cho hiển thị.
- `currencyCode`: currency của giá trị tương ứng.
- Không lưu chuỗi đã format vào database.

## Đã hoàn thành

- Backend có formatter dùng locale và metadata currency.
- REST product, order, payment, coupon, shipping, shipment và exchange rate đã trả các field `formatted*` cần thiết.
- Các giá trị raw vẫn được giữ nguyên cho nghiệp vụ.
- Các màn hình hiển thị chính đã ưu tiên render `formatted*` từ API.
- Event `payment-success` chỉ kích hoạt refetch REST, không dùng số tiền từ socket để render.
- Contract shipping đã có `fee` dạng số và `formattedFee` dạng chuỗi.
- Currency inactive vẫn được hỗ trợ khi format dữ liệu lịch sử.
- Backend tự tính lại tổng đơn hàng từ giá trong database khi tạo order, không tin tổng tiền do client gửi.
- Payment service dùng tổng tiền của order và tự quy đổi sang currency của cổng thanh toán.
- Locale đầy đủ mã vùng được giữ nguyên khi hợp lệ (ví dụ `fr-CA`, `en-GB`); locale không hợp lệ hoặc ngôn ngữ chưa hỗ trợ sẽ dùng locale mặc định.
- Các endpoint product, coupon và analytics dùng thống nhất query `currencyCode`; backend lấy đúng field này để quy đổi và trả các field `formatted*`.

## Còn lại

- Rà soát các utility format tiền còn được gọi ở client để phân biệt hiển thị phụ trợ với logic nghiệp vụ.
- Kiểm thử hồi quy các request liên quan để xác nhận `lang`, `locale` và `currencyCode` được truyền nhất quán trên môi trường có dữ liệu.
- Kiểm thử hồi quy cart, checkout, product, admin và các màn hình sau thanh toán.

## Kết quả rà soát hiện tại

- Không tìm thấy `src/hooks/useCurrencyConversion.ts` trong source hiện tại.
- Các màn hình chính đã có và ưu tiên render các field `formatted*` từ API.
- Vẫn còn fallback giá raw ở `src/components/ProductCard.tsx`, `src/components/QuickViewModal.tsx`, `src/components/SearchDropdown.tsx` và `src/components/CategoryProductsList.tsx`; các consumer này phải bỏ fallback và chỉ render `formattedPrice`.
- Một số phép tính UI như số lượng dòng cart hoặc phần trăm giảm giá vẫn cần kiểm tra để bảo đảm không được dùng làm dữ liệu thanh toán/nghiệp vụ.

## Thứ tự triển khai còn lại

1. Chốt contract cart summary theo `lang`, `locale`, `currencyCode`: input chỉ gồm cart items, coupon và lựa chọn shipping hợp lệ; output trả item, subtotal, discount, shipping và total ở dạng raw/formatted. Tổng hoặc chuỗi do client tính không được là input.
2. Triển khai cart summary và kiểm thử đổi currency, coupon không hợp lệ, shipping thay đổi và locale có mã vùng.
3. Dùng cart summary làm đầu vào duy nhất cho checkout summary; coupon, shipping và payment phải được backend tính lại từ dữ liệu tin cậy.
4. Chuyển create order sang dùng checkout summary đã xác nhận, không nhận tổng tiền hoặc giá đã quy đổi từ client.
5. Thay từng consumer frontend còn lại bằng field `formatted*` từ API, bắt đầu với cart/checkout rồi đến product, admin và các trang sau thanh toán; ưu tiên bốn consumer còn fallback raw được liệt kê ở phần kết quả rà soát.
6. Xóa logic quy đổi/format client chỉ sau khi mọi consumer của nó đã chuyển sang API summary và được xác minh; các error path liên quan tiếp tục được audit trong `issue-10`.

## Điều kiện hoàn tất mỗi bước

- Backend là nguồn duy nhất cho số liệu nghiệp vụ, quy đổi và chuỗi `formatted*` của summary.
- Frontend chỉ gửi `lang`, `locale`, `currencyCode` cùng lựa chọn nghiệp vụ hợp lệ, rồi render response; không gửi subtotal, discount hoặc total tự tính.
- Cùng dữ liệu đầu vào phải tạo kết quả nhất quán khi retry; giá raw vẫn được giữ riêng với chuỗi hiển thị.

## Nguyên tắc duy trì

1. Backend là nguồn duy nhất cho dịch nội dung động, tính toán, quy đổi và format tiền.
2. Frontend gửi `lang`, `locale` và `currencyCode` hiện tại trong mọi request liên quan.
3. Frontend chỉ dùng `formatted*` để hiển thị; không tự tính toán hoặc format lại.
4. Không thay thế số raw bằng chuỗi format; số raw vẫn dùng cho nghiệp vụ backend.
5. Không hardcode điều kiện theo từng ngôn ngữ hoặc currency ở frontend hay backend.
6. Khi dùng currency khác currency gốc, backend quy đổi từ số raw và trả về summary theo currency đích.
7. Các API liên quan đến cùng một nghiệp vụ phải trả kết quả theo cùng `locale`, `currencyCode` và quy tắc format.

## Trạng thái

**Đang hoàn thiện xác minh.** Backend đã có formatter, các consumer chính dùng field `formatted*` và product/coupon/analytics đã dùng thống nhất `currencyCode`; không tìm thấy hook `useCurrencyConversion` cũ trong source hiện tại. Build frontend và bộ test currency backend đã qua; vẫn cần kiểm thử hồi quy đầy đủ trên môi trường có dữ liệu trước khi đánh dấu hoàn tất.
