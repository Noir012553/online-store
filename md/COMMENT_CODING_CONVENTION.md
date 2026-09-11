# Quy ước comment trong code

## 1. Mục đích

Quy ước này được xây dựng từ tài liệu **Devcamp Coding Convention 07.2021**, **Javascript Coding Convention 05.2021** và **HTML Coding Convention 05.2021**, sau đó điều chỉnh để phù hợp với codebase hiện tại.

Mục tiêu:

- Code tự giải thích bằng tên hàm, biến và cấu trúc rõ ràng.
- Comment giúp hiểu nhanh nghiệp vụ, contract và giới hạn kỹ thuật.
- Giảm comment thừa, lỗi thời hoặc lặp lại đúng nội dung code.
- Hỗ trợ debug, review, bàn giao và bảo trì.

## 2. Nguyên tắc chung

### 2.1. Ưu tiên self-documenting code

Trước khi viết comment, hãy đặt tên hàm, biến và kiểu dữ liệu đủ rõ nghĩa.

```ts
const pendingOrderCount = orders.filter((order) => order.status === "pending").length;
```

Không cần thêm comment chỉ lặp lại nội dung:

```ts
// Count pending orders
const pendingOrderCount = orders.filter((order) => order.status === "pending").length;
```

### 2.2. Comment giải thích lý do, không mô tả lại câu lệnh

Nên comment khi cần giải thích:

- Quy tắc nghiệp vụ.
- Invariant hoặc điều kiện bắt buộc phải giữ.
- Giới hạn của thư viện, framework hoặc API bên ngoài.
- Side effect không thể hiện rõ qua tên hàm.
- Lý do một cách triển khai khác với cách thông thường.
- Input, output hoặc lỗi của một API public/phức tạp.

```ts
// Webhook phải trả HTTP 200 sau khi xác thực để nhà cung cấp không gửi lại cùng một sự kiện.
return res.status(200).json({ received: true });
```

### 2.3. Comment phải được cập nhật cùng code

Khi thay đổi hành vi, phải kiểm tra comment liên quan. Xóa comment đã lỗi thời; không giữ comment chỉ để lưu lịch sử thay đổi. Lịch sử đó thuộc về Git và pull request.

### 2.4. Comment dùng cùng ngôn ngữ với codebase

Codebase sử dụng tiếng Anh cho tên code, API và thư viện. Comment mới nên viết bằng tiếng Anh, trừ khi đang bổ sung hoặc sửa tài liệu nghiệp vụ nội bộ bằng tiếng Việt.

## 3. Quy định theo loại comment

### 3.1. Inline comment ngắn

Dùng `//` cho comment ngắn từ một đến ba dòng, đặt ngay trước đoạn code liên quan.

```ts
// Keep the original order to match the payment provider's signature payload.
const payload = buildSignaturePayload(order);
```

Không đặt comment ở cuối dòng nếu comment làm dòng code khó đọc. Chỉ dùng inline cuối dòng cho giá trị ngắn và không gây nhầm lẫn.

```ts
const DEFAULT_PAGE_SIZE = 20; // API giới hạn tối đa 20 bản ghi mỗi trang
```

### 3.2. Block comment

Dùng `/* ... */` cho khối giải thích dài hơn ba dòng hoặc khi cần mô tả một đoạn code lớn. Không dùng nhiều dòng `//` chỉ để thay thế một block comment.

```ts
/*
 * The provider may send the same notification more than once.
 * The transaction checks the event identifier before changing the order state.
 */
```

Block comment không được dùng để che tạm code lỗi. Code không dùng phải được xóa hoặc xử lý rõ ràng.

### 3.3. JSDoc cho function, method và API public

Dùng JSDoc khi function/method:

- Được gọi từ nhiều module.
- Là controller, service, adapter hoặc utility dùng chung.
- Có input/output không hiển nhiên.
- Có side effect, lỗi đặc biệt hoặc điều kiện giới hạn.

Không bắt buộc viết JSDoc cho function private đơn giản mà tên và kiểu dữ liệu đã đủ rõ.

Mẫu TypeScript/JavaScript:

```ts
/**
 * Creates a Cloudinary signature for a server-approved upload.
 *
 * @param params Upload parameters approved by the backend.
 * @returns The signature payload sent to the frontend.
 * @throws If the selected Cloudinary account is not configured.
 */
function createUploadSignature(params: UploadParams): UploadSignature {
  // ...
}
```

Nếu function không trả về giá trị, không cần thêm `@returns`. Chỉ thêm `@throws` khi lỗi là một phần của contract mà caller cần biết.

### 3.4. Format mô tả input/output theo tài liệu Devcamp

Với function xử lý luồng phức tạp, phải mô tả rõ việc function làm gì, input/start và output/end.

```ts
/**
 * Displays translated products and preserves the selected locale.
 *
 * @param products Product data returned by the API.
 * @param locale Locale used to render product labels.
 * @returns Render-ready product rows.
 */
function buildProductRows(products: Product[], locale: Locale): ProductRow[] {
  // ...
}
```

Không thêm các dòng `@param` hoặc `@returns` nếu chúng chỉ lặp lại tên tham số và kiểu dữ liệu mà TypeScript đã thể hiện rõ.

### 3.5. TODO và FIXME

`TODO`, `FIXME`, `HACK` phải nêu lý do và điều kiện hoàn tất. Nếu có issue, ghi mã issue.

```ts
// TODO(PROJ-123): Replace polling with the provider webhook after shipment events are available.
```

Không thêm TODO chung chung:

```ts
// TODO: fix this later
```

Không dùng TODO để trì hoãn việc xử lý lỗi bảo mật, dữ liệu sai hoặc lỗi có thể làm hỏng luồng chính.

### 3.6. Comment deprecated

Khi đánh dấu code deprecated, phải ghi API thay thế và điều kiện hoặc phiên bản dự kiến xóa.

```ts
/**
 * @deprecated Use createShipmentLabel instead. Remove after all callers migrate.
 */
function createLegacyLabel() {
  // ...
}
```

## 4. Function comment theo Devcamp

Tài liệu Devcamp yêu cầu comment function gồm:

1. Function làm gì.
2. `input/start`: tham số đầu vào hoặc trạng thái ban đầu.
3. `output/end`: kết quả trả về hoặc trạng thái cuối.

Quy tắc này áp dụng bắt buộc cho function public hoặc function có luồng nghiệp vụ phức tạp. Với function đơn giản, self-documenting code được ưu tiên hơn comment mẫu máy móc.

Ví dụ tốt:

```js
/**
 * Applies a successful payment response to the order.
 *
 * Input/start:
 * - paymentResponse: response đã được xác thực từ payment provider.
 * - order: đơn hàng đang ở trạng thái chờ thanh toán.
 *
 * Output/end:
 * - order được chuyển sang trạng thái đã thanh toán.
 * - ghi nhận mã giao dịch của provider.
 */
function applyPaymentResult(paymentResponse, order) {
  // ...
}
```

## 5. Region trong JavaScript cũ

Tài liệu Devcamp đề xuất bốn vùng:

```js
/*** REGION 1 - Global variables */
/*** REGION 2 - Event bindings */
/*** REGION 3 - Event handlers */
/*** REGION 4 - Common functions */
```

Quy định áp dụng:

- Có thể giữ region trong các file JavaScript cũ đã tổ chức theo pattern này.
- Không tự thêm region vào component React/TypeScript mới.
- Không dùng region để che giấu một file quá dài hoặc thay thế việc tách module.
- Không thêm comment mô tả từng function nếu tên function đã rõ nghĩa.

## 6. HTML comment

Dùng comment HTML để giải thích cấu trúc hoặc lý do đặc biệt, không dùng để mô tả từng thẻ hiển nhiên.

```html
<!-- Keep this wrapper for the payment provider's required form submission target. -->
<form id="payment-form">
  <!-- ... -->
</form>
```

Không đưa thông tin bí mật, token, API key hoặc dữ liệu cá nhân vào HTML comment vì comment vẫn được gửi tới trình duyệt.

## 7. Comment không được phép

Không thêm các loại comment sau:

```ts
// Set loading to true
setLoading(true);
```

```ts
// Loop through products
for (const product of products) {
  // Code đã tự thể hiện rõ ý nghĩa.
}
```

```ts
// Phase 3
// New fix
// Updated by developer
// Temporary code
```

Không dùng comment để:

- Ghi tên người viết hoặc ngày sửa code.
- Ghi lịch sử triển khai, số phase hoặc thông tin đã có trong Git.
- Giải thích cú pháp JavaScript/TypeScript cơ bản.
- Che lỗi lint, lỗi type hoặc code chưa hoàn thiện.
- Lưu lại đoạn code cũ đã xóa.
- Ghi thông tin nhạy cảm.

## 8. Checklist khi review

- Comment có giải thích lý do hoặc contract thay vì lặp lại code không?
- Tên biến và tên function đã đủ rõ để bỏ comment chưa?
- Comment có còn đúng với hành vi hiện tại không?
- Function public/phức tạp đã mô tả input, output và side effect cần thiết chưa?
- TODO/FIXME có issue hoặc điều kiện hoàn tất chưa?
- Comment có tiết lộ secret, token, dữ liệu cá nhân hoặc thông tin nội bộ không?
- Có thể thay comment bằng cách tách function hoặc đặt tên rõ hơn không?

## 9. Tóm tắt quy tắc bắt buộc

1. Viết code tự giải thích trước khi viết comment.
2. Comment cho **why**, nghiệp vụ, contract, giới hạn và side effect.
3. Dùng `//` cho comment ngắn; dùng `/* ... */` cho block dài.
4. Dùng JSDoc cho API public và function phức tạp.
5. TODO/FIXME phải có ngữ cảnh và điều kiện hoàn tất.
6. Xóa comment lỗi thời, dư thừa hoặc chỉ mô tả code hiển nhiên.
7. Chỉ giữ region ở code cũ khi nó thực sự giúp định hướng file.
8. Không ghi secret hoặc dữ liệu nhạy cảm trong comment.
