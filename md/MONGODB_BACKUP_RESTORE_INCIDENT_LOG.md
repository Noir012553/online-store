# Nhật ký sự cố và kiểm tra backup/restore MongoDB

## Mục đích

Ghi lại các lỗi trong quá trình tạo, kiểm tra và đánh giá phạm vi backup phục vụ retranslation; phân biệt ZIP sáu collection hiện tại với luồng backup toàn bộ database được bổ sung sau đó.

## Kết luận trạng thái

- ZIP `online-store-backup-2026-10-03T02-49-41-838Z.zip` là backup của **6 collection phục vụ retranslation sản phẩm**, không phải full database.
- ZIP có 13 entry: 6 file BSON nén, 6 file metadata nén và `prelude.json.gz`.
- Tất cả 6 BSON đã được `bsondump` parse; số bản ghi khớp số lượng từ lần dump. Tổng số là **113.381 tài liệu**.
- ZIP này chưa được restore thử vào MongoDB.
- Đã thêm script riêng để tạo archive cho toàn bộ collection của **database trong `MONGO_URI`**; full backup đã chạy thành công.
- Archive full đã được restore thật vào database test `online-store_restore_test`: **128.068 tài liệu restored, 0 lỗi**; log cũng ghi nhận restore index.
- Chưa đối chiếu độc lập danh sách collection, số lượng từng collection và index giữa database nguồn với database test; restore thành công chưa tự nó chứng minh dữ liệu hai bên giống hệt nhau.

## Sự cố và cách xử lý

### MongoDB Database Tools và PATH

Ban đầu `mongodump` không được tìm thấy (`spawnSync mongodump ENOENT`). Người dùng cài MongoDB Database Tools `100.19.1`; việc cập nhật Machine PATH bị từ chối quyền, sau đó cập nhật User PATH. Nếu terminal/Node được mở trước lúc cập nhật PATH, tiến trình có thể vẫn không nhận PATH mới; cần mở terminal mới và xác nhận `mongodump.exe --version` trước khi chạy script.

### API archiver không tương thích

Lần dump đầu tạo xong dữ liệu sáu collection nhưng ZIP thất bại với `archiver is not a function`. Phiên bản `archiver` cài đặt xuất `ZipArchive` class thay vì callable factory. Script được đổi sang `new ZipArchive(...)`; thêm `--zip-existing=<rawDirectory>` để đóng gói lại dump đang có mà không kết nối/dump database lần nữa.

### Lỗi cú pháp khi kiểm tra bằng PowerShell

- `node -e '...'` làm mất dấu nháy trong JavaScript khi PowerShell chuyển đối số cho Node. Dùng here-string truyền qua pipe vào `node` để giữ nguyên nội dung.
- `bsondump --gzip` không được phiên bản cài đặt hỗ trợ. Phải giải nén GZIP trước bằng `.NET GZipStream`, sau đó mới gọi `bsondump` trên file BSON.
- Chuỗi PowerShell `"$name: ..."` gây lỗi parser vì dấu hai chấm theo sau biến. Dùng `"${name}: ..."`.
- Trong PowerShell interactive, nhập `else` riêng sau khi khối `if` đã kết thúc tạo lỗi `else is not recognized`; không ảnh hưởng tới backup đã hoàn tất.
- Lần kiểm tra cú pháp đầu tiên của các script full backup/restore bắt được khai báo `fs` trùng; đã bỏ khai báo thừa. Kiểm tra cú pháp Node và parse `package.json` sau đó thành công.
- Full backup ban đầu thất bại với `mongodump ... provide only one MongoDB connection string`. Nguyên nhân xác nhận từ file trong `copy 39`: `--archive` và đường dẫn được truyền tách rời, khiến đường dẫn bị hiểu thành positional argument. Đã cập nhật cả backup/restore sang `--archive=<path>`; sau khi áp dụng sửa đổi trên máy người dùng, full dump chạy thành công.
- Những lần backup thất bại không tạo archive. Các lệnh PowerShell phía sau nhận `$archive` rỗng và lỗi khi đọc `.FullName`; lệnh restore không bắt đầu và không ghi dữ liệu vào database.

## Phạm vi ZIP sáu collection

Script `online-store-backend/scripts/backup-retranslation-data.js` lấy collection name từ các model đã chọn rồi chạy `mongodump` riêng cho từng collection. Kết quả đã kiểm tra:

| Collection | BSON đã parse |
|---|---:|
| `products` | 618 |
| `product_catalog_translation_cache` | 4.896 |
| `livetranslationcaches` | 49.650 |
| `translationqualitylogs` | 8.890 |
| `retranslationprogresses` | 49.327 |
| `retranslationrunlocks` | 0 |
| **Tổng** | **113.381** |

Người dùng liệt kê 52 collection trong database; ZIP chỉ có sáu collection trên. Một số collection không nằm trong ZIP nhưng có dữ liệu, ví dụ `orders`, `customers`, `reviews`, `spec_key_translation_cache`, `categories` và `statictranslations`. Các mục `NO` trong bảng kiểm kê chỉ nghĩa là không có trong ZIP, không có nghĩa dữ liệu đã bị xóa.

Các collection được dump tuần tự, không phải snapshot nguyên tử giữa các collection. Việc parse BSON và khớp số lượng xác nhận tính đọc được và số lượng theo log dump, nhưng không thay cho thử restore.

## Luồng full backup/restore mới trong code

Các lệnh mới trong `online-store-backend/package.json`:

- `npm run backup:full-database`: chạy `scripts/backup-full-database.js`, tạo file `<database>-full-backup-<timestamp>.archive.gz` trong `online-store-backend/backups/` bằng `mongodump --archive --gzip`.
- `npm run restore:full-database`: chạy `scripts/restore-full-database.js`; dùng nguyên `MONGO_URI` để giữ cơ chế xác thực, kiểm tra database đích rỗng bằng `useDb`, rồi remap namespace sang tên kết thúc bằng `_restore_test`. Script yêu cầu xác nhận database đích và chọn đúng một cờ `--dry-run` hoặc `--apply`; không dùng `--drop`.

Phạm vi “full” ở đây là toàn bộ collection của **một database ứng dụng được chỉ định trong `MONGO_URI`**. Nó không dump mọi database trên MongoDB server, không bao gồm database hệ thống hoặc cấu hình/secret bên ngoài database. Không được gọi ZIP sáu collection là full backup.

### Trạng thái chạy

- Các script full backup/restore đã qua `node --check`; `package.json` parse hợp lệ.
- Đã gọi restore script không có `--apply` và xác nhận script dừng trước khi kết nối database với thông báo yêu cầu `--apply`.
- Full dump thành công sau khi sửa cách truyền `--archive`; file được tạo: `online-store-full-backup-2026-10-03T05-44-17-079Z.archive.gz`, dung lượng **29.928.618 bytes**. Log `mongodump` cho thấy đã dump collection trong database `online-store`.
- Lần dry-run đầu dừng ở preflight vì `.env` chỉ có `MONGO_URI`, không có `MONGO_RESTORE_URI`; không có dữ liệu được ghi. Script được chỉnh để không yêu cầu biến môi trường mới.
- Khi đổi URI path sang database test, dry-run báo `bad auth` do thay đổi thông tin database có thể làm thay đổi cơ chế `authSource`. Đã sửa bằng cách giữ nguyên `MONGO_URI` và chỉ dùng namespace remapping để ghi vào `online-store_restore_test`.
- Dry-run thành công: archive liệt kê 52 collection cùng metadata và remap từ `online-store.*` sang `online-store_restore_test.*`; `0 document(s) restored` là kết quả đúng cho chế độ dry-run. Có cảnh báo không chặn về cờ `--db`/`--collection` deprecated.
- Restore thật vào database test rỗng hoàn tất: `128068 document(s) restored successfully. 0 document(s) failed to restore.` Log ghi nhận các collection và index được restore; script kết thúc với `Restore completed into empty staging database: online-store_restore_test`.
- Database test nằm trên cùng MongoDB host với nguồn, nhưng là database riêng; thao tác restore đã remap namespace và không dùng `--drop`. Nó chiếm thêm dung lượng trên cùng host.
- Còn bước xác minh sau restore: đối chiếu collection, số lượng từng collection và index giữa nguồn với bản test. Archive được dump theo từng collection, không phải snapshot nguyên tử; so khớp hiện tại cần tính đến dữ liệu nguồn có thể thay đổi sau thời điểm backup.

## Lệnh hiện có

Backup toàn database ứng dụng:

```powershell
npm run backup:full-database
```

ZIP cũ sáu collection retranslation vẫn được giữ riêng:

```powershell
npm run backup:retranslation
```

Không restore đè database nguồn. Chỉ restore thử vào database mới kết thúc bằng `_restore_test`, xác nhận target rỗng và review đúng file archive.
