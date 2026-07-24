# Issue 11 — Format tiền tệ ở backend

## Trạng thái

**Đang triển khai một phần.** Phần backend và danh sách tỷ giá admin đã hoàn thành; các consumer frontend dưới đây vẫn chưa chuyển sang render hoàn toàn từ formatted fields.

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

Các mục chưa fix, được xác định qua mã nguồn hiện tại:

- [ ] **Formatter dùng cục bộ:** `online-store-frontend/src/lib/utils.ts:13-38`, `src/hooks/useCurrency.ts` và `src/hooks/useCurrencyConversion.ts:118-149` vẫn tạo chuỗi bằng `Intl.NumberFormat` thay vì ưu tiên chuỗi từ API.
- [ ] **Dashboard admin:** `online-store-frontend/src/pages/admin/dashboard.tsx:91-100` vẫn format doanh thu bằng `formatConvertedPrice`; phần phần trăm tại dòng 94-99 không thuộc tiền tệ và có thể giữ nguyên.
- [ ] **Statistics admin:** `online-store-frontend/src/pages/admin/statistics.tsx:146-153` vẫn fallback sang `formatCurrencyByCode` cho product, order total và coupon amount khi đã có formatted response tương ứng.
- [ ] **Coupon admin:** `components/admin/CouponManagementPage.tsx:529-542` và `components/admin/coupons/CouponsList.tsx:172-185` vẫn tự format discount khi thiếu formatted field; cần kiểm tra contract response để bỏ fallback sau khi field luôn được trả về.
- [ ] **Các màn hình order/checkout:** `pages/my-orders.tsx:82-83`, `pages/return.tsx:333-418`, `pages/order-success.tsx:237-239`, `pages/orders/[id].tsx:269-315`, `pages/order-confirmation.tsx` và các component checkout vẫn gọi `formatConvertedPrice`/formatter frontend thay vì render formatted fields từ response.
- [ ] **Các component catalog:** `components/ProductCard.tsx`, `CategoryProductsList.tsx`, `QuickViewModal.tsx` và `SearchDropdown.tsx` vẫn dùng `formatConvertedPrice` để hiển thị giá sản phẩm.
- [ ] **Thông báo đơn hàng:** `components/admin/NotificationBell.tsx:41-43` vẫn format giá cục bộ cho đơn đang chờ xử lý.
- [ ] **Bổ sung test/UI:** chưa có kiểm thử xác nhận toàn bộ consumer trên locale tiếng Việt và locale dùng dấu chấm thập phân sau khi chuyển sang formatted fields.
- [ ] **Type và adapter frontend:** `online-store-frontend/src/lib/data.ts:5-29` và `src/lib/adapters.ts:59-174` mới khai báo/map `price` và `originalPrice` dạng số, chưa có `formattedPrice`/`formattedOriginalPrice`; cần bổ sung contract trước khi chuyển các component catalog.
- [ ] **Realtime product payload:** `online-store-backend/src/controllers/productController.js:464-473, 649-658, 741-750` broadcast `price` raw; cần bổ sung formatted fields nếu payload được dùng để hiển thị trực tiếp ở frontend.
- [ ] **Realtime order/coupon payload:** `online-store-backend/src/controllers/orderController.js:554-563` broadcast `totalPrice` raw; `couponController.js:262-274, 376-388` broadcast `discountValue` và `minOrderAmount` raw. Raw fields vẫn phải giữ, nhưng payload hiển thị cần có formatted fields tương ứng.
- [ ] **Calculate coupon response:** `online-store-backend/src/controllers/couponController.js:586-604` đã format một số amount nhưng `discountValue` fixed vẫn chưa có `formattedDiscountValue`; cần kiểm tra frontend consumer trước khi hoàn tất contract.
- [ ] **Export/import product:** `online-store-backend/src/controllers/productImportController.js:1011-1021` chỉ serialize `price`/`originalPrice` raw. Đây không nhất thiết là lỗi nếu chỉ phục vụ dữ liệu máy đọc, nhưng cần xác nhận không bị dùng làm output hiển thị.

Các vị trí sau chỉ là dữ liệu nghiệp vụ hoặc số liệu không phải tiền, không đánh dấu là lỗi format:

- Payload tạo đơn tại `online-store-frontend/src/lib/api.ts:1243-1275`, `CartContext.tsx:57-104`, `checkout/Step2Payment.tsx:45-58` và `checkout/Step5OrderReview.tsx:51-92` phải giữ amount dạng số để tính toán/gửi API.
- `i18nMonitoring.tsx` dùng `toFixed()` cho phần trăm, mili-giây và MB; rating dùng `toFixed()` cũng không thuộc phạm vi tiền tệ.

Các nguyên tắc cần giữ khi xử lý:

- Giữ trường số gốc cho tính toán, sắp xếp và payload nghiệp vụ.
- Chuyển từng vị trí **hiển thị** sang trường `formatted*` tương ứng.
- Chỉ thu hẹp hoặc xóa formatter frontend sau khi toàn bộ consumer liên quan đã chuyển đổi và kiểm thử.

## Kiểm thử cần có khi tiếp tục triển khai

- Tỷ giá: `10.85`, `10.85000000`, `0.000041`, `0.00003772`.
- Currency có `decimalPlaces` bằng `0`, `2` và lớn hơn `2`.
- Locale tiếng Việt, locale dùng dấu chấm thập phân, request có/không có `lang`.
- Đảm bảo các trường nghiệp vụ như `rate`, `amount`, `convertedAmount` và `total` vẫn là `number`.
- Kiểm tra các màn hình product, cart/checkout, coupon, statistics và admin exchange rate trên desktop/mobile.

## Tóm tắt rà soát bổ sung

- REST product API đã trả `formattedPrice` và `formattedOriginalPrice`; frontend còn thiếu hai field này trong `Laptop` và `ProductAdapter`, nên catalog chưa thể dùng contract API đầy đủ.
- `Step1Combined.tsx` đang tạo lại object coupon và làm mất các field `formatted*`; cần giữ lại để checkout render từ response backend.
- Type coupon frontend còn thiếu `formattedMinOrderAmount`.
- Payload realtime product, order và coupon vẫn chỉ broadcast số raw; bổ sung formatted fields nếu payload được dùng trực tiếp để hiển thị.
- `calculateDiscount` đã format amount của đơn hàng nhưng coupon fixed còn thiếu `formattedDiscountValue`; field này cần format theo currency của coupon.
- Test formatter hiện có nền tảng locale và decimal places, nhưng nên bổ sung test `formatProducts`, currency có hơn 2 chữ số thập phân và response theo `req.lang`.

Thứ tự đề xuất: cập nhật type/adapter product → chuyển catalog sang formatted fields → giữ formatted coupon trong checkout → hoàn tất realtime contract → bổ sung kiểm thử UI và backend.
