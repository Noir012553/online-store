# Issue 2: Product stats HTTP 500

## Vấn đề

`GET /api/products/stats/overview` từng trả HTTP 500 vì request chỉ gửi `lang` nhưng backend yêu cầu currency báo cáo.

Một số toast upload ảnh và lỗi API cũng chưa đi qua hệ thống dịch nên có thể hiển thị sai ngôn ngữ hoặc rỗng.

## Cách xử lý

- Backend tự chọn currency active mặc định khi request không truyền `currency`.
- Currency không hợp lệ trả HTTP 400.
- Toast upload dùng translation key theo locale.
- Error handler dùng translator dùng chung thay vì phụ thuộc literal tiếng Anh.

## Đã hoàn thành

- Stats có currency hợp lệ trả HTTP 200.
- Stats không truyền currency vẫn fallback và trả HTTP 200.
- Currency `ZZZ` trả HTTP 400.
- Common translations trả HTTP 200.
- Sáu khóa toast upload/xác thực ảnh đã có bản dịch.

## Còn lại

- Các môi trường triển khai cần bảo đảm currency mặc định active được cấu hình.
- Các endpoint khác vẫn cần tuân thủ contract locale và error code chung.

## Trạng thái

**Hoàn thành trong phạm vi product stats, currency fallback và toast liên quan.**
