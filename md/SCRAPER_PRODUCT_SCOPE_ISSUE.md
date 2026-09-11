# Vấn đề phạm vi sản phẩm khi cào dữ liệu

## Bối cảnh

Hệ thống chỉ kinh doanh các nhóm sản phẩm thuộc taxonomy danh mục đã cấu hình. Khi scraper lấy dữ liệu từ GearVN, một số sản phẩm ngoài phạm vi vẫn bị đưa vào danh sách xử lý.

Các URL đã ghi nhận:

- `https://gearvn.com/products/phan-mem-windows-11-home-online-dwnld-nr-kw9-00664`
- `https://gearvn.com/products/phan-mem-windows-11-pro-online-dwnld-nr-fqc-10572`
- `https://gearvn.com/products/may-choi-game-msi-claw-a1m`
- `https://gearvn.com/products/may-choi-game-cam-tay-lenovo-legion-go`

Các nhóm trên không thuộc sản phẩm được kinh doanh và không được xuất hiện trong dữ liệu cửa hàng.

## Nguyên nhân

- Nhiều scraper trước đây lấy mọi anchor có đường dẫn `/products/` trên trang collection.
- Link trong khu vực sản phẩm liên quan, đề xuất hoặc sản phẩm chéo có thể bị xem như sản phẩm của collection hiện tại.
- Mỗi scraper từng có cách lấy link và phân loại riêng.
- Một số scraper có fallback danh mục mơ hồ như `Laptop`.
- Lớp seed trước đây mới chỉ kiểm tra dữ liệu sau khi scraper đã lấy sản phẩm.

## Yêu cầu bắt buộc

- Không dùng danh sách tên sản phẩm cụ thể để xử lý lâu dài.
- Không dùng denylist cố định cho từng sản phẩm như Windows, Legion Go hoặc MSI Claw.
- Phải xác định loại sản phẩm theo dữ liệu động từ collection và metadata trang sản phẩm.
- Phải có một helper dùng chung cho toàn bộ scraper.
- Sản phẩm không xác minh được taxonomy phải bị bỏ qua, không được đoán danh mục.
- Chỉ sản phẩm đã xác nhận đúng taxonomy mới được trích xuất chi tiết và ghi vào CSV/JSON.
- Seed vẫn phải có lớp kiểm tra cuối, đối chiếu category với `Category.name` và `Category.sourceNames` trong database.
- Không tự tạo danh mục mới từ dữ liệu crawler nếu category không tồn tại trong taxonomy hợp lệ.

## Luồng kiểm tra chuẩn

1. Trang collection được tải.
2. Chỉ lấy link trong product card/listing hợp lệ.
3. Loại link khác domain hoặc nằm trong vùng related/recommend/recent/upsell/bundle.
4. Tải trang sản phẩm để đọc JSON-LD, meta hoặc breadcrumb.
5. So khớp taxonomy sản phẩm với loại suy ra từ slug collection.
6. Nếu không khớp hoặc thiếu metadata cần thiết, bỏ qua sản phẩm.
7. Chỉ sản phẩm hợp lệ mới được trích xuất và ghi ra schema chung.
8. Seed đối chiếu category với taxonomy trong database trước khi import.

## Quy ước schema đầu ra

Mọi scraper phải dùng chung `PRODUCT_OUTPUT_FIELDS` trong `scraper_paths.py`:

- `Brand`
- `ID`
- `Name`
- `SKU`
- `Price_VND`
- `Regular_Price`
- `InStock`
- `Categories`
- `Attributes`
- `Description`
- `MainImage`
- `GalleryImages`
- `URL`

## Phạm vi thay đổi hiện tại

- Đã thêm collector dùng chung `collect_product_links()` trong `scraper_paths.py`.
- Đã tích hợp collector vào các scraper hiện có.
- Đã thêm kiểm tra `product_matches_collection()` trước bước trích xuất chi tiết.
- Log `Đang xử lý` chỉ xuất hiện sau khi sản phẩm vượt qua kiểm tra taxonomy.
- Seed dùng taxonomy lấy động từ collection `Category` trong database.
- Đã thêm test offline cho collector tại `test_scraper_paths.py`.

## Nguyên tắc an toàn vận hành

- Không chạy scraper thật trong quá trình kiểm thử nếu chưa được yêu cầu.
- Không tự động import dữ liệu chưa qua kiểm tra taxonomy.
- Không tự động di chuyển hoặc xóa sản phẩm cũ chỉ vì scraper hiện tại không còn trả về sản phẩm đó.
- Nếu metadata nguồn thay đổi làm không xác minh được taxonomy, dừng ở trạng thái bỏ qua và ghi log để kiểm tra thủ công.
