## Quy tắc đặt tên báo cáo

Tên file Markdown phải theo định dạng `issue-N-<mô-tả>.md`, trong đó `N` là số thứ tự của issue.

## Trạng thái

- **Loại:** Rà soát và lập kế hoạch quản lý emoji tập trung
- **Phạm vi:** `online-store-frontend` và `online-store-backend`
- **Trạng thái hiện tại:** Đã chuẩn hóa module emoji UI và ký hiệu CLI; đã bổ sung kiểm tra tĩnh, chưa xử lý locale
- **Mục tiêu:** Giảm việc hard-code emoji rải rác và thiết lập quy ước quản lý rõ ràng

## Tóm tắt vấn đề

Emoji và các ký hiệu Unicode tương tự đang được sử dụng trực tiếp ở nhiều khu vực của dự án nhưng chưa có một nguồn quản lý thống nhất. Việc này làm cho cùng một ý nghĩa có thể được biểu diễn bằng nhiều ký hiệu khác nhau, khó thay đổi đồng loạt và khó kiểm soát việc thêm emoji mới.

Các nhóm phát hiện chính:

- Frontend dùng emoji trong badge sản phẩm, trạng thái, hướng dẫn import, animation và nội dung checkout.
- Backend dùng emoji trong seed, script bảo trì, test runner, test thủ công và log CLI.
- Locale JSON chứa emoji trực tiếp trong chuỗi dịch, bao gồm cả biểu tượng trạng thái và cờ quốc gia.
- Một số cơ chế quản lý cục bộ đã tồn tại nhưng không dùng chung toàn dự án.

Vấn đề này chủ yếu là vấn đề bảo trì và tính nhất quán. Chưa có bằng chứng cho thấy emoji hiện tại gây lỗi trực tiếp cho luồng order, thanh toán hoặc dữ liệu nghiệp vụ.

## Phân tích hiện trạng

### 1. Frontend

Các vị trí tiêu biểu có emoji hard-code:

- `online-store-frontend/src/components/ProductCard.tsx:145`
- `online-store-frontend/src/pages/product/[id].tsx:334`
- `online-store-frontend/src/components/HomeContent.tsx:586`
- `online-store-frontend/src/components/QuickViewModal.tsx`
- `online-store-frontend/src/pages/admin/importProducts.tsx:258-376`
- `online-store-frontend/src/components/PageTransition.tsx:33-58`
- `online-store-frontend/src/components/checkout/StepIndicator.tsx:48`
- Các trang chính sách, profile, about và order success dùng `✓` cho trạng thái hoàn tất.

Các nhóm thường gặp gồm:

- Badge/marketing: `🔥`, `⭐`, `⚡`
- Trạng thái: `✅`, `❌`, `⚠️`, `✓`, `✗`
- Hướng dẫn/thao tác: `📖`, `📁`, `📥`, `🔍`, `▶️`, `👁️`
- Nội dung trang chuyển cảnh: `🐼`, `🎋`
- Ký hiệu đánh giá: `★`

Frontend hiện có các cơ chế liên quan:

- `online-store-frontend/src/components/EmojiSvg.tsx` dùng `twemoji` để render emoji dạng SVG.
- `online-store-frontend/src/components/ProductDescriptionFormatter.tsx` có whitelist emoji riêng và tự thay `##` thành `📌`.
- Một số khu vực dùng `lucide-react`, nhưng đây là icon vector và không nên trộn lẫn với bộ emoji nếu mục tiêu là chuẩn hóa biểu tượng giao diện.

### 2. Backend

Emoji xuất hiện chủ yếu trong output dành cho người phát triển hoặc vận hành:

- `online-store-backend/src/utils/seedLogger.js`
- `online-store-backend/src/test/test-runner.js`
- `online-store-backend/src/test/testRegistry.js`
- Các file trong `online-store-backend/src/scripts/`
- Các file trong `online-store-backend/scripts/`
- Các seeder trong `online-store-backend/src/seeds/`
- Một số route và script kiểm tra payment, i18n và migration.

Các nhóm thường gặp gồm:

- Thành công/thất bại/cảnh báo: `✅`, `❌`, `⚠️`
- Tiến trình: `🔄`, `🚀`, `⏳`
- Báo cáo/thống kê: `📊`, `📈`, `📋`, `📄`
- Kết nối và dữ liệu: `🔌`, `📦`, `📝`, `🗑️`
- Test và mục tiêu: `🧪`, `🎯`

`seedLogger.js` đã có quy ước cục bộ cho một số prefix log, nhưng các script và test khác vẫn tự ghi emoji trực tiếp.

### 3. Locale và dữ liệu dịch

Emoji được nhúng trực tiếp trong nhiều chuỗi dịch tại backend, tiêu biểu:

- `online-store-backend/src/locales/es/seeder-messages.json`
- `online-store-backend/src/locales/es/admin.json`
- `online-store-backend/src/locales/es/pages.json`
- `online-store-backend/src/locales/it/admin-translation.json`
- `online-store-backend/src/locales/nl/seeder-messages.json`

Nhóm này cần được xử lý cẩn thận vì emoji có thể là:

- Một phần chủ đích của nội dung marketing.
- Ký hiệu trạng thái do người dịch đưa vào.
- Ký hiệu trình bày đáng lẽ nên được UI thêm theo ngữ cảnh.
- Cờ đại diện cho ngôn ngữ/quốc gia.

Không nên tự động xóa toàn bộ emoji khỏi locale vì có thể làm thay đổi nội dung đã được biên tập hoặc ý nghĩa của bản dịch.

## Mục tiêu quản lý

1. Có danh sách emoji/ký hiệu được phép dùng theo từng ngữ cảnh.
2. Giữ nguyên giao diện, màu sắc, hình dạng, typography và nội dung hiện tại trong giai đoạn chuẩn hóa đầu tiên.
3. Có cách thay đổi hoặc thay thế emoji theo nhóm mà không phải tìm kiếm thủ công toàn repository.
4. Phân biệt rõ emoji giao diện, icon vector, ký hiệu CLI và nội dung dịch.
5. Ngăn việc tiếp tục thêm emoji tùy ý vào các file không được phép.

## Kế hoạch triển khai đề xuất

### Giai đoạn 1: Kiểm kê đầy đủ

- Quét cả frontend và backend để lập danh sách emoji Unicode và ký hiệu tương tự.
- Phân loại từng kết quả theo UI, log/CLI, test, locale, metadata ngôn ngữ hoặc comment.
- Xác định các trường hợp nằm trong comment/documentation để không xử lý nhầm như nội dung runtime.
- Đối chiếu các emoji trùng ý nghĩa, ví dụ nhóm thành công đang dùng cả `✅` và `✓`.
- Ghi nhận các trường hợp emoji nằm trong dữ liệu dịch cần được người duy trì nội dung xác nhận.

### Giai đoạn 2: Thiết kế phạm vi quản lý

Frontend:

- Tạo một module constants trong phạm vi frontend cho emoji và ký hiệu UI được dùng lặp lại.
- Tiếp tục dùng `EmojiSvg` cho các emoji cần render đồng nhất qua Twemoji.
- Không thay `lucide-react` bằng emoji hoặc ngược lại nếu không có yêu cầu giao diện cụ thể.
- Giữ riêng cờ ngôn ngữ trong metadata ngôn ngữ, không trộn vào bộ badge/trạng thái chung.

Backend:

- Mở rộng helper log hiện có hoặc tạo helper cùng phạm vi để quản lý prefix cho seed, script và test.
- Chuẩn hóa các prefix thành các nhóm rõ ràng như `success`, `error`, `warning`, `info`, `progress`.
- Không đưa emoji log vào response API hoặc dữ liệu nghiệp vụ.
- Không phụ thuộc frontend constants từ backend và ngược lại nếu chưa có package chia sẻ được xác định rõ.

Locale:

- Phân loại emoji là nội dung dịch hay thành phần trình bày.
- Nếu là thành phần trình bày, ưu tiên để UI/helper gắn theo ngữ cảnh.
- Nếu là nội dung marketing hoặc biểu tượng có chủ đích của câu dịch, giữ trong locale và ghi nhận là ngoại lệ hợp lệ.
- Giữ nguyên cờ quốc gia trong metadata locale khi chúng đại diện cho ngôn ngữ.

### Giai đoạn 3: Chuẩn hóa theo nhóm

Thứ tự nên thực hiện:

1. Prefix log, seed và test backend.
2. Badge và trạng thái lặp lại trong frontend.
3. Hướng dẫn import và các khu vực admin.
4. Các component render emoji như `EmojiSvg` và formatter nội dung.
5. Locale JSON sau khi đã phân biệt rõ nội dung dịch với trình bày.
6. Các trường hợp đặc biệt như cờ ngôn ngữ, animation và dữ liệu mẫu.

Mỗi nhóm cần được kiểm tra trước và sau khi thay đổi để đảm bảo emoji hiển thị đúng như hiện tại.

### Giai đoạn 4: Ngăn tái phát

- Thêm kiểm tra static nhẹ để phát hiện emoji hard-code ngoài các module hoặc phạm vi được phép.
- Định nghĩa danh sách ngoại lệ cho locale, metadata ngôn ngữ, test fixture và nội dung marketing.
- Không bắt buộc loại bỏ mọi emoji khỏi repository; mục tiêu là emoji phải có lý do và vị trí quản lý rõ ràng.
- Cập nhật quy ước đóng góp nội bộ nếu dự án có tài liệu dành cho developer.

## Nguyên tắc không thay đổi

- Không thay đổi API, schema, database hoặc dữ liệu nghiệp vụ.
- Không thay đổi route, phân quyền, validation hoặc logic thanh toán.
- Không thay đổi style hiện có chỉ vì mục tiêu gom quản lý emoji.
- Không thay đổi tên biến style hoặc giá trị CSS/Tailwind hiện có.
- Không xóa emoji khỏi locale nếu chưa xác định đó chỉ là ký hiệu trình bày.
- Không thay emoji bằng icon vector hàng loạt trong cùng một lần chuẩn hóa.
- Không tạo package dùng chung mới nếu chỉ cần module constants trong từng ứng dụng.
- Không thêm inline style hoặc thay đổi breakpoint trong phạm vi công việc này.

## Tiêu chí nghiệm thu

- Có danh sách phân loại các emoji hiện có ở frontend, backend và locale.
- Các emoji lặp lại trong UI được tham chiếu từ nguồn quản lý phù hợp.
- Prefix log, seed và test có quy ước thống nhất.
- `EmojiSvg` và `ProductDescriptionFormatter` không còn giữ các danh sách rời rạc nếu chúng cùng phục vụ một mục đích.
- Các emoji hợp lệ trong locale và metadata được ghi nhận rõ là ngoại lệ hoặc nội dung chủ đích.
- Không phát sinh thay đổi ngoài ý muốn về text, giao diện hoặc hành vi runtime.
- Build/type check frontend thành công.
- Backend kiểm tra cú pháp và các test liên quan đến logger/script chạy được trong môi trường phù hợp.
- Có kiểm tra static hoặc quy trình review để hạn chế emoji hard-code mới.

## Kiểm thử dự kiến

### Frontend

- Mở các trang có badge `🔥`, `⭐`, `⚡` và xác nhận kích thước/render không đổi.
- Kiểm tra các trạng thái thành công, cảnh báo và lỗi trong admin, checkout và profile.
- Kiểm tra `EmojiSvg` với các emoji đại diện và nội dung formatter có `##`.
- Kiểm tra các locale có cờ quốc gia và nội dung dịch dài.
- Xác nhận golden path sản phẩm, import sản phẩm, checkout và admin không bị ảnh hưởng.

### Backend

- Chạy các script seed và test runner có output emoji.
- Xác nhận prefix thành công, lỗi, cảnh báo và thông tin vẫn dễ phân biệt.
- Kiểm tra logger không đưa format CLI vào response API.
- Kiểm tra các script trong cả `src/scripts/` và `scripts/` để tránh chuẩn hóa nhầm bản legacy chưa dùng.
- Kiểm tra locale JSON vẫn hợp lệ và API translations trả về đúng dữ liệu.

## Rủi ro và giới hạn

- Emoji trong locale có thể là nội dung đã được biên tập, không thể thay đổi chỉ bằng tìm kiếm toàn cục.
- `✓`, `★`, `ℹ` và các ký hiệu Unicode có thể được dùng như text/icon chứ không phải emoji theo nghĩa kỹ thuật.
- Cờ quốc gia có ý nghĩa metadata khác với emoji trang trí.
- Thay đổi helper logger có thể ảnh hưởng nhiều script chạy thủ công; cần kiểm tra toàn bộ consumer trước.
- Nếu thêm lint quá nghiêm ngặt, có thể chặn nội dung dịch hoặc test fixture hợp lệ.

## Trạng thái và bước tiếp theo

- **Đã hoàn thành:** rà soát sơ bộ các nhóm emoji và cơ chế quản lý hiện có.
- **Đã hoàn thành:** xác định tên file theo quy chuẩn `issue-N-<mô-tả>.md`.
- **Đã hoàn thành:** dùng `online-store-frontend/src/lib/uiEmoji.ts` làm nguồn tập trung cho emoji/ký hiệu UI lặp lại, gồm badge, trạng thái, import, animation và formatter mô tả.
- **Đã hoàn thành:** dùng `online-store-backend/src/utils/cliSymbols.js` làm nguồn tập trung cho prefix log của seed, script và test.
- **Đã hoàn thành:** bổ sung lệnh kiểm tra tĩnh `check:emoji` cho cả frontend và backend; script bỏ qua locale và chỉ kiểm tra phạm vi runtime được chỉ định.
- **Đã hoàn thành:** thay emoji thành công còn hard-code trong log import sản phẩm bằng `CLI_SYMBOLS.success`, giữ nguyên output CLI.
- **Đã hoàn thành:** chạy `online-store-backend` `npm run check:emoji` sau khi chuẩn hóa; không còn ký hiệu CLI hard-code trong các runtime entry point được áp dụng.
- **Đã hoàn thành:** cài dependencies frontend, chạy `npm run check:emoji` và `npm run build`; kiểm tra tĩnh và production build đều thành công.
- **Đã hoàn thành:** rà soát lại toàn repository. Frontend runtime đã được gom qua `uiEmoji.ts`; `localeMetadata.ts` chứa cờ ngôn ngữ được loại trừ có chủ đích khỏi kiểm tra UI.
- **Đã xác định:** backend còn emoji trong một số service, seeder, script và test nằm ngoài danh sách entry point hiện được enforcement. Đây là phạm vi chuẩn hóa tiếp theo, không tự động áp dụng vì cần kiểm tra riêng từng output CLI.
- **Chưa thực hiện:** xác nhận ngoại lệ locale với người duy trì nội dung và tích hợp kiểm tra vào CI. Repository hiện không có workflow CI để mở rộng mà không tự tạo pipeline mới.

Bước tiếp theo là xác nhận các emoji trong locale với người duy trì nội dung và mở rộng backend theo từng nhóm seed, script hoặc test sau khi kiểm tra output CLI. Không thay đổi emoji trong locale nếu chưa có xác nhận về nội dung biên tập.

**Trạng thái cuối:** Đã triển khai quản lý tập trung cho emoji UI và ký hiệu CLI trong phạm vi runtime đã chọn, đồng thời xác thực frontend production build; locale vẫn được giữ nguyên.
