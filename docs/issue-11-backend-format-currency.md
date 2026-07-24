# Kế hoạch chuyển format tiền tệ sang backend

## Quy tắc đặt tên báo cáo

Tên file Markdown tuân theo định dạng `issue-N-<mô-tả>.md`. File này là `issue-11-backend-format-currency.md`, tiếp nối các báo cáo issue hiện có trong thư mục `docs`.

## Trạng thái

- **Loại:** Thay đổi cách cung cấp dữ liệu hiển thị tiền tệ
- **Phạm vi:** API backend và các màn hình frontend đang hiển thị giá tiền/tỷ giá
- **Ưu tiên:** Trung bình
- **Trạng thái hiện tại:** Chỉ lập kế hoạch, chưa triển khai mã nguồn

> **[LỖI — đã xác minh]** Trạng thái này đã lỗi thời: formatter backend, các field `formattedAmount`/`formattedConvertedAmount`/`formattedRate` cho endpoint quy đổi, và phần render `formattedRate` ở danh sách tỷ giá admin đều đã có trong mã nguồn (`online-store-backend/src/utils/currencyFormatter.js:5-22`, `online-store-backend/src/controllers/exchangeRateController.js:293-300`, `online-store-frontend/src/components/admin/ExchangeRateList.tsx:113-115`).

## Mục tiêu

Đưa trách nhiệm format số tiền và tỷ giá về backend để frontend không tự quyết định số chữ số thập phân, dấu phân cách hoặc ký hiệu tiền tệ. Frontend chỉ nhận chuỗi hiển thị từ API và render chuỗi đó.

Giá trị số gốc vẫn phải được giữ lại trong response để các luồng cần tính toán, sắp xếp, kiểm tra hoặc thanh toán không bị biến thành chuỗi.

## Phân tích hiện trạng

### Frontend đang format tiền

Các helper hiện tại dùng `Intl.NumberFormat` ở:

- `online-store-frontend/src/lib/utils.ts`
- `online-store-frontend/src/hooks/useCurrency.ts`
- `online-store-frontend/src/hooks/useCurrencyConversion.ts`

> **[LỖI — đã xác minh]** `useCurrency.ts` không gọi trực tiếp `Intl.NumberFormat`; file này chỉ gọi `formatCurrencyWithMetadata` từ `src/lib/utils.ts` (`online-store-frontend/src/hooks/useCurrency.ts:3,9`).

Riêng danh sách tỷ giá admin đang ép mọi giá trị thành 8 chữ số sau dấu thập phân tại:

- `online-store-frontend/src/components/admin/ExchangeRateList.tsx:114`

```tsx
rate.rate.toFixed(8)
```

Các số 0 ở cuối như `10.85000000` phát sinh từ cách format này, không phải do backend tạo thêm dữ liệu.

> **[LỖI — đã xác minh]** `ExchangeRateList.tsx:114` hiện render `rate.formattedRate`, không có `rate.rate.toFixed(8)` (`online-store-frontend/src/components/admin/ExchangeRateList.tsx:113-115`). Nhận định về nguồn tạo số `0` ở cuối vì vậy không còn đúng với mã hiện tại.
>
> Backend hiện format tỷ giá bằng `Intl.NumberFormat` với `maximumFractionDigits: 8`, nên không tự thêm số `0` ở cuối (`online-store-backend/src/utils/currencyFormatter.js:16-18`).

### Backend hiện đang tính và trả số

Backend lưu tỷ giá dưới dạng `Number` tại:

- `online-store-backend/src/models/ExchangeRate.js:41-45`

Backend thực hiện quy đổi và làm tròn theo `decimalPlaces` của tiền đích tại:

- `online-store-backend/src/services/exchangeRateService.js:212-228`

Hiện backend chưa có một formatter tiền tệ dùng chung để trả chuỗi hiển thị theo locale.

> **[LỖI — đã xác minh]** Backend đã có formatter dùng chung tại `online-store-backend/src/utils/currencyFormatter.js:5-22`, gồm `formatCurrency` và `formatExchangeRate`. `exchangeRateController` đã import và trả các field format từ formatter này (`online-store-backend/src/controllers/exchangeRateController.js:9,293-300`).

## Định hướng API đề xuất

Không thay thế các trường số hiện có bằng chuỗi. Bổ sung trường hiển thị có tên rõ ràng để tránh phá vỡ các consumer đang dùng API.

Ví dụ:

```json
{
  "rate": 10.85,
  "formattedRate": "10,85",
  "amount": 100,
  "formattedAmount": "100,00 €",
  "currencyCode": "EUR"
}
```

Tên trường cụ thể cần thống nhất theo từng response hiện có. Không thêm chuỗi format vào model MongoDB; chuỗi này phải được tạo lúc serialize response vì locale và cấu hình tiền tệ có thể thay đổi.

### Quy tắc locale

- Ưu tiên locale từ query/request context đang được hệ thống sử dụng.
- Nếu request không có locale, dùng locale mặc định của hệ thống.
- Backend dùng metadata currency hiện có: `symbol`, `position`, `decimalPlaces`.
- Tỷ giá vẫn có thể giữ tối đa 8 chữ số có nghĩa sau dấu thập phân nhưng phải loại bỏ số 0 ở cuối.
- Không dùng `parseFloat` trên chuỗi đã format để tính toán.
- Không lưu chuỗi đã format vào database.

## Các file backend dự kiến thay đổi

> **[LỖI — đã xác minh]** Tiêu đề này cần phân biệt phần chưa triển khai với phần đã có: ít nhất formatter và một phần response của exchange rate đã được triển khai.

### Formatter dùng chung

Tạo một utility backend trong thư mục utils, ví dụ:

- `online-store-backend/src/utils/currencyFormatter.js`

Utility này nhận số tiền, mã tiền tệ, locale và metadata currency; trả về chuỗi hiển thị bằng `Intl.NumberFormat` hoặc quy tắc tương đương của backend.

> **[LỖI — đã xác minh]** Đây không còn là file “dự kiến tạo”: `online-store-backend/src/utils/currencyFormatter.js` đã tồn tại và đang triển khai `formatCurrency`/`formatExchangeRate`.

Cần tách rõ hai trường hợp:

1. **Giá tiền:** format theo `decimalPlaces` của currency.
2. **Tỷ giá:** format tối đa 8 chữ số thập phân và loại bỏ số 0 không cần thiết.

### Service và controller

Rà soát các response có giá tiền/tỷ giá trong:

- `online-store-backend/src/services/exchangeRateService.js`
- `online-store-backend/src/controllers/exchangeRateController.js`
- Service/controller order và payment đang trả amount, total hoặc converted amount.
- Các endpoint statistics/analytics có trả giá trị tiền.

Bổ sung formatted fields ở lớp response/serializer, không format trong model và không làm thay đổi phép tính nghiệp vụ.

### Hợp đồng locale

Rà soát cách backend xác định ngôn ngữ hiện tại, bao gồm:

- `req.lang`
- `Accept-Language`
- query `lang`
- `getAdminLanguage()` ở exchange rate controller

> **[LỖI — đã xác minh]** Cần mô tả rõ hơn rằng `getAdminLanguage()` hiện đọc `req.lang` rồi fallback về ngôn ngữ mặc định (`online-store-backend/src/controllers/exchangeRateController.js:11`); `req.lang` đã được `languageMiddleware` xác định theo thứ tự query, body, `Accept-Language`, rồi default (`online-store-backend/src/middleware/languageMiddleware.js:12-40`). Không phải một cơ chế locale độc lập trong exchange-rate controller.

Chọn một cơ chế thống nhất để formatter không tự suy đoán locale khác nhau giữa các endpoint.

## Các file frontend dự kiến thay đổi

> **[LỖI — đã xác minh]** `ExchangeRateList.tsx` không còn là thay đổi dự kiến cho việc render tỷ giá; component này đã dùng `rate.formattedRate` (`online-store-frontend/src/components/admin/ExchangeRateList.tsx:113-115`).

Rà soát các nơi đang gọi formatter hoặc tự format amount:

- `online-store-frontend/src/lib/utils.ts`
- `online-store-frontend/src/hooks/useCurrency.ts`
- `online-store-frontend/src/hooks/useCurrencyConversion.ts`
- `online-store-frontend/src/components/admin/ExchangeRateList.tsx`
- Các component product, cart, checkout, order, coupon và statistics đang hiển thị giá.

Thay đổi theo nguyên tắc:

- Render `formattedAmount`, `formattedPrice`, `formattedTotal` hoặc `formattedRate` từ API.
- Giữ dùng các trường số gốc cho logic frontend thực sự cần tính toán.
- Không gọi `toFixed()` hoặc tự tạo `Intl.NumberFormat` cho các trường đã có formatted field.
- Không hiển thị chuỗi số thô nếu API đã cung cấp chuỗi format tương ứng.
- Không thay đổi màu sắc, hình dạng, typography, breakpoint hoặc tên biến style hiện có.

## Tương thích API

- Giai đoạn triển khai đầu tiên vẫn giữ các trường số hiện tại.
- Bổ sung trường format thay vì đổi kiểu dữ liệu của trường cũ.
- Frontend chuyển sang dùng trường format sau khi backend đã trả ổn định.
- Chỉ xóa formatter frontend khi đã rà soát toàn bộ consumer và response liên quan.
- Không dùng fallback format khác locale một cách âm thầm; nếu response bắt buộc phải có formatted field thì endpoint cần được kiểm thử để bảo đảm luôn tạo được field đó.

## Thứ tự triển khai

1. Liệt kê toàn bộ API và component đang hiển thị giá tiền, tổng tiền, amount, converted amount và exchange rate.
2. Thống nhất tên formatted field và quy tắc locale cho từng nhóm response.
3. Tạo currency formatter backend dùng metadata currency hiện có.
4. Viết test cho số nguyên, số thập phân, tỷ giá rất nhỏ và trường hợp có số 0 ở cuối.
5. Bổ sung formatted fields vào exchange-rate responses trước.
6. Bổ sung formatted fields cho product/order/cart/coupon/statistics responses có giá tiền.
7. Cập nhật frontend để render formatted fields và giữ raw numeric fields cho tính toán.
8. Xóa hoặc thu hẹp các formatter frontend chỉ sau khi không còn consumer sử dụng chúng cho API response đã chuyển đổi.
9. Chạy backend tests, frontend build/type check và kiểm tra trực tiếp các màn hình desktop/mobile.

## Tiêu chí nghiệm thu

- `10.85000000` được hiển thị thành `10.85` hoặc dạng phân cách tương ứng theo locale.
- `0.00004100` được hiển thị thành `0.000041` hoặc dạng tương ứng theo locale.
- Tỷ giá nhỏ như `0.00003772` không bị mất chữ số có ý nghĩa.
- Giá tiền vẫn tuân theo `decimalPlaces` của từng currency.
- API vẫn trả số ở các trường nghiệp vụ như `rate`, `amount`, `convertedAmount`, `total`.
- API trả thêm chuỗi format đúng locale cho các trường được chọn.
- Frontend không format lại chuỗi đã format và không làm phát sinh số 0 dư.
- Luồng quy đổi, tạo đơn, thanh toán, coupon và thống kê không bị ảnh hưởng.
- Không có thay đổi ngoài phạm vi format dữ liệu hiển thị.

## Kiểm thử dự kiến

### Backend

- Tỷ giá `10.85`.
- Tỷ giá `10.85000000`.
- Tỷ giá `0.000041`.
- Tỷ giá `0.00003772`.
- Tiền tệ có `decimalPlaces = 0`, `2` và nhiều hơn `2` nếu cấu hình cho phép.
- Locale tiếng Việt và locale dùng dấu chấm thập phân.
- Request có và không có `lang`.
- Response vẫn giữ kiểu `number` cho các trường tính toán.

### Frontend

- Trang quản lý tỷ giá.
- Danh sách sản phẩm và chi tiết sản phẩm.
- Cart/checkout và tổng đơn hàng.
- Coupon/discount.
- Admin dashboard/statistics.
- Trạng thái loading, empty, error và API response thiếu formatted field trong giai đoạn chuyển tiếp.

## Rủi ro và giới hạn

- Nếu backend format theo locale của request, cùng một số có thể có chuỗi khác nhau giữa các request; đây là hành vi mong muốn nhưng phải thống nhất cách truyền locale.
- Nếu một API được dùng cho nhiều mục đích, chỉ trả chuỗi format có thể làm mất khả năng tính toán; vì vậy không được xóa raw numeric fields.
- Một số component có thể đang dùng cùng một field cho cả tính toán và hiển thị; cần rà soát trước khi bỏ formatter frontend.
- Backend format ký hiệu tiền tệ có thể ảnh hưởng đến email, export hoặc client khác nếu dùng chung serializer; cần giới hạn formatted fields theo response phù hợp.
- Việc chuyển toàn bộ hệ thống một lần có phạm vi lớn hơn việc sửa riêng danh sách tỷ giá admin. Có thể triển khai theo từng nhóm endpoint.

## Kết luận

Có thể đưa phần format hiển thị về backend, nhưng không nên biến toàn bộ dữ liệu tiền tệ thành chuỗi. Cách an toàn là backend trả đồng thời **giá trị số gốc** và **chuỗi đã format**, còn frontend chỉ render chuỗi đã format và tiếp tục dùng giá trị số cho các phép tính cần thiết.
