# Điều tra product detail bị loading liên tục

## Trạng thái

- Đã xác nhận đầy đủ hiện tượng trong môi trường frontend local.
- Chưa sửa mã nguồn trong tài liệu này.
- URL kiểm tra:

```text
http://localhost:3000/product/6a8ddac9c4e6879f6c9f3664
```

## Kết luận ngắn

Đây không phải F5/reload toàn trang, không phải HTTP 503 và không phải backend product detail timeout trong lần đo gần nhất.

Nguyên nhân quan sát được là product detail request bị frontend hủy và tạo lại nhiều lần. UI chỉ tắt loading sau khi product detail, related products và reviews chạy qua cùng một flow. Vì related products mất hơn 8 giây và effect product bị chạy lại nhiều lần, người dùng có cảm giác trang loading liên tục.

## Bằng chứng Playwright

### Không có F5 thật

Kết quả:

```text
Document requests: 1
```

Chỉ có một request tải toàn bộ document. Vì vậy không có bằng chứng trình duyệt reload trang liên tục.

Có hai navigation event:

```text
[NAVIGATION] ... /product/6a8ddac9c4e6879f6c9f3664
[NAVIGATION] ... /product/6a8ddac9c4e6879f6c9f3664
```

Hai event này xảy ra trong lúc Next.js khởi tạo nhưng không tạo thêm document request; không nên xem chúng là F5.

### Product detail bị gọi lại nhiều lần

```text
Product detail requests: 10
Product detail responses: 1
Product detail failures: 9
```

Chín request bị hủy với:

```text
net::ERR_ABORTED
externalAborted: true
name: AbortError
```

Thời gian của các request bị hủy:

```text
32ms, 49ms, 158ms, 169ms, 172ms,
444ms, 561ms, 581ms, 1171ms
```

Đây không phải timeout 30 giây. `externalAborted: true` chứng minh request bị hủy bởi `AbortSignal` từ component.

Request cuối cùng thành công:

```text
GET /api/products/6a8ddac9c4e6879f6c9f3664?lang=vi&locale=vi-VN&currencyCode=VND
HTTP 200
3127ms
```

### Backend và các API phụ vẫn phản hồi

```text
POST /api/users/refresh                         204   1658ms
GET  /api/products/:id                         200   3127ms
GET  /api/products/:id/translations             200   409ms
GET  /api/reviews/products/:id/reviews          200   1335ms
```

Không ghi nhận:

```text
500
502
503
504
429
```

## Bằng chứng trạng thái UI

Trong 60 giây theo dõi:

```text
+2s  hasProductSkeleton: true
+4s  hasProductSkeleton: true
+8s  hasProductSkeleton: true
+18s hasProductSkeleton: false
```

Tại thời điểm khoảng 18 giây, DOM đã có nội dung product:

```text
Bàn phím Razer Huntsman V3 Pro
Thông số kỹ thuật
```

Điều này cho thấy loading không vô hạn tuyệt đối trong lần kiểm tra này; nó bị kéo dài bởi request bị hủy/lặp và request related products.

## Luồng code liên quan

### 1. Product effect hủy request cũ

File:

```text
online-store-frontend/src/pages/product/[id].tsx:204-310
```

Effect tạo `AbortController`, sau đó hủy controller trong cleanup:

```tsx
const controller = new AbortController();

return () => {
  controller.abort();
  reviewAbortControllerRef.current?.abort();
};
```

Mỗi khi dependency của effect thay đổi, cleanup chạy và request product hiện tại nhận `AbortError`.

### 2. Dependency của product effect không ổn định

Effect hiện phụ thuộc vào:

```tsx
[
  currencyCode,
  id,
  isHydrated,
  loadReviews,
  locale,
  router.isReady,
  t,
]
```

Nguồn: `online-store-frontend/src/pages/product/[id].tsx:310`.

Trong đó `t` được tạo lại khi các state translation thay đổi:

```text
online-store-frontend/src/lib/context/LanguageContext.tsx:560-620
```

Dependency của `t` gồm:

```text
locale
loadedTranslations
fallbackTranslations
loadingNamespaces
```

Product page cũng chủ động tải namespace khi mount:

```text
online-store-frontend/src/pages/product/[id].tsx:104-107
```

```tsx
loadNamespace('products');
loadNamespace('product-ui');
```

Khi namespace bắt đầu/kết thúc tải, các state translation đổi và có thể làm `t` đổi identity.

### 3. `loadReviews` cũng kéo theo `t`

`loadReviews` được tạo bằng `useCallback` với dependency:

```text
online-store-frontend/src/pages/product/[id].tsx:144-188
```

```tsx
}, [locale, t]);
```

Vì product effect phụ thuộc vào `loadReviews`, chỉ cần `t` thay đổi thì effect product vẫn có thể chạy lại ngay cả khi loại bỏ trực tiếp `t` khỏi dependency.

Chuỗi dependency là:

```text
t thay đổi
→ loadReviews thay đổi
→ product effect chạy lại
→ cleanup gọi controller.abort()
→ product request bị ERR_ABORTED
→ effect mới gọi setIsLoading(true)
```

### 4. Loading chính chỉ tắt ở cuối toàn bộ flow

File:

```text
online-store-frontend/src/pages/product/[id].tsx:218-301
```

Thứ tự hiện tại:

```text
1. getProductById
2. getProducts cho related products
3. loadReviews
4. setIsLoading(false)
```

`setIsLoading(true)` được gọi ngay trước product request tại `:227-229`.

`setIsLoading(false)` chỉ được gọi trong `finally` tại `:297-300` và chỉ khi request vẫn là request hiện tại:

```tsx
if (isCurrentRequest()) {
  setIsLoading(false);
}
```

Nếu request cũ bị abort sau khi effect mới đã tăng `productRequestIdRef`, `isCurrentRequest()` trả về false và request cũ không được phép tắt loading.

### 5. Related products có timeout ngắn hơn backend flow

Related products được gọi với:

```text
online-store-frontend/src/pages/product/[id].tsx:249-273
```

```tsx
{
  signal: controller.signal,
  timeout: 8000,
  skipErrorToast: true,
}
```

Trong khi backend `/api/products` còn có các bước tuần tự:

```text
countDocuments: application timeout 8s
Product.find:   application timeout 12s
translation/category/currency formatting: thêm thời gian
```

Kết quả test ghi nhận related request bị hủy sau:

```text
8486ms
```

Sau lỗi related, code vẫn tiếp tục gọi reviews và chỉ kết thúc loading sau toàn bộ flow.

## Translation product chạy trước product detail

File:

```text
online-store-frontend/src/hooks/useProductTranslation.ts:16-34
```

Hook được bật chỉ với điều kiện:

```tsx
enabled: !!productId && isHydrated
```

Nó không chờ product detail thành công.

Trong lần test:

```text
/products/:id/translations → 200 trong 409ms
/products/:id              → 200 trong 3127ms
```

Hook còn dùng `fetch` trực tiếp, không có timeout hoặc signal từ product detail. Đây là request phụ cần tách khỏi lifecycle product detail.

## Refresh token

Trong lần test gần nhất chỉ có:

```text
POST /api/users/refresh → 204 trong 1658ms
```

Không có refresh failure và không có 429. Refresh token không phải nguyên nhân của loading liên tục trong phép đo này.

## Mức độ chắc chắn

### Đã xác nhận 100%

- Không có F5 thật trong lần đo.
- Không có HTTP 503/500/502/504/429.
- Backend product detail cuối cùng trả HTTP 200.
- Có 9 product detail request bị frontend hủy.
- Các request bị hủy do external `AbortSignal`, không phải timeout nội bộ.
- UI giữ skeleton trong khoảng 18 giây trước khi hiển thị product.
- Loading chính bị ràng buộc vào cả related products và reviews.

### Nguyên nhân gốc có bằng chứng rất mạnh

Dependency chain `t → loadReviews → product effect` phù hợp với code và hoàn toàn giải thích chuỗi abort/retry quan sát được.

Để chứng minh riêng từng lần effect rerun, cần thêm instrumentation tạm thời cho mount/cleanup của product effect hoặc kiểm tra React DevTools Profiler. Tuy nhiên không cần thêm bằng chứng để khẳng định đây là vấn đề lifecycle frontend cần xử lý.

## Hướng sửa đề xuất

1. Tắt loading chính ngay sau khi `getProductById` thành công.
2. Tải related products và reviews với state loading riêng.
3. Tách load reviews thành effect/callback độc lập, không để `loadReviews` kích hoạt lại product effect.
4. Không dùng `t` làm dependency trực tiếp của effect tải product.
5. Chỉ gọi product translation sau khi product detail thành công.
6. Truyền timeout/signal thống nhất cho translation hook.
7. Khi related products lỗi hoặc timeout, vẫn giữ product chính hiển thị.
8. Khi locale/currency thay đổi, chỉ tải lại product một lần theo dependency dữ liệu thực sự cần thiết.

## Tiêu chí kiểm tra sau khi sửa

Mở cùng product URL trong Playwright và kỳ vọng:

```text
Document requests: 1
Product detail requests: 1
Product detail failures: 0
Product detail response: 200
hasProductSkeleton: false sau khi product detail thành công
hasProductContent: true
Refresh failures: 0
```

Related products có thể thất bại hoặc timeout nhưng không được làm product chính quay lại skeleton/loading.
