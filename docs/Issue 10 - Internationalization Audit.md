# Issue 10: Audit đa ngôn ngữ

## Mục tiêu

Đảm bảo UI, API, lỗi nghiệp vụ, email và dữ liệu hiển thị tuân theo locale hiện tại; frontend không phụ thuộc vào việc phân tích câu lỗi đã dịch.

## Đã hoàn thành

- Checkout chuyển từ `error.message.includes(...)` sang mã lỗi ổn định.
- Các lỗi order chính đã có `code` và message theo locale.
- Rate limit và validation middleware trả code, message dịch và thông tin retry.
- RoleBadge, banner translation, Cloudinary upload và các fallback frontend đã dùng i18n/code phù hợp.
- Translation status trả mã dữ liệu thay vì nhãn cố định.
- Exchange-rate stats trả số ngày dạng số, không ghép chuỗi tiếng Anh.
- Payment error giữ `params` khi đi qua API boundary.
- Payment debug route được giới hạn và không trả raw error/stack user-facing.
- CSV/JSON import trả mã lỗi ổn định thay vì raw message.
- Email development dùng code và message theo locale.

## Nguyên tắc chuẩn

API nên trả:

```json
{
  "code": "ORDER_CURRENCY_NOT_FOUND",
  "params": { "currencyCode": "EUR" },
  "message": "..."
}
```

Frontend xử lý theo `code`, không parse `message`. Chi tiết provider/hệ thống chỉ ghi log server, không trả thẳng cho người dùng.

## Còn lại

- Payment boundary cần hoàn thiện contract locale ở các nhánh còn lại.
- Currency/exchange-rate cần xác nhận đầy đủ contract lỗi và `params` sau khi cart/checkout summary của `issue-11` sẵn sàng.
- Các boundary còn lại cần tiếp tục xác minh để bảo đảm middleware lỗi chung dùng contract `code`, `params`, `message` và không lộ raw provider error.
- Các response lỗi trực tiếp tại language, shipping, product upload và Cloudflare middleware đã chuyển sang contract chung; tiếp tục rà soát các boundary khác.
- Import/export và email đã có các path theo `code`; cần rà soát nhánh ngoại lệ và xác minh xuyên locale.
- Cần chuẩn hóa cùng một error path cho nhiều locale, gồm locale không-Latin.

## Thứ tự triển khai

1. Liệt kê từng error path còn mở của payment, currency và generic fallback; xác định `code`, `params` và trường locale/currency cần truyền.
2. Hoàn thiện payment và currency sau các API summary của `issue-11`, để không tạo contract tiền tệ song song ở frontend.
3. Rà soát các nhánh ngoại lệ import/export và email, bảo đảm không lộ raw provider error hoặc stack.
4. Chạy cùng error path với một locale Latin và một locale không-Latin; frontend chỉ kiểm tra `code` và `params`.

## Checklist hoàn tất audit

- Payment, currency, import/export và email trả lỗi theo cùng cấu trúc `code`, `params`, `message`; không trả raw provider error hoặc stack cho client.
- Mọi request nghiệp vụ liên quan truyền nhất quán `lang`, `locale` và `currencyCode` khi cần.
- Kiểm thử cùng error path với một locale Latin và một locale không-Latin; frontend chỉ dựa vào `code` và `params`.
- Log nội bộ có thể giữ thông tin kỹ thuật cần thiết nhưng không được trở thành nội dung hiển thị cho người dùng.

## Trạng thái

**Đang hoàn thiện audit.** Các boundary chính đã trả contract `code`, `params`, `message`; middleware lỗi chung dùng thông báo generic mặc định và không lộ raw error. Payment/currency, các nhánh ngoại lệ và kiểm thử xuyên locale vẫn cần xác minh.
