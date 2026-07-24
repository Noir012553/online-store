# Issue 11 — Format tiền tệ ở backend

## Trạng thái

**Hoàn thành.** Tài liệu đã được đối chiếu và rút gọn; việc chuyển đổi toàn bộ consumer frontend vẫn là hạng mục triển khai riêng.

## Mục tiêu

Backend chịu trách nhiệm tạo chuỗi hiển thị tiền tệ và tỷ giá theo locale. API luôn giữ các trường số gốc cho tính toán, sắp xếp và thanh toán; frontend chỉ render các trường `formatted*` khi API đã trả về.

## Hiện trạng đã xác minh

- Backend đã có `online-store-backend/src/utils/currencyFormatter.js` với `formatCurrency` và `formatExchangeRate`.
- Exchange-rate response đã trả `formattedRate`, `formattedAmount` và `formattedConvertedAmount`.
- `currencyResponseFormatter.js` đã bổ sung formatted fields cho product, order và payment; analytics/shipment cũng đã có các trường doanh thu, phí đã format.
- `ExchangeRateList.tsx` đã render `rate.formattedRate`; không còn dùng `toFixed(8)`.
- Locale lấy từ `req.lang`, do `languageMiddleware` xác định theo thứ tự: query, body, `Accept-Language`, rồi locale mặc định.

## Quy ước API

Ví dụ response:

```json
{
  "rate": 10.85,
  "formattedRate": "10,85",
  "amount": 100,
  "formattedAmount": "100,00 €",
  "currencyCode": "EUR"
}
```

- Không thay thế trường số bằng chuỗi đã format.
- Không lưu chuỗi format trong database; chỉ tạo khi serialize response.
- Giá tiền dùng `decimalPlaces` của currency.
- Tỷ giá có tối đa 8 chữ số thập phân và bỏ các số `0` không cần thiết.
- Không dùng chuỗi đã format cho phép tính.

## Việc còn lại

- Rà soát các màn hình frontend đang tự format tại `src/lib/utils.ts`, `src/hooks/useCurrency.ts` và `src/hooks/useCurrencyConversion.ts`.
- Chuyển từng vị trí **hiển thị** ở product, cart, checkout, order, coupon và statistics sang trường `formatted*` tương ứng.
- Giữ trường số gốc cho tính toán, sắp xếp và payload nghiệp vụ.
- Chỉ thu hẹp hoặc xóa formatter frontend sau khi toàn bộ consumer liên quan đã chuyển đổi và kiểm thử.

## Kiểm thử cần có khi tiếp tục triển khai

- Tỷ giá: `10.85`, `10.85000000`, `0.000041`, `0.00003772`.
- Currency có `decimalPlaces` bằng `0`, `2` và lớn hơn `2`.
- Locale tiếng Việt, locale dùng dấu chấm thập phân, request có/không có `lang`.
- Đảm bảo các trường nghiệp vụ như `rate`, `amount`, `convertedAmount` và `total` vẫn là `number`.
- Kiểm tra các màn hình product, cart/checkout, coupon, statistics và admin exchange rate trên desktop/mobile.
