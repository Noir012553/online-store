# Rà soát crawl/import, giảm giá và trang Home

## Phạm vi kiểm tra

Luồng đã được kiểm tra với đầy đủ các trường crawler:

`Brand`, `ID`, `Name`, `SKU`, `Price_VND`, `Regular_Price`, `InStock`, `Categories`, `Attributes`, `Description`, `MainImage`, `GalleryImages`, `URL`.

## Vấn đề phát hiện và đã xử lý

### 1. Crawler chưa lấy ổn định cả giá bán và giá gốc

**Nguyên nhân:** Hàm trích xuất giá chỉ đọc nội dung văn bản của phần tử. Một số trang nguồn lưu giá trong thuộc tính như `data-product-regular-price`, `data-compare-at-price`, `data-product-sale-price`, `data-sale-price`, `data-price`, `content` hoặc `value`, nên `Regular_Price` bị rỗng dù trang có giá gốc.

**Đã sửa:**

- Bổ sung đọc giá từ các thuộc tính dữ liệu nêu trên.
- Bổ sung selector cho giá bán: `.sale-price`, `.price-sale`.
- Bổ sung selector cho giá gốc: `.old-price`, `.regular-price`, `.price-regular`.
- Không tự suy diễn giá gốc khi nguồn không công bố giá trước giảm; khi đó `Regular_Price` vẫn rỗng để tránh hiển thị phần trăm giảm sai.

Kết quả mapping giá:

- `Price_VND` → `Product.price`: giá bán sau giảm.
- `Regular_Price` → `Product.originalPrice`: giá gốc trước giảm.

### 2. `ID` và `URL` chưa được lưu vào Product sau khi import

**Nguyên nhân:** Pipeline dùng `URL` để khử trùng lặp khi thiếu `SKU`, nhưng Mongoose không có trường tương ứng nên hai giá trị nguồn không được lưu trong Product.

**Đã sửa:**

- `ID` → `sourceProductId`.
- `URL` → `sourceUrl`.
- Thêm hai trường này vào schema Product và validator import.
- `sourceUrl` chỉ chấp nhận URL `http` hoặc `https` hợp lệ.

Các trường còn lại được map như sau:

| Cột crawler | Trường Product |
| --- | --- |
| `Brand` | `brand` |
| `Name` | `name` |
| `SKU` | `sku` |
| `InStock` | `countInStock` |
| `Categories` | `category` |
| `Attributes` | `specs` |
| `Description` | `description` |
| `MainImage` | `image` |
| `GalleryImages` | `images` |

`InStock` hiện nhận `In Stock`, `Còn hàng`, `true` và `1`.

### 3. Phần trăm giảm giá đơn hàng chưa được snapshot đầy đủ

**Kết quả kiểm tra trước khi sửa:**

- Backend đã tính `discountPercentage` cho API sản phẩm theo công thức `(originalPrice - price) / originalPrice × 100`.
- Frontend chỉ hiển thị `discountPercentage` do API trả về; không phải nguồn quyết định dữ liệu.
- Backend tạo đơn từ giá Product trong cơ sở dữ liệu, không tin tổng tiền từ frontend.
- Backend đã tính số tiền giảm coupon trên server.
- Tuy nhiên mỗi `orderItem` chỉ lưu giá bán `price`, không lưu `originalPrice` và phần trăm giảm của sản phẩm. Vì vậy sau khi đặt hàng không thể hiển thị/chứng minh đúng mức giảm giá sản phẩm tại thời điểm đặt hàng.

**Đã sửa:**

- Khi tạo summary hoặc đơn hàng, backend tính từ hai giá Product và lưu snapshot vào `orderItems`:
  - `price`: giá bán.
  - `originalPrice`: giá gốc khi lớn hơn giá bán.
  - `discountPercentage`: phần trăm giảm, do backend tính.
- Response formatter trả thêm `formattedOriginalPrice` cho dòng đơn hàng có giá gốc.
- Khi báo cáo đơn hàng theo loại tiền tệ khác, `originalPrice` cũng được quy đổi và định dạng cùng với giá bán.

Giảm giá coupon vẫn là `Order.discount`/`appliedCoupon` và được backend tính riêng, không lẫn với giảm giá của từng sản phẩm.

## Kiểm tra điều kiện hiển thị sản phẩm Home

### Điều kiện của section theo danh mục

Home gọi endpoint sản phẩm nổi bật theo từng `category._id` với:

- `pageNumber=1`
- `pageSize=12`
- `inStock=true`
- `prioritizeSpecs=true`

Backend áp dụng trước khi phân trang:

1. Sản phẩm chưa bị xoá (`isDeleted=false`).
2. Đúng danh mục.
3. Còn hàng (`countInStock > 0`).
4. Đạt điều kiện storefront theo trạng thái dữ liệu/dịch.
5. Sắp xếp `hasSpecs` giảm dần, sau đó `featured`, `createdAt`, `_id`.
6. Cuối cùng mới `skip` và `limit`.

Vì vậy sản phẩm có `Attributes` đã parse thành `specs` không rỗng luôn được ưu tiên; sản phẩm không có thông số không bị loại bỏ nhưng không được ưu tiên.

Section chỉ render khi API trả về ít nhất một sản phẩm. Nếu không có section danh mục nào, Home dùng fallback tối đa 12 sản phẩm còn hàng.

### Kết luận về giả thuyết phân trang trước lọc

Giả thuyết này **không đúng** với endpoint Home hiện tại: filter và thứ tự ưu tiên thông số đã được áp dụng trong truy vấn trước `skip/limit`. Không cần thay đổi thứ tự truy vấn.

### Kết luận về số lượng 12

Nhận định “mỗi mục Home luôn hiển thị >= 12 sản phẩm” **không đúng**:

- Mỗi section danh mục hiển thị **tối đa 12** sản phẩm.
- Nếu danh mục có ít hơn 12 sản phẩm hợp lệ, section hiển thị ít hơn 12.
- Tổng catalog có 600 sản phẩm không làm một section hiển thị 600 sản phẩm; mỗi danh mục được truy vấn độc lập và vẫn bị giới hạn 12.
- Lần fetch tổng phục vụ deal/fallback đang giới hạn 200 sản phẩm; điều này không ảnh hưởng các section danh mục vì chúng có request riêng.

## Kiểm thử

- Đã chạy kiểm tra cú pháp cho các tệp JavaScript backend đã sửa.
- Đã bổ sung assertion cho mapping `sourceProductId`/`sourceUrl` và định dạng giá gốc/phần trăm giảm ở đơn hàng.
- Không chạy được lệnh kiểm thử Python trong môi trường hiện tại do chính sách thực thi chặn lệnh đó.
