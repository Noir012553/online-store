# Kế hoạch SEO URL sản phẩm đa ngôn ngữ

## Trạng thái

Đang triển khai. Backend lưu trữ, tạo slug, resolver, sitemap và endpoint quản trị đổi slug/lưu alias đã có; frontend đã được nối với slug URL, server-render và SEO metadata. Backfill và deploy production chưa được xác nhận; test backend mới thêm chưa chạy được trong môi trường hiện tại do thiếu dependency `dotenv`.

## Mục tiêu

Thay URL sản phẩm dạng `/product/<mongo-id>` bằng slug dễ đọc, không dấu và được tạo từ tên sản phẩm theo từng ngôn ngữ, ví dụ:

- `/product/ban-phim-razer-blackwidow-v4-yellow-switch`
- `/product/razer-blackwidow-v4-yellow-switch`

Không thêm tiền tố locale vào URL. Slug phải xác định duy nhất sản phẩm và ngôn ngữ nội dung, không phụ thuộc locale lưu trong `localStorage`.

## Hiện trạng

- `ProductLocalizedSlug` và slug service tách slug khỏi product, tạo canonical theo locale và giữ slug ổn định khi nội dung thay đổi.
- Backfill script hỗ trợ dry-run và `--apply`; script chưa được chạy trên production.
- Backend có API resolver theo slug và sitemap động với alternates; resolver trả canonical slug để frontend redirect alias.
- Trang `online-store-frontend/src/pages/product/[id].tsx` resolve slug/ID phía server, redirect ID cũ và alias khi có canonical slug, đồng thời xuất metadata SEO.
- Product card, quick view, search và cart dùng localized slug khi API có dữ liệu; nếu không có slug, các link tiếp tục fallback về ID.
- Production API đã được kiểm tra cho một sản phẩm và hiện trả `localizedSlugs: {}`; vì vậy cần chạy backfill trước khi link sản phẩm dùng slug.
- Chưa có liên kết sản phẩm trong email đặt hàng hiện tại; URL callback thanh toán và tích hợp ngoài không thay đổi.

## Quy tắc URL và slug

1. Mỗi bản ghi slug liên kết với `productId`, `locale`, slug hiện hành và tên đã dùng để tạo slug.
2. Slug được tạo từ tên sản phẩm theo locale: lowercase, bỏ dấu tiếng Việt/Unicode, thay khoảng trắng và dấu câu bằng dấu gạch nối, loại dấu gạch nối thừa.
3. Slug là định danh bền vững, không tự sinh lại mỗi lần sản phẩm hoặc bản dịch được cập nhật.
4. Do URL không có locale prefix, slug phải duy nhất toàn hệ thống để tra cứu ra đúng một sản phẩm và locale. Khi trùng tên, thêm hậu tố ổn định như SKU; nếu SKU không có, dùng đoạn ID ngắn ổn định.
5. Một sản phẩm chỉ có một slug canonical cho mỗi locale. Lưu lịch sử slug cũ để redirect khi tên hoặc slug được chỉnh sửa.
6. Nếu chưa có bản dịch cho locale, chưa phát hành URL locale đó; không tạo slug dịch giả hoặc làm URL trả nội dung ở ngôn ngữ khác.

## Lưu trữ và tạo slug

Ưu tiên collection riêng cho slug sản phẩm, ví dụ `ProductLocalizedSlug`, gồm `productId`, `locale`, `slug`, `sourceName`, trạng thái current/alias và timestamps. Tạo unique index cho `slug` trên toàn collection; bổ sung ràng buộc để mỗi cặp `productId + locale` chỉ có một slug current. Bản ghi slug cũ được giữ làm alias để redirect.

Trong luồng import/seed:

1. Upsert sản phẩm và bản dịch hiện có.
2. Với mỗi locale đã có tên sản phẩm, tạo slug nếu chưa có slug current.
3. Không ghi đè slug đã tồn tại khi tên sản phẩm thay đổi; thay đổi slug cần thao tác rõ ràng và lưu alias.
4. Ghi nhận va chạm trước khi tạo unique index; giải quyết va chạm bằng hậu tố ổn định.

## Tra cứu và tương thích URL cũ

- Thêm API tra cứu public theo slug, trả về sản phẩm cùng locale được gắn với slug.
- Trang `/product/[slug]` phân biệt slug với ObjectId; API admin update/delete tiếp tục dùng ObjectId.
- URL ObjectId cũ tiếp tục được nhận diện và trả redirect 301 tới slug canonical của locale mặc định (dự kiến `vi`).
- Alias slug cũ redirect 301 tới slug current.
- Khi người dùng đổi ngôn ngữ trên trang sản phẩm, dùng `productId + locale` để tìm slug tương ứng và chuyển sang URL đó. Nếu chưa có slug của locale đích, giữ trang hiện tại hoặc dùng quy tắc fallback đã thống nhất, không tạo URL không tồn tại.

## Liên kết sản phẩm

Tạo một helper phía frontend/backend phù hợp để sinh product URL từ sản phẩm và locale. Cập nhật các nơi tạo link gồm product card, quick view, search, cart, recommendations, email template và các thông báo có link sản phẩm. Cart cũ chỉ có ID vẫn có thể mở URL ID cũ và được redirect.

Không đổi route callback thanh toán, webhook, OAuth hay endpoint tích hợp bên thứ ba. Các URL email chỉ đổi phần link tới trang sản phẩm; cần kiểm tra email đã gửi trước đó tiếp tục hoạt động nhờ redirect ID/slug cũ.

## SEO và indexability

1. Tra cứu slug và dữ liệu sản phẩm phía server để title, description, Open Graph, structured data và nội dung chính có trong HTML ban đầu.
2. Đặt canonical tuyệt đối về slug current của đúng locale.
3. Xuất alternate hreflang cho các locale đã có slug và bản dịch đủ điều kiện; thêm x-default theo locale mặc định.
4. Tạo XML sitemap động chỉ chứa URL canonical sản phẩm, kèm alternates nếu cấu trúc sitemap hỗ trợ.
5. Redirect slug alias và URL ID cũ bằng 301; không để canonical trỏ về URL ID hoặc slug cũ.

## Các giai đoạn triển khai

1. Quy tắc locale mặc định, hậu tố va chạm và xử lý locale chưa có bản dịch đã được thể hiện trong slug service.
2. Model/index, generator slug và kiểm thử Unicode/tiếng Việt/va chạm đã có.
3. Dry-run/backfill đã có; cần chạy dry-run, rà báo cáo va chạm và chỉ apply sau khi xác nhận đúng database.
4. Import/seed và readiness flow đồng bộ slug mới nhưng không tự đổi slug canonical hiện tại.
5. API resolver, redirect ID/alias và SSR product route đã có trong code.
6. Product card, quick view, search, cart, locale switching, metadata, hreflang và sitemap đã được nối; chưa có email product links để chuyển đổi.
7. API admin đổi slug có lưu alias đã được bổ sung. Còn cần chạy test backend, chạy backfill theo quy trình được duyệt, deploy backend/frontend và xác minh end-to-end trên production.

## Kiểm thử và nghiệm thu

- Slug tiếng Việt có dấu, ký tự Unicode, dấu câu, tên rỗng và tên chỉ gồm ký tự đặc biệt.
- Hai sản phẩm trùng tên; hai locale sinh cùng slug; SKU thiếu hoặc trùng.
- Locale thiếu bản dịch, bản dịch được thêm sau, đổi tên và đổi slug có redirect lịch sử.
- URL ID cũ, slug current và slug alias; sản phẩm bị xóa mềm/khôi phục.
- Chuyển ngôn ngữ từ trang sản phẩm mở đúng slug và nội dung locale.
- Link từ card, search, quick view, cart, recommendations và email.
- HTML ban đầu, title/description, canonical, hreflang, structured data và XML sitemap.
- Callback thanh toán, webhook, OAuth và các endpoint bên thứ ba không đổi.

## Rủi ro và đánh đổi

- Không có locale prefix nên slug phải unique toàn hệ thống, bao gồm giữa các ngôn ngữ; việc xử lý trùng cần ổn định.
- Bản dịch có thể đến sau import; slug locale chỉ được phát hành sau khi có tên nguồn hợp lệ.
- Server không đọc được `localStorage`; locale trang phải được suy ra từ slug đã resolve, không chọn theo locale browser.
- Tạo redirect, sitemap và metadata phía server cần phối hợp frontend/backend, nhưng không cần thay callback tích hợp bên ngoài.
