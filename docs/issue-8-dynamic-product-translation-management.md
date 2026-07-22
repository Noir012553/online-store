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

## Phát hiện bổ sung từ rà soát mã nguồn

> Các phát hiện dưới đây chỉ ghi nhận hiện trạng mã nguồn tại thời điểm rà soát; chưa có thay đổi mã ứng dụng.

### 1. Endpoint re-translate không cập nhật nguồn dữ liệu bản dịch sản phẩm đang được frontend sử dụng

- `online-store-backend/src/controllers/translationController.js:101-135` lấy bản dịch sản phẩm từ `ProductCatalogTranslationCache` theo `entityId`, `targetLang` và `status: 'success'`.
- `online-store-backend/src/controllers/translationController.js:717-743` lại chuyển endpoint `POST /api/translations/admin/retranslate-dynamic` sang `retranslateSeeder.retranslate` mà không truyền phạm vi sản phẩm cụ thể.
- `online-store-backend/src/seeds/retranslateSeeder.js:40-56` chỉ tìm bản ghi trong `LiveTranslationCache` có `qualityStatus: 'needs_retranslate'`.
- `online-store-backend/src/seeds/retranslateSeeder.js:109-139` chỉ tạo phiên bản mới và cập nhật trạng thái trong `LiveTranslationCache`; không có bước đồng bộ sang `ProductCatalogTranslationCache`.
- `online-store-backend/src/models/ProductCatalogTranslationCache.js:3-84` không có các trường `qualityStatus`, `qualityScore`, `validationErrors`, `entityType` hoặc liên kết version với `LiveTranslationCache`.

**Tác động:** Re-translate thành công theo response API vẫn có thể không làm thay đổi dữ liệu mà `GET /api/products/:id/translations` trả về. Không thể hiển thị chính xác trạng thái `approved`, `needs_retranslate` hoặc lịch sử chất lượng theo sản phẩm từ schema hiện dùng.

**Cần chốt trước khi triển khai:** Chọn một nguồn dữ liệu chuẩn cho dynamic product translation, hoặc thiết kế mapping/sync có định danh theo sản phẩm, ngôn ngữ và trường dữ liệu trước khi nối nút re-translate vào màn hình sản phẩm.

### 2. Contract re-translate hiện quá rộng, không bảo đảm phạm vi sản phẩm

- `online-store-backend/src/controllers/translationController.js:705-739` cho phép `entityType` là tùy chọn; khi không truyền, endpoint chỉ lọc theo `lang` và `limit`.
- `online-store-backend/src/models/LiveTranslationCache.js:25-32` cho thấy cache này chứa cả product, category, review và `generic`.
- `online-store-frontend/src/pages/admin/translationsAdminTier2.tsx:188-206` đang gọi endpoint với `{ lang: selectedLang, limit: 100 }`, không truyền `entityType`, `productId` hay danh sách sản phẩm.

**Tác động:** Một thao tác từ khu vực quản trị có thể dịch lại tối đa 100 bản ghi cần xử lý của mọi loại entity trong cùng ngôn ngữ, thay vì chỉ các bản ghi sản phẩm được admin chọn.

**Cần chốt trước khi triển khai:** Contract phải xác định rõ phạm vi entity sản phẩm và định danh product/field; giới hạn batch cần được áp dụng sau khi đã xác định filter, không thay thế filter bằng `limit`.

### 3. Màn hình Dịch sản phẩm không có dữ liệu trạng thái hoặc thao tác re-translate

- `online-store-frontend/src/pages/admin/productsTranslationsAdmin.tsx:76-94` chỉ tải danh sách từ `GET /api/products`.
- `online-store-frontend/src/pages/admin/productsTranslationsAdmin.tsx:96-123` chỉ lưu nội dung chỉnh sửa thủ công bằng `PUT /api/products/:id?lang=...`.
- `online-store-frontend/src/pages/admin/productsTranslationsAdmin.tsx:125-187` chỉ render tìm kiếm, danh sách thẻ sản phẩm và phân trang; không có filter/trạng thái translation, lựa chọn bản ghi hoặc request tới endpoint re-translate.

**Tác động:** Các tiêu chí phân biệt bản dịch thiếu, chờ xử lý, đạt yêu cầu, cần dịch lại, bị từ chối/lỗi và thao tác re-translate tại sản phẩm đều chưa có dữ liệu hay giao diện tương ứng.

### 4. Tên gọi và cấu trúc ba màn hình quản trị translation vẫn là cấu trúc cũ

- `online-store-frontend/src/components/admin/_AdminLayout.tsx:197-210` vẫn hiển thị đồng thời menu Tầng 1, Tầng 2 và Dịch Features.
- `online-store-frontend/src/pages/admin/translationsAdminTier1.tsx:889-892` và `online-store-frontend/src/pages/admin/translationsAdminTier2.tsx:1002-1005` vẫn khai báo hai `featureName` riêng.
- `online-store-backend/src/locales/vi/admin-common.json:108-112` và `online-store-backend/src/locales/en/admin-common.json:106-110` vẫn dịch mục sản phẩm là Dịch Features/Translate Features.
- `online-store-backend/src/locales/vi/productsTranslations.json:2-4` và `online-store-backend/src/locales/en/productsTranslations.json:2-4` vẫn mô tả trang là Dịch thuật Tính năng Sản phẩm/Product Feature Translations.

**Tác động:** Yêu cầu đổi tên thành Dịch sản phẩm trong nội dung trang, đổi mục cũ thành Tầng 2 và hợp nhất/loại bỏ một trong hai trang Tầng 1/Tầng 2 chưa được phản ánh xuyên suốt trong menu, page metadata và locale.

### 5. Tìm kiếm cache ở Tầng 2 chỉ lọc trong trang dữ liệu đang tải

- `online-store-frontend/src/pages/admin/translationsAdminTier2.tsx:94-120` chỉ tải một trang cache-records bằng `skip` và `limit`.
- `online-store-frontend/src/pages/admin/translationsAdminTier2.tsx:128-143` lọc `searchText` trên mảng `cacheRecords` hiện có trong bộ nhớ, rồi đặt lại `pageIndex` về 0 mà không gửi từ khóa tới API.

**Tác động:** Kết quả tìm kiếm không bao phủ toàn bộ cache theo ngôn ngữ. Admin có thể không tìm được bản ghi cần xử lý nếu bản ghi đó nằm ngoài trang đã tải.

### Điều chỉnh nhận định hiện trạng

- Có cơ chế `qualityStatus` với `approved`, `pending`, `needs_retranslate`, `rejected`, `retranslated` trong `LiveTranslationCache` (`online-store-backend/src/models/LiveTranslationCache.js:55-70`).
- Tuy nhiên, không có bằng chứng cùng trạng thái này tồn tại trong `ProductCatalogTranslationCache`, là nguồn được controller dùng để trả bản dịch sản phẩm. Vì vậy chưa thể kết luận backend hiện đã cung cấp trạng thái chất lượng theo từng sản phẩm/ngôn ngữ cho giao diện sản phẩm.
- Endpoint re-translate được bảo vệ bằng `protect` và `admin` (`online-store-backend/src/routes/translationRoutes.js:31-36`), nhưng request hiện không hỗ trợ phạm vi từng product và không bảo đảm đồng bộ dữ liệu product cache như nêu trên.

## Đánh giá khả năng hoạt động và độ trễ của nút re-translate

### Nút hiện tại có hoạt động không?

- Nút ở `online-store-frontend/src/pages/admin/translationsAdminTier2.tsx:182-227` có gửi `POST /api/translations/admin/retranslate-dynamic` và khóa nút bằng `isRetranslating` trong lúc chờ response.
- Backend route được đăng ký và bảo vệ bằng admin ở `online-store-backend/src/routes/translationRoutes.js:31-36`.
- Vì vậy, về mặt kết nối request, nút có thể hoạt động nếu có bản ghi `LiveTranslationCache` đúng `qualityStatus: 'needs_retranslate'` và cấu hình Cloudflare AI hợp lệ.
- Tuy nhiên, đây chưa phải nút re-translate theo sản phẩm: request không truyền `productId`, danh sách bản ghi hoặc `entityType`, đồng thời kết quả được ghi vào `LiveTranslationCache` chứ chưa đồng bộ chắc chắn sang `ProductCatalogTranslationCache`.

### Độ trễ hiện tại

- `retranslateSeeder.retranslate` xử lý tuần tự từng bản ghi tại `online-store-backend/src/seeds/retranslateSeeder.js:66-103`; mỗi bản ghi gồm một lần gọi AI và bước validation.
- Cloudflare AI đặt timeout mỗi request là 120 giây tại `online-store-backend/src/services/cloudflareAiService.js:237-258`.
- Khi gặp lỗi tạm thời, service có thể retry tối đa 3 lần với thời gian chờ tăng dần 2, 4 và 8 giây tại `online-store-backend/src/services/cloudflareAiService.js:317-343`.
- Frontend dùng `fetch` không có `AbortController` hoặc timeout riêng tại `online-store-frontend/src/pages/admin/translationsAdminTier2.tsx:199-207`, nên trình duyệt có thể giữ trạng thái loading cho đến khi server/proxy đóng request.

**Kết luận về thời gian:** Không thể cam kết một con số cố định từ mã nguồn hiện tại. Trường hợp bình thường phụ thuộc latency Cloudflare AI và số bản ghi; với `limit: 100`, tổng thời gian tăng gần tuyến tính vì xử lý tuần tự. Trường hợp lỗi/retry có thể kéo dài nhiều phút; riêng lý thuyết timeout AI tối đa cho một bản ghi đã là khoảng 494 giây nếu cả 4 lần thử đều chạm timeout và cộng backoff, chưa tính 99 bản ghi còn lại.

### Ngưỡng chấp nhận đề xuất

- **0-2 giây:** có thể xem là phản hồi tức thời.
- **2-10 giây:** chấp nhận được nếu có loading rõ ràng và không cho bấm trùng.
- **Trên 10 giây:** không nên giữ request HTTP đồng bộ cho thao tác quản trị; cần chuyển sang job bất đồng bộ, trả `jobId`, hiển thị tiến trình và cho phép tải lại trạng thái.
- Với re-translate một sản phẩm/một ngôn ngữ, mục tiêu nên là phản hồi kết quả trong **10 giây ở điều kiện bình thường** và có timeout hiển thị khoảng **30 giây** cho request đồng bộ.
- Với batch, không nên coi việc chờ đến khi 100 bản ghi hoàn tất là UX chấp nhận được. Cần giới hạn batch nhỏ hoặc tạo job nền; request khởi tạo nên trả trạng thái trong khoảng **2 giây**, còn tiến trình/kết quả được truy vấn riêng.

### Vấn đề cần bổ sung vào tiêu chí nghiệm thu

- Đo p50/p95 thời gian xử lý cho 1 bản ghi và batch nhỏ trước khi chốt SLA.
- Có timeout rõ ràng ở frontend và trạng thái lỗi có thể thử lại, không để spinner vô hạn.
- Có progress theo số bản ghi, phân biệt đang xử lý, thành công, bỏ qua và thất bại.
- Có cơ chế idempotency/chặn job trùng phía backend; chỉ khóa nút ở frontend là chưa đủ.
- Nếu request bị ngắt giữa chừng, phải xác định rõ các bản ghi đã xử lý và chưa xử lý để tránh admin chạy lại mù toàn bộ batch.

## Trạng thái và bước tiếp theo (cập nhật)

- **Đã ghi nhận:** Có mismatch giữa `LiveTranslationCache` (quality/retranslate) và `ProductCatalogTranslationCache` (nguồn trả bản dịch sản phẩm); đây là blocker contract cần giải quyết trước khi triển khai UI re-translate theo sản phẩm.
- **Đã ghi nhận:** Contract API hiện có thể tác động các entity không phải sản phẩm nếu caller không truyền `entityType`.
- **Đã ghi nhận:** Chức năng tìm kiếm cache ở Tầng 2 chỉ hoạt động trên trang dữ liệu đang tải.
- **Bước tiếp theo:** Xác minh luồng tạo và đồng bộ `ProductCatalogTranslationCache`, sau đó chốt schema/API trả trạng thái theo `productId`, ngôn ngữ và trường sản phẩm.
- **Bước tiếp theo:** Quy định rõ thao tác re-translate phải bảo toàn bản dịch chỉnh sửa thủ công và có phạm vi product/field xác định.

**Trạng thái cuối của tài liệu:** Đã bổ sung các phát hiện từ rà soát mã nguồn; chưa thay đổi mã nguồn.

## Rà soát bổ sung: đồng bộ Export / Import với bản dịch sản phẩm

> Phạm vi rà soát: `/admin/importExport`, `/admin/importProducts`, endpoint export/import sản phẩm, `Product`, `ProductCatalogTranslationCache`, `LiveTranslationCache` và luồng re-translate. Phần này chỉ ghi nhận vấn đề và đề xuất; chưa thay đổi mã nguồn.

### Kết luận trả lời trực tiếp

1. **File export hiện không chứa bản dịch của từng sản phẩm.**
   - JSON/CSV chỉ xuất dữ liệu nguồn của `Product`: `name`, `brand`, `price`, `originalPrice`, `category`, `supplier`, `description`, `image`, `countInStock`, `specs`, `features`, `rating`, `numReviews`, `featured` và `deal`.
   - Không xuất `featuresTranslations` (bản dịch thủ công trong `Product`) và không xuất dữ liệu dynamic translation trong `ProductCatalogTranslationCache` hoặc `LiveTranslationCache`.

2. **Import lại hiện không tạo, không cập nhật và không đồng bộ bản dịch.**
   - Import chỉ ghi vào collection `Product`.
   - Bản dịch đang nằm trong cache sẽ không bị xóa hay ghi đè trực tiếp, nhưng cũng không được cập nhật theo nội dung nguồn mới. Vì vậy sau khi thay đổi `name`, `description`, `brand`, `specs` hoặc `features`, bản dịch hiển thị có thể là nội dung cũ và không còn khớp sản phẩm.
   - Các trường bản dịch được chèn thêm vào file import hiện sẽ bị validator loại bỏ, nên không thể dùng file export/import hiện tại để bảo toàn hoặc khôi phục bản dịch.

3. **Không nên yêu cầu admin bấm `re-translate` sau mọi lần import.**
   - Không cần dịch lại khi chỉ thay đổi các trường không có nội dung cần dịch: giá, tiền tệ, tồn kho, ảnh, rating, số review, cờ nổi bật, khuyến mãi, supplier hoặc category ID.
   - Cần đưa vào hàng chờ invalidate/re-translate khi một trong các trường nguồn có thể dịch thay đổi: `name`, `description`, `brand`, `features`, `specs`.
   - Bản dịch thủ công phải được bảo toàn, không tự động ghi đè. Chỉ bản dịch AI/cache bị stale mới được tạo lại; nếu admin muốn thay thế bản dịch thủ công, phải có phạm vi và xác nhận tường minh.

### 6. File export không round-trip được với import

- `online-store-backend/src/controllers/productImportController.js:853-871` tạo dữ liệu export nhưng không bao gồm `baseCurrencyCode`.
- `online-store-backend/src/controllers/productImportController.js:904-914` tạo CSV cũng không có cột `baseCurrencyCode`.
- `online-store-backend/src/utils/productImportValidator.js:18-56` lại yêu cầu `baseCurrencyCode` và từ chối dòng không có mã tiền tệ ba ký tự hợp lệ.

**Tác động:** Xuất sản phẩm rồi nhập nguyên file đó lại sẽ không qua validation, dù không chỉnh sửa gì. Đây là blocker riêng cho luồng export/import, đồng thời không liên quan đến việc dịch lại.

**Cần đánh dấu nghiệm thu:** JSON và CSV export phải chứa đủ mọi trường bắt buộc của import; cần có kiểm thử round-trip bằng chính file do export tạo ra.

### 7. Export/import hoàn toàn bỏ qua hai nguồn bản dịch sản phẩm

- `online-store-backend/src/models/Product.js:151-159` có `featuresTranslations` trong document `Product`.
- `online-store-backend/src/controllers/productController.js:603-608` chỉ hỗ trợ ghi `featuresTranslations` khi cập nhật sản phẩm trực tiếp.
- `online-store-backend/src/controllers/productImportController.js:853-871` không export `featuresTranslations`.
- `online-store-backend/src/utils/productImportValidator.js:18-232` chỉ trả về các trường nguồn được allowlist; không có `featuresTranslations` hoặc metadata bản dịch.
- `online-store-backend/src/models/ProductCatalogTranslationCache.js:3-84` lưu bản dịch dynamic theo `entityId` và `targetLang` ở collection riêng.
- `online-store-backend/src/controllers/productImportController.js:543-680` chỉ `insertMany` hoặc `bulkWrite` vào `Product`; không đọc, ghi, invalidate hay đồng bộ `ProductCatalogTranslationCache`/`LiveTranslationCache`.

**Tác động:**

- File xuất hiện tại không phải bản sao lưu đầy đủ dữ liệu đa ngôn ngữ.
- Nhập lại file không thể phục hồi bản dịch thủ công hoặc dynamic translation sang môi trường khác.
- Cập nhật nội dung nguồn qua import có thể để lại cache bản dịch cũ, trong khi `GET /api/products` vẫn overlay dữ liệu cache lên sản phẩm tại `online-store-backend/src/controllers/productController.js:282-295`.

### 8. Nút re-translate hiện không phải cơ chế đồng bộ an toàn sau import

- `online-store-backend/src/controllers/translationController.js:717-743` chỉ nhận `lang`, `limit`, `entityType`; không nhận `productId`, danh sách sản phẩm hay danh sách trường vừa thay đổi.
- `online-store-backend/src/seeds/retranslateSeeder.js:40-56` chỉ chọn `LiveTranslationCache` có `qualityStatus: 'needs_retranslate'`.
- `online-store-backend/src/seeds/retranslateSeeder.js:109-139` tạo version mới trong `LiveTranslationCache`, không cập nhật `ProductCatalogTranslationCache`.
- `online-store-backend/src/controllers/translationController.js:101-135` đọc bản dịch hiển thị từ `ProductCatalogTranslationCache` với `status: 'success'`.

**Tác động:** Bấm re-translate sau import không bảo đảm chọn đúng các sản phẩm vừa thay đổi, và ngay cả khi API báo thành công thì dữ liệu người dùng thấy có thể chưa thay đổi. Không nên dùng nút hiện có như bước bắt buộc để hoàn tất import.

### 9. Rủi ro runtime trong import text

- `online-store-backend/src/controllers/productImportController.js:448` gọi `getCategoryText(cat.name)`.
- Phần import của file này tại `online-store-backend/src/controllers/productImportController.js:20-30` không import hoặc định nghĩa `getCategoryText`.

**Tác động:** Luồng `POST /api/products/admin/import` có thể dừng với `ReferenceError` trước khi ghi sản phẩm. Cần xác minh bằng kiểm thử import thực tế trước khi dùng như luồng vận hành.

### Hướng xử lý tối ưu cần chốt trước khi triển khai

1. **Tách hai mục đích file rõ ràng.**
   - **Export/Import dữ liệu sản phẩm nguồn:** dùng cho chỉnh sửa hàng loạt; chỉ round-trip các field của `Product`, phải gồm `baseCurrencyCode`.
   - **Backup/Migration đa ngôn ngữ:** chỉ thêm khi thực sự cần chuyển dữ liệu giữa môi trường; file JSON có version schema và gồm rõ bản dịch thủ công, dynamic translation theo `productId` + `language`, nguồn tạo, trạng thái và thời điểm cập nhật. Không nên cố nhét bản dịch đa ngôn ngữ vào CSV.

2. **Tính thay đổi theo field khi import.**
   - Trước khi `bulkWrite`, so sánh bản ghi cũ với `name`, `description`, `brand`, `features`, `specs`.
   - Nếu không có thay đổi ở các field này: giữ cache/bản dịch hiện có, không re-translate.
   - Nếu có thay đổi: đánh dấu bản dịch AI/cache của đúng `productId` và từng ngôn ngữ là stale/pending; lưu danh sách affected products để trả về kết quả import.

3. **Bảo toàn bản dịch thủ công.**
   - Xác định nguồn/provenance cho từng bản dịch (`manual` hoặc `machine`) trước khi invalidate.
   - Không xóa hoặc ghi đè bản dịch `manual`; báo rõ sản phẩm/ngôn ngữ nào cần admin xem lại.

4. **Thay re-translate tổng quát bằng job theo sản phẩm.**
   - Request phải có `productIds`, `languages`, `fields` hoặc một `importJobId`; backend chỉ xử lý các bản dịch stale thuộc phạm vi này.
   - Job cập nhật cùng nguồn cache mà API sản phẩm đọc, trả tiến trình và kết quả theo sản phẩm/ngôn ngữ/trường.
   - UI `/admin/importExport` nên hiển thị sau import: số sản phẩm không cần dịch lại, số sản phẩm đã đưa vào hàng chờ, số bản dịch thủ công được giữ nguyên và link lọc sang trang Dịch sản phẩm.

5. **Không chạy seed lại toàn bộ và không yêu cầu thao tác thủ công mặc định.**
   - Với import nhỏ, có thể tạo job ngay sau import và cho phép admin chủ động chạy đối với bản dịch AI stale.
   - Với import lớn, phải chạy nền theo batch có idempotency, tiến trình và retry; không giữ HTTP request đồng bộ cho toàn bộ dịch vụ AI.

### Tiêu chí nghiệm thu bổ sung

- Xuất JSON hoặc CSV rồi nhập lại nguyên trạng thành công, không thiếu `baseCurrencyCode` hay field bắt buộc khác.
- File export sản phẩm nguồn không được quảng bá là có chứa bản dịch khi thực tế không có.
- Import có thay đổi field dịch được phải trả về danh sách product/language translation bị stale hoặc job đã tạo.
- Import chỉ thay đổi field không dịch được không tạo job re-translate.
- Bản dịch thủ công không bị xóa/ghi đè bởi import hoặc re-translate tự động.
- Re-translate sau import chỉ xử lý đúng product/language/field đã bị ảnh hưởng và cập nhật đúng nguồn dữ liệu API sản phẩm đang đọc.
- Có kiểm thử cho JSON/CSV round-trip, thay đổi field cần dịch, thay đổi field không cần dịch, bản dịch thủ công và lỗi một phần của job.

**Trạng thái cuối của tài liệu (cập nhật):** Đã đánh dấu các blocker về round-trip export/import, thiếu đồng bộ translation và phạm vi re-translate; chưa thay đổi mã nguồn.

## Rà soát tiếp: các blocker bổ sung cho đồng bộ Export / Import / Translation

> Các điểm dưới đây được đối chiếu trực tiếp với mã hiện tại; chỉ cập nhật tài liệu, không thay đổi mã ứng dụng.

### 10. Job re-translate có thể lỗi trước khi xử lý bất kỳ bản dịch nào

- `online-store-backend/src/seeds/retranslateSeeder.js:2-7` không import `LiveTranslationCache`.
- Cùng file tại `online-store-backend/src/seeds/retranslateSeeder.js:54-56`, `128` và `131` lại gọi trực tiếp `LiveTranslationCache.find`, `.create` và `.updateOne`.

**Tác động:** Khi endpoint `POST /api/translations/admin/retranslate-dynamic` thực thi luồng này, runtime có thể phát sinh `ReferenceError: LiveTranslationCache is not defined`. Do đó nút re-translate không thể được xem là bước đồng bộ đáng tin cậy sau import cho đến khi có kiểm thử thực tế và sửa lỗi này.

**Cần đánh dấu nghiệm thu:** Có kiểm thử tích hợp gọi endpoint với một bản ghi `needs_retranslate`, xác minh job thực sự chạy và dữ liệu hiển thị trong API sản phẩm được cập nhật.

### 11. `featuresTranslations` lưu trong Product có nguy cơ không bao giờ hiển thị cho người dùng

- `online-store-backend/src/models/Product.js:156-159` khai báo `featuresTranslations` trong document sản phẩm.
- `online-store-backend/src/controllers/productController.js:603-608` cho phép cập nhật trường này khi sửa sản phẩm trực tiếp.
- Nhưng `online-store-backend/src/services/translationHelper.js:38-45` chỉ overlay các trường `name`, `description`, `brand`, `specs`, `features` từ `ProductCatalogTranslationCache`; không đọc `featuresTranslations`.
- `online-store-backend/src/controllers/productController.js:293-295` và `324-325` trả sản phẩm sau khi áp dụng helper này.

**Tác động:** Bản dịch feature được lưu thủ công trong `Product.featuresTranslations` có thể thành dữ liệu mồ côi: export/import không mang theo, và response API sản phẩm cũng không dùng để hiển thị. Điều này làm yêu cầu “bảo toàn bản dịch thủ công” không đủ nếu chưa xác định nguồn dữ liệu hiển thị chuẩn.

**Cần chốt trước khi triển khai:** Chọn duy nhất một nguồn hiển thị cho feature translation. Hoặc API phải merge `featuresTranslations` theo ngôn ngữ với quy tắc ưu tiên thủ công, hoặc chuyển dữ liệu thủ công vào cache/schema chuẩn có provenance `manual`; không duy trì hai nguồn độc lập.

### 12. Export có thể tạo bản sao không đầy đủ khi catalog vượt 10.000 sản phẩm

- `online-store-backend/src/controllers/productImportController.js:787` đặt `limit = 10000` mặc định.
- `online-store-backend/src/controllers/productImportController.js:836-849` áp dụng `.limit(parseInt(limit))` nhưng response chỉ trả `totalProducts` là số item đã transform tại `:879`, không trả tổng khớp filter hoặc cờ báo bị cắt.

**Tác động:** Với catalog lớn hơn giới hạn, admin có thể hiểu nhầm file export là bản sao đầy đủ rồi import lại, dẫn đến mất các sản phẩm không nằm trong file. Nếu sau này export có translation backup, lỗi này cũng làm backup bản dịch không đầy đủ.

**Hướng xử lý tối ưu:** Export theo stream/phân trang có cursor, hoặc bắt buộc `limit` tường minh kèm `matchedTotal`, `exportedTotal`, `hasMore`; không dùng file export bị cắt ngầm cho mục đích backup/migration.

### 13. Import đối chiếu sản phẩm bằng tên + brand, không có định danh ổn định để đồng bộ cache dịch

- File export tại `online-store-backend/src/controllers/productImportController.js:855-871` không bao gồm `_id` hoặc mã sản phẩm ổn định.
- Update/import upsert xác định bản ghi bằng `{ name, brand, isDeleted: false }` tại `online-store-backend/src/controllers/productImportController.js:590-605` và `651-663`.
- Cache dynamic lại liên kết theo `entityId` là Product ID tại `online-store-backend/src/models/ProductCatalogTranslationCache.js:5-10` và có unique key theo `entityId + targetLang` tại `:77-81`.

**Tác động:** Admin không thể đổi `name` hoặc `brand` của một sản phẩm qua file import theo cách được nhận diện là update. Với upsert, hệ thống sẽ tạo product mới; translation cache của product cũ vẫn gắn với ID cũ, còn product mới không có bản dịch. Điều này làm đồng bộ translation sau import không thể chính xác chỉ bằng việc so sánh text.

**Hướng xử lý tối ưu:** Thêm khóa bất biến chỉ dành cho round-trip/migration, ưu tiên `productId` hoặc SKU duy nhất, vào định dạng JSON và CSV. Import phải tra cứu theo khóa này trước, rồi mới diff các trường dịch được để invalidate/job đúng `entityId`; không dùng tên/brand làm khóa đồng bộ.

### Tổng hợp quyết định vận hành hiện tại

- **Xuất danh sách sản phẩm hiện không có bản dịch**, cả bản dịch cache dynamic lẫn `featuresTranslations` thủ công.
- **Nhập lại hiện không đảm bảo giữ hoặc làm mới bản dịch**; trong một số trường hợp file export còn không qua validation vì thiếu `baseCurrencyCode`, hoặc tạo product mới khi đổi tên/brand.
- **Không nên yêu cầu admin bấm re-translate sau import**: nút hiện chưa có phạm vi product/field, có thể lỗi runtime và không bảo đảm cập nhật cache mà API sản phẩm dùng.
- Quy trình tối ưu là: import xác định product bằng khóa ổn định; diff riêng các trường có thể dịch; chỉ đánh dấu stale/tạo job cho đúng `productId` + ngôn ngữ + field bị đổi; không đụng vào dữ liệu `manual`; sau đó job cập nhật chính nguồn cache API sản phẩm đang overlay. Backup/migration đa ngôn ngữ phải là JSON có schema version riêng, không phải export CSV vận hành.

**Trạng thái cuối của tài liệu (cập nhật tiếp):** Đã bổ sung các blocker runtime, nguồn dữ liệu bản dịch thủ công, export bị cắt ngầm và thiếu định danh ổn định khi import; chưa thay đổi mã nguồn.
