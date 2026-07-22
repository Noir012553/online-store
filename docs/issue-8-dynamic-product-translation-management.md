# Issue 8: Quản lý dịch động sản phẩm trong Admin

## Trạng thái

- **Loại:** Rà soát và lập kế hoạch hoàn thiện quản lý dynamic translation cho sản phẩm
- **Phạm vi:** `online-store-frontend` và `online-store-backend`
- **Khu vực liên quan:** `/admin/productsTranslationsAdmin`
- **Trạng thái hiện tại:** Static translation đã hoàn thiện; dynamic translation đã có nền tảng backend nhưng giao diện quản trị sản phẩm chưa hiển thị đầy đủ trạng thái và chưa hỗ trợ re-translate trực tiếp
- **Mục tiêu:** Cho phép admin nhìn thấy sản phẩm nào cần re-translate, sản phẩm nào không cần, và kích hoạt re-translate ngay từ giao diện thay vì phải chạy seed lại

## Bối cảnh

Dự án hiện hỗ trợ hai nhóm dịch thuật:

- **Static translation:** Các chuỗi giao diện và nội dung tĩnh đã được hoàn thiện.
- **Dynamic translation:** Nội dung phát sinh từ dữ liệu sản phẩm được lưu và xử lý riêng, nhưng luồng quản lý trong giao diện admin chưa hoàn chỉnh.

Tại trang quản lý dịch sản phẩm, admin hiện chưa có cách rõ ràng để biết bản dịch nào đang thiếu, bản dịch nào có chất lượng thấp hoặc sản phẩm nào cần dịch lại. Khi cần cập nhật bản dịch dynamic, quy trình hiện tại có xu hướng phải chạy seed lại thay vì thao tác trực tiếp theo từng sản phẩm hoặc nhóm sản phẩm.

## Hiện trạng phát hiện

### Frontend

File liên quan:

- `online-store-frontend/src/pages/admin/productsTranslationsAdmin.tsx`

Trang hiện tại:

- Gọi `GET /api/products` để tải danh sách sản phẩm theo trang, từ khóa và locale giao diện.
- Cho phép chọn ngôn ngữ khi chỉnh sửa sản phẩm.
- Gọi `GET /api/products/:id?lang=...` để tải dữ liệu bản dịch khi mở chế độ chỉnh sửa.
- Gọi `PUT /api/products/:id?lang=...` để lưu nội dung bản dịch thủ công.
- Có tìm kiếm và phân trang sản phẩm.
- Chưa hiển thị trạng thái dynamic translation như `approved`, `pending`, `needs_retranslate`, `rejected` hoặc trạng thái chưa có bản dịch.
- Chưa phân loại sản phẩm theo nhóm cần re-translate và không cần re-translate.
- Chưa có nút hoặc luồng xác nhận re-translate tại từng sản phẩm, theo ngôn ngữ hoặc theo danh sách được chọn.
- Chưa gọi endpoint re-translate dynamic từ trang quản lý sản phẩm.

### Backend

Các điểm liên quan đã tồn tại:

- `online-store-backend/src/routes/translationRoutes.js`
- `online-store-backend/src/controllers/translationController.js`
- `online-store-backend/src/seeds/retranslateSeeder.js`
- `online-store-backend/src/scripts/retranslate.js`

Backend đã có route admin:

- `POST /api/translations/admin/retranslate-dynamic`

Route này được bảo vệ bởi xác thực và quyền admin, đồng thời gọi `translationController.retranslateDynamic`. Cần xác minh request body, bộ lọc, phạm vi entity sản phẩm, trạng thái phản hồi và cách trả kết quả để kết nối chính xác với giao diện.

Backend cũng đã có cơ chế xác định bản dịch cần xử lý lại thông qua trạng thái chất lượng, trong đó có `needs_retranslate`. Tuy nhiên, giao diện `productsTranslationsAdmin` chưa dùng dữ liệu trạng thái này để hiển thị cho admin.

## Vấn đề cần giải quyết

1. Giao diện không hiển thị sản phẩm nào đang thiếu bản dịch dynamic.
2. Giao diện không hiển thị sản phẩm nào có bản dịch cần re-translate.
3. Giao diện không hiển thị sản phẩm nào đã đạt trạng thái không cần re-translate.
4. Admin không có thao tác re-translate trực tiếp trên trang quản lý sản phẩm.
5. Quy trình phải chạy seed lại gây khó xác định phạm vi, khó theo dõi kết quả và không phù hợp với thao tác quản trị từng sản phẩm.
6. Chưa có thông tin tiến trình, kết quả thành công/thất bại và lỗi theo sản phẩm/ngôn ngữ sau khi re-translate.

## Yêu cầu về tên trang và cấu trúc tầng

Trang `/admin/productsTranslationsAdmin` hiện được hiển thị với tên **Dịch Features**. Tên này chưa phản ánh đầy đủ phạm vi vì Features chỉ là một phần của dữ liệu sản phẩm. Tên hiển thị của trang cần được đổi thành **Dịch sản phẩm**.

Cấu trúc menu/tầng hiện tại cũng đang có các mục với chức năng bị trùng lặp hoặc chồng lấn. Hai URL cần xử lý trực tiếp là:

- `https://manln.online/admin/translationsAdminTier1`
- `https://manln.online/admin/translationsAdminTier2`

Yêu cầu bắt buộc đối với hai URL trên là **gộp thành một trang duy nhất hoặc bỏ đi một trang**; không để cả hai cùng tồn tại với cùng mục đích quản lý. Hướng ưu tiên là giữ lại chức năng đầy đủ hơn dưới tên **Tầng 1**, sau đó chuyển hướng hoặc loại bỏ trang còn lại sau khi xác nhận không còn liên kết và consumer cần thiết.

Các yêu cầu cụ thể:

- Hợp nhất hai màn hình `translationsAdminTier1` và `translationsAdminTier2` đang có chung mục đích thành một màn hình duy nhất tên **Tầng 1**.
- Nếu không thể gộp ngay trong cùng một màn hình, phải chọn một URL làm URL chính và loại bỏ hoặc chuyển hướng URL còn lại; không duy trì hai giao diện trùng chức năng.
- URL/trang được giữ lại trong hai URL trên cũng phải được sửa tên hiển thị và tên page/route nội bộ theo chức năng mới, không chỉ đổi nhãn trên menu.
- URL/trang bị bỏ không được tiếp tục hiển thị tên cũ hoặc dẫn tới một giao diện trùng chức năng; cần chuyển hướng an toàn hoặc thông báo trang đã được hợp nhất.
- Mục đang được gọi là **Dịch Features** cần được đổi tên thành **Tầng 2** trong cấu trúc quản lý mới.
- Trong phạm vi nội dung của trang sản phẩm, tên mô tả chức năng phải là **Dịch sản phẩm**, không dùng **Dịch Features** để tránh hiểu nhầm chỉ dịch trường Features.
- Giữ URL `/admin/productsTranslationsAdmin` ổn định trong giai đoạn này, trừ khi có yêu cầu riêng về route.
- Sau khi hợp nhất, không hiển thị đồng thời các mục cũ bị trùng chức năng.
- Các tiêu đề, mô tả, menu, breadcrumb, quyền hiển thị và bản dịch liên quan phải dùng cùng một quy ước tên mới.

Cần đối chiếu chính xác vai trò của từng màn hình trước khi triển khai để bảo đảm việc đổi tên không làm mất chức năng quản lý static translation, dynamic translation hoặc cache translation.

## Mục tiêu chức năng

### Hiển thị trạng thái

Trang quản lý sản phẩm cần cho phép admin:

- Xem trạng thái dynamic translation của từng sản phẩm.
- Chọn ngôn ngữ cần kiểm tra hoặc re-translate.
- Phân biệt rõ các nhóm:
  - Chưa có bản dịch.
  - Đang chờ xử lý.
  - Đã dịch và đạt yêu cầu.
  - Cần re-translate.
  - Đã từ chối hoặc có lỗi.
- Lọc hoặc sắp xếp theo trạng thái dịch.
- Biết thời điểm xử lý gần nhất nếu backend có dữ liệu này.

### Re-translate

Trang cần có nút `Re-translate` phù hợp với phạm vi thao tác đã chọn, tối thiểu gồm:

- Re-translate một sản phẩm.
- Re-translate theo ngôn ngữ đã chọn.
- Chỉ cho phép re-translate các bản ghi thực sự cần xử lý, hoặc hiển thị cảnh báo rõ nếu admin chủ động chạy lại bản dịch đã đạt.
- Có hộp thoại xác nhận trước khi bắt đầu thao tác.
- Hiển thị trạng thái đang xử lý và khóa thao tác trùng lặp.
- Thông báo kết quả sau khi hoàn thành, gồm số lượng thành công, bỏ qua và thất bại.
- Cho phép tải lại trạng thái danh sách sau khi re-translate.

Nếu backend hỗ trợ xử lý theo batch, có thể bổ sung lựa chọn re-translate nhiều sản phẩm sau khi đã xác định rõ filter và giới hạn an toàn.

## Phạm vi cần rà soát trước khi triển khai

- Xác định nguồn dữ liệu chính để tính trạng thái dịch theo `productId`, ngôn ngữ và các trường sản phẩm.
- Đối chiếu schema dynamic translation mới với dữ liệu legacy nếu cả hai vẫn còn khả năng fallback.
- Xác minh `retranslateDynamic` đang nhận những bộ lọc nào và có hỗ trợ giới hạn theo sản phẩm/ngôn ngữ hay không.
- Xác định re-translate tạo phiên bản mới, cập nhật bản ghi hiện tại hay ghi vào cache sản phẩm mới.
- Xác định quyền admin hiện tại có đủ cho việc xem trạng thái và kích hoạt re-translate hay cần permission riêng.
- Xác định cách xử lý bản dịch được chỉnh sửa thủ công để re-translate không ghi đè ngoài ý muốn.
- Xác định trạng thái loading, polling hoặc refresh sau khi backend xử lý bất đồng bộ.
- Kiểm tra thông báo và locale cho các trạng thái mới trong namespace `productsTranslations` hoặc namespace admin phù hợp.

## Nguyên tắc không thay đổi

- Không chạy seed lại như cơ chế bắt buộc cho thao tác re-translate trên giao diện.
- Không thay đổi dữ liệu static translation đã hoàn thiện.
- Không thay đổi API hoặc schema hiện có nếu chưa xác định rõ contract và consumer.
- Không ghi đè bản dịch thủ công mà không có cảnh báo và xác nhận rõ ràng.
- Không thay đổi style, màu sắc, hình dạng, typography hoặc breakpoint hiện có ngoài phần UI cần bổ sung.
- Không thay đổi luồng sản phẩm, thanh toán, phân quyền hoặc dữ liệu nghiệp vụ ngoài phạm vi dynamic translation.
- Không tạo thao tác re-translate không giới hạn có thể gây tải lớn hoặc gọi dịch vụ AI hàng loạt ngoài ý muốn.

## Tiêu chí nghiệm thu dự kiến

- Trang `/admin/productsTranslationsAdmin` hiển thị được tên chức năng **Dịch sản phẩm**, không còn dùng tên **Dịch Features** làm tiêu đề mô tả phạm vi.
- Hai URL `/admin/translationsAdminTier1` và `/admin/translationsAdminTier2` không còn cùng tồn tại với chức năng trùng lặp.
- Hai URL trên được gộp thành một trang duy nhất tên **Tầng 1**, hoặc một URL được chọn làm chính và URL còn lại được loại bỏ/chuyển hướng an toàn.
- URL/trang được giữ lại phải được sửa tên page/route và tên hiển thị theo chức năng **Tầng 1**, không chỉ đổi nhãn menu.
- Mục **Dịch Features** được đổi tên thành **Tầng 2** trong cấu trúc menu mới và không còn xuất hiện với tên cũ.
- Trang `/admin/productsTranslationsAdmin` hiển thị được trạng thái dịch dynamic của sản phẩm theo ngôn ngữ.
- Admin phân biệt được sản phẩm cần re-translate và sản phẩm không cần re-translate.
- Có nút re-translate với phạm vi thao tác rõ ràng.
- Có xác nhận trước thao tác và trạng thái đang xử lý.
- Kết quả re-translate được thông báo rõ ràng, bao gồm lỗi nếu có.
- Danh sách được cập nhật sau khi re-translate mà không cần chạy seed lại thủ công.
- Bản dịch static và bản dịch thủ công không bị thay đổi ngoài chủ đích.
- Backend giữ đúng quyền admin, validation, giới hạn và audit log phù hợp.
- Giao diện hoạt động đúng với trường hợp không có sản phẩm cần re-translate.
- Giao diện hoạt động đúng khi một sản phẩm có nhiều ngôn ngữ với trạng thái khác nhau.

## Kiểm thử dự kiến

### Frontend

- Mở trang khi không có sản phẩm cần re-translate.
- Mở trang khi có sản phẩm thiếu bản dịch hoặc có trạng thái `needs_retranslate`.
- Đổi ngôn ngữ và xác nhận trạng thái được tải lại đúng.
- Lọc danh sách theo trạng thái và tìm kiếm sản phẩm.
- Re-translate một sản phẩm thành công.
- Từ chối hộp thoại xác nhận và xác nhận không phát sinh request.
- Xử lý lỗi API, timeout hoặc kết quả một phần.
- Kiểm tra sản phẩm có bản dịch thủ công để bảo đảm không bị ghi đè ngoài cảnh báo.
- Kiểm tra phân trang và refresh sau khi re-translate.

### Backend

- Kiểm tra quyền admin của endpoint re-translate.
- Kiểm tra validation cho `productId`, ngôn ngữ, trạng thái và giới hạn batch.
- Kiểm tra chỉ re-translate đúng bản ghi được chọn hoặc đúng filter.
- Kiểm tra trạng thái và version của bản dịch sau khi xử lý.
- Kiểm tra audit log và báo cáo kết quả.
- Kiểm tra trường hợp không có bản ghi cần re-translate.
- Kiểm tra lỗi một phần khi một sản phẩm hoặc ngôn ngữ thất bại.
- Kiểm tra không phát sinh thao tác seed lại toàn bộ dữ liệu.

## Rủi ro và câu hỏi cần chốt

- `retranslateDynamic` có thể đang làm việc trên cache dynamic tổng quát thay vì phạm vi sản phẩm; cần xác minh trước khi dùng cho từng sản phẩm.
- Trạng thái chất lượng có thể nằm ở schema hoặc collection khác với dữ liệu mà `GET /api/products` trả về.
- Re-translate có thể tạo phiên bản mới, vì vậy UI cần tránh hiển thị dữ liệu cũ sau khi thao tác hoàn tất.
- Re-translate hàng loạt có thể gây tải lớn cho dịch vụ dịch thuật và cần giới hạn rõ.
- Cần quyết định liệu sản phẩm đã `approved` có được phép re-translate cưỡng bức hay chỉ cho phép khi có trạng thái cần xử lý.
- Cần xác định cách phân biệt bản dịch chưa tồn tại với bản dịch tồn tại nhưng chất lượng không đạt.

## Trạng thái và bước tiếp theo

- **Đã ghi nhận:** static translation đã hoàn thiện theo yêu cầu hiện tại.
- **Đã ghi nhận:** dynamic translation trong khu vực admin sản phẩm chưa cung cấp bảng trạng thái cần re-translate.
- **Đã ghi nhận:** trang admin hiện có luồng xem/sửa/lưu bản dịch sản phẩm nhưng chưa có nút re-translate.
- **Đã ghi nhận:** tên **Dịch Features** không phản ánh đầy đủ phạm vi dịch sản phẩm.
- **Đã ghi nhận:** **Tầng 1** và **Tầng 2** hiện có chức năng chồng lấn cần hợp nhất; mục **Dịch Features** cần chuyển thành tên **Tầng 2** theo cấu trúc mới.
- **Đã ghi nhận:** backend đã có endpoint admin `POST /api/translations/admin/retranslate-dynamic` cần được đối chiếu contract trước khi tích hợp.
- **Bước tiếp theo:** rà soát contract endpoint, model/schema trạng thái dynamic translation và dữ liệu trả về cho từng sản phẩm/ngôn ngữ.
- **Bước tiếp theo:** thống nhất UX cho trạng thái, filter, phạm vi nút re-translate và cảnh báo ghi đè bản dịch thủ công.
- **Bước tiếp theo:** lập bản đồ màn hình/menu hiện tại để hợp nhất đúng hai tầng trùng chức năng và đổi tên mà không làm mất quyền truy cập.
- **Bước tiếp theo:** sau khi chốt yêu cầu mới triển khai frontend/backend và kiểm thử theo tiêu chí nghiệm thu.

**Trạng thái cuối của tài liệu:** Đã ghi nhận Issue 8 và chưa thay đổi mã nguồn.
