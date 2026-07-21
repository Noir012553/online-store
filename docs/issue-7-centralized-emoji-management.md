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
- **Đã hoàn thành:** chuẩn hóa nhóm backend chỉ ghi log nội bộ gồm backup, chẩn đoán schema, sửa fallback translations, khởi tạo uploads, rebuild indexes, Cloudflare AI và distributed lock qua `CLI_SYMBOLS`; output CLI giữ nguyên.
- **Đã hoàn thành:** mở rộng `check:emoji` backend cho nhóm runtime trên; kiểm tra tĩnh và cú pháp JavaScript đã thành công.
- **Đã xác định:** backend còn emoji trong một số service, seeder, script và test ngoài danh sách entry point đang enforcement. Các route payment/debug và log có thể kèm API response cần được rà soát riêng trước khi chuẩn hóa.
- **Đã hoàn thành thêm:** chuẩn hóa ký hiệu CLI cho migration, clear migration, seed i18n, language, shipping provider, spec translation, cùng các script setup index production và i18n; output CLI hiện tại được giữ nguyên.
- **Đã hoàn thành thêm:** mở rộng `check:emoji` để enforcement các runtime entry point mới và bổ sung các ký hiệu cần thiết vào `src/utils/cliSymbols.js`.
- **Đã xác thực:** `online-store-backend` `npm run check:emoji`, kiểm tra cú pháp JavaScript cho các file vừa thay đổi và `git diff --check` đều thành công.
- **Đã hoàn thành thêm:** chuẩn hóa output CLI cho health check i18n, kiểm tra trạng thái đồng bộ, kiểm kê ngôn ngữ, xác thực tải bản dịch và lịch sử bản dịch; đã mở rộng `CLI_SYMBOLS` cho ký hiệu báo cáo, tiến trình và định dạng terminal, giữ nguyên output hiện tại.
- **Đã hoàn thành thêm:** mở rộng `check:emoji` cho các runtime entry point an toàn vừa chuẩn hóa và nhận diện thêm mũi tên, box-drawing cùng progress bar.
- **Đã xác định:** sau khi mở rộng regex, `npm run check:emoji` hiện phát hiện hard-code đã tồn tại trong controller, seeder và service ngoài phạm vi an toàn; các file này cần rà soát riêng vì có thể liên quan API hoặc dữ liệu nghiệp vụ.
- **Đã hoàn thành thêm:** chuẩn hóa output CLI cho các script chẩn đoán cache dịch, live cache, tên bản dịch và key locale thiếu qua `CLI_SYMBOLS`; output hiện tại được giữ nguyên.
- **Đã hoàn thành thêm:** mở rộng `check:emoji` cho bốn script chẩn đoán chỉ đọc này; kiểm tra cú pháp JavaScript và `git diff --check` đã thành công.
- **Đã xác định:** `npm run check:emoji` hiện vẫn dừng ở bảy file có ký hiệu hard-code tồn tại trước đó (`controller`, `i18n`, `seed`, `test`, `service` và script ngoài nhóm vừa chuẩn hóa). Không thay đổi chúng vì có thể liên quan API response hoặc dữ liệu nghiệp vụ và cần rà soát riêng.
- **Đã hoàn thành thêm:** chuẩn hóa output CLI cho duyệt/từ chối bản dịch, chẩn đoán schema, migration bản dịch, sửa tên danh mục và kiểm tra fallback tiếng Anh qua `CLI_SYMBOLS`; output CLI giữ nguyên.
- **Đã hoàn thành thêm:** bổ sung `speech`, `antenna` và `alert` vào `CLI_SYMBOLS`, đồng thời mở rộng `check:emoji` cho năm runtime entry point mới.
- **Đã xác thực:** kiểm tra cú pháp JavaScript cho toàn bộ file vừa thay đổi và `git diff --check` đều thành công. `check:emoji` vẫn chỉ báo bảy file ngoài nhóm này.
- **Đã hoàn thành thêm:** chuẩn hóa ký hiệu nhánh trong test runner và hướng dẫn chạy seed trong script tái tạo bản dịch qua `CLI_SYMBOLS`, giữ nguyên output CLI.
- **Đã hoàn thành thêm:** tinh chỉnh `check:emoji` chỉ kiểm tra ký hiệu Unicode trong lời gọi `console`, tránh báo sai từ comment, prompt dịch và nội dung không phải CLI.
- **Đã xác thực:** `online-store-backend` `npm run check:emoji`, kiểm tra cú pháp JavaScript và `git diff --check` đều thành công; không còn ký hiệu CLI hard-code trong các runtime entry point được enforcement.
- **Đã hoàn thành thêm:** chuẩn hóa output CLI cho nhóm seeder dịch thương hiệu, features, sản phẩm, retranslation, lịch sử tỷ giá và đồng bộ địa điểm qua `CLI_SYMBOLS`; đã bổ sung các ký hiệu download/trash cần thiết vào registry và giữ nguyên output hiện tại.
- **Đã hoàn thành thêm:** mở rộng `check:emoji` để enforcement các seeder vừa chuẩn hóa.
- **Đã xác thực:** kiểm tra tĩnh, cú pháp JavaScript cho toàn bộ seeder vừa thay đổi và `git diff --check` đều thành công.
- **Đã hoàn thành thêm:** chuẩn hóa output CLI cho bulk approval bản dịch, sửa customer cho order và seed đánh giá qua `CLI_SYMBOLS`; đã bổ sung ký hiệu email vào registry, giữ nguyên output hiện tại.
- **Đã hoàn thành thêm:** mở rộng `check:emoji` cho ba runtime entry point an toàn vừa chuẩn hóa.
- **Đã xác thực:** `online-store-backend` `npm run check:emoji`, kiểm tra cú pháp JavaScript cho năm file thay đổi và `git diff --check` đều thành công.
- **Đã hoàn thành thêm:** chuẩn hóa output CLI cho `src/scripts/rebuild-critical-indexes.js` và `src/seeds/verifyLanguageCompleteness.js` qua `CLI_SYMBOLS`, giữ nguyên nội dung báo cáo và mở rộng danh sách enforcement.
- **Đã xác thực:** `online-store-backend` `npm run check:emoji`, kiểm tra cú pháp JavaScript cho hai entry point vừa thay đổi và `git diff --check` đều thành công.
- **Chưa thực hiện:** rà soát/chuẩn hóa toàn bộ các script diagnostic còn lại và xác nhận ngoại lệ locale với người duy trì nội dung.
- **Chưa thực hiện:** tích hợp kiểm tra vào CI. Repository hiện không có workflow CI để mở rộng mà không tự tạo pipeline mới.

Bước tiếp theo là tiếp tục theo từng nhóm `src/scripts/` và seeder backend có output CLI; sau đó xác nhận các emoji trong locale với người duy trì nội dung. Không thay đổi emoji trong locale, test fixture, report lưu file hoặc API response nếu chưa xác nhận phạm vi nội dung.

**Trạng thái cuối:** Đã triển khai quản lý tập trung cho emoji UI và ký hiệu CLI trong phạm vi runtime được kiểm tra, hiện đã bao phủ thêm nhóm migration, seed i18n/ngôn ngữ/nhà vận chuyển/spec translation và setup index. Frontend production build, backend kiểm tra tĩnh và cú pháp JavaScript đều đã được xác thực; vẫn còn các nhóm backend cần rà soát, locale vẫn được giữ nguyên.

## Phát hiện rà soát bổ sung

Các vị trí dưới đây vẫn dùng emoji/ký hiệu Unicode hard-code trong mã thực thi. Chúng không được thay đổi trong đợt rà soát này.

### API và nội dung gửi người dùng

- **Trung bình — `online-store-backend/src/routes/paymentRoutes.js:72-87, 251-290`:** endpoint debug trả emoji và số thứ tự keycap trực tiếp trong JSON response, gồm `✅`, `❌`, `⚠️` và `1️⃣` đến `7️⃣`. Các chuỗi này trở thành một phần của contract API/debug thay vì output CLI; `check:emoji` backend chỉ kiểm tra lời gọi `console.*` nên không phát hiện. Cần quyết định riêng liệu giữ chúng là nội dung debug có chủ đích, hay tách trạng thái/nhãn khỏi response trước khi chuẩn hóa.
- **Trung bình — `online-store-backend/src/services/emailService.js:311-337`:** template newsletter gửi ra ngoài hard-code `✨` và `📧`. Đây là nội dung hướng tới khách hàng, không phải ký hiệu CLI và cũng nằm ngoài phạm vi kiểm tra tĩnh. Cần phân loại là nội dung marketing hợp lệ hoặc chuyển quyền sở hữu biểu tượng cho template/locale trước khi thay đổi.

### Seeder và test runtime ngoài enforcement

- **Thấp — `online-store-backend/src/seeds/orderSeederEnhanced.js:80-231`:** seeder còn dùng `❌`, `🗑️`, `📦`, `✅`, `📊` trong cả `throw new Error(...)` lẫn `console.log(...)`. File không nằm trong `scripts/check-cli-symbols.js`; riêng chuỗi lỗi cũng không bị rule hiện tại phát hiện do rule chỉ kiểm tra `console.*`.
- **Thấp — `online-store-backend/src/test/test-shadow-writes.js:26-182`:** test thực thi độc lập vẫn hard-code `🔄`, `✅`, `❌`, `🧹`, `📝`, `📦`, `📋`, `⚡`, `🕐`, `📊`, `🔌` trong output terminal. File không thuộc danh sách enforcement, do đó `npm run check:emoji` vẫn có thể thành công khi test này không dùng `CLI_SYMBOLS`.
- **Trung bình — `online-store-frontend/scripts/check-ui-emoji.js:5-20`, `online-store-frontend/src/test/offline-manual.js:17-20`:** kiểm tra frontend chỉ quét `.ts`/`.tsx` trong `src/components`, `src/pages`, `src/lib`, đồng thời bỏ qua thư mục `test`. Trong khi đó `npm test` chạy `src/test/offline-manual.js`, file này hard-code `✓`, `✗`, `ℹ`, `⚠`. Cần mở rộng kiểm tra sang test JavaScript hoặc ghi rõ đây là ngoại lệ CLI/test có chủ đích.

**Cập nhật bước tiếp theo:** rà soát và phân loại riêng nhóm response API cùng template email trước vì không được phép thay thế bằng ký hiệu CLI. Sau đó có thể chuẩn hóa `orderSeederEnhanced.js` và `test-shadow-writes.js` qua `CLI_SYMBOLS`, đồng thời quyết định phạm vi enforcement cho test JavaScript frontend.

### Phát hiện rà soát tiếp theo

- **Trung bình — `online-store-backend/src/scripts/migrate-translations.js:52, 137-142, 152, 206-211, 221, 238, 246, 249, 270-287, 301, 315-317, 326, 332`:** script migration vẫn hard-code `📦`, `💬`, `🔍`, `🚀`, `📊`, `✅`, `❌`, `⚠️` và `🔌` trong output CLI. File đã xuất hiện trong `online-store-backend/scripts/check-cli-symbols.js:61`, nhưng lệnh `npm run check:emoji` hiện vẫn báo thành công. Đây là trạng thái không nhất quán giữa mã nguồn, danh sách enforcement và kết quả kiểm tra; cần xác minh bộ quét thực tế đang đọc đúng file/worktree trước khi coi tiêu chí kiểm tra tĩnh là đạt.
- **Trung bình — `online-store-backend/scripts/drop-livetranslationcache.js:41-93, 118-123, 156, 183, 201-227, 237-276`:** script vận hành có emoji và box-drawing hard-code trong `console.*`; đồng thời ghi các ký hiệu này vào `PHASE_4_COMPLETION.txt` qua `completionLog`. File không thuộc `checkedFiles` của `check-cli-symbols.js`, và phần nội dung ghi file không thể được phát hiện ngay cả khi chỉ quét các lời gọi `console.*`. Khi chuẩn hóa cần phân biệt output terminal với báo cáo lưu file để tránh thay đổi format artifact ngoài ý muốn.
- **Thấp — nhóm test backend ngoài enforcement:** `online-store-backend/src/test/test-blueprint-3phase.js:21-27, 36-47, 61, 94-95, 108, 132, 156, 199, 207-209, 232, 260-279`; `test-translation-e2e.js:39-47, 50, 67, 86-96, 103, 126, 144, 160, 183, 187-200, 217`; `check-db-state.js:19-22, 25, 33, 46, 59-62`; `check-db-brands.js`; `check-brands.js`; `test-language-sync.js`; `test-phase4-e2e.js`; `test-phase4-e2e-simplified.js`; và `test-rollback-procedures.js` vẫn dùng emoji/ký hiệu Unicode trực tiếp. Các file này không nằm trong danh sách `checkedFiles`, nên kiểm tra hiện tại không đảm bảo quy ước CLI cho các test chạy độc lập.
- **Thấp — `online-store-backend/src/test/test-phase4-e2e.js:366, 385` và các test phase 4 liên quan:** emoji còn nằm trong tên `test(...)`, không phải lời gọi `console.*`. Chính sách hiện hành chỉ dò các dòng `console.log`, `console.warn`, `console.error`, `console.time` và `console.timeEnd` tại `check-cli-symbols.js:69-75`; vì vậy sẽ bỏ qua Unicode ở tiêu đề test, template string lưu file, lỗi ném ra và wrapper logger. Cần quyết định rõ các ngữ cảnh này là ngoại lệ hợp lệ hay mở rộng quy tắc theo từng loại.
- **Thấp — `online-store-frontend/scripts/check-ui-emoji.js:5-20, 46-49`:** checker frontend chỉ quét TypeScript trong `src/components`, `src/pages`, `src/lib` và chủ đích bỏ qua `src/test/**`; vì vậy `online-store-frontend/src/test/offline-manual.js:17-20` là test chạy bởi `npm test` nhưng vẫn có `✓`, `✗`, `ℹ`, `⚠` ngoài enforcement. `src/lib/i18n/localeMetadata.ts` cũng bị loại trừ, nhưng cờ quốc gia tại dòng `14-59` là metadata ngôn ngữ đã được ghi nhận là ngoại lệ có chủ đích, không phải lỗi cần tự động chuẩn hóa.

**Cập nhật bước tiếp theo:** ưu tiên xác minh vì sao `check:emoji` backend không báo `src/scripts/migrate-translations.js` dù file được liệt kê trong `checkedFiles` và có ký hiệu khớp regex. Sau đó xác nhận phạm vi enforcement cho các test độc lập, output ghi file và wrapper logger; không thay đổi emoji trong các nhóm này trước khi chốt quy ước.

### Phát hiện rà soát bổ sung — service và adapter backend

- **Trung bình — `online-store-backend/src/adapters/payment/VnpayAdapter.js:262, 351`:** adapter thanh toán ghi trực tiếp `✅` khi tạo URL thanh toán và `❌` khi xác thực chữ ký webhook thất bại. Đây là `console.*` nội bộ, không thuộc API response, nhưng adapter không có trong `checkedFiles` của `scripts/check-cli-symbols.js:5-67`; vì vậy kiểm tra tĩnh không phát hiện. Cần phân loại rõ log của payment adapter là ký hiệu CLI/log vận hành để chuẩn hóa qua `CLI_SYMBOLS`, hoặc ghi nhận nó là ngoại lệ có chủ đích.
- **Trung bình — `online-store-backend/src/services/ghnService.js:59-66, 387-405, 513-515, 553-554`:** service vận chuyển GHN hard-code `⚠️` và `❌` trong cảnh báo ID quận/huyện, chẩn đoán request, fallback dịch vụ và lỗi tạo shipment. Các log có thể chứa bối cảnh vận hành của tích hợp bên thứ ba, nhưng service này không nằm trong `checkedFiles`; cần tách quyết định chuẩn hóa log nội bộ khỏi bất kỳ response trả về cho caller.
- **Thấp — `online-store-backend/src/services/rateLimitHandler.js:58-60, 197-199, 235-237, 270-272`:** handler translation rate limit dùng `📌`, `🔄`, `✏️`, `📝` trong `console.log`. Đây là output nội bộ của workflow quản trị, không nằm trong enforcement hiện tại. Có thể chuẩn hóa cùng nhóm job/translation sau khi xác nhận `CLI_SYMBOLS` là owner phù hợp.
- **Thấp — `online-store-backend/src/services/productTranslationSeederService.js:71, 107, 112-125, 148, 155, 167-169, 212-214, 236, 242, 333-356, 364`:** service seeding/dịch sản phẩm dùng `📦`, `⏸️`, `🎯`, `✅`, `⚠️`, `❌`, `📊`, `💡`, `🔄`, `⏭️` trong log tiến trình và lỗi. File là runtime service nhưng không có trong `checkedFiles`; do đó trạng thái pass của checker không bao phủ workflow này.
- **Thấp — `online-store-backend/src/services/translationSeederHelper.js:443, 466-468, 500, 526, 547, 579-581, 627-629`:** helper seeding/dịch vẫn ghi `⏭️`, `❌`, `⚠️`, `🔄` vào output terminal. File này cũng ngoài phạm vi checker, cần được xếp cùng nhóm translation job thay vì coi là locale hoặc nội dung gửi người dùng.
- **Thấp — `online-store-backend/src/services/translationSeederService.js:268-270` và `online-store-backend/src/seeds/translationSeeder.js:118-120`:** hai entry point translation seed còn dùng lần lượt `✓` và `❌` trong console/error output. Cả hai không có trong `checkedFiles`, cho thấy enforcement hiện chỉ bao phủ một phần các workflow seed.

**Kết luận rà soát:** `check-cli-symbols.js` hiện chỉ quét danh sách allowlist tĩnh và chỉ dò ký hiệu trên cùng dòng với `console.log`, `console.warn`, `console.error`, `console.time` hoặc `console.timeEnd` (`online-store-backend/scripts/check-cli-symbols.js:5-75`). Vì vậy kết quả pass không thể được diễn giải là không còn ký hiệu Unicode hard-code trên toàn bộ runtime backend. Trước khi mở rộng checker, cần phân loại service payment, shipping và translation job để tránh áp dụng `CLI_SYMBOLS` máy móc lên log có yêu cầu vận hành hay bảo mật riêng.

### Phát hiện rà soát bổ sung — controller backend

- **Thấp — `online-store-backend/src/controllers/shippingProviderController.js:430-436`:** flow đồng bộ địa điểm đã dùng `CLI_SYMBOLS` cho các log khác nhưng vẫn hard-code `⏱️` trong `console.timeEnd` khi chạy môi trường development. Controller không nằm trong `checkedFiles`, nên checker không phát hiện điểm không nhất quán này. Cần quyết định có đưa nhãn timer vào registry hay ghi nhận đây là ký hiệu debug chỉ dành cho development.
- **Thấp — `online-store-backend/src/controllers/shipmentController.js:181-186`:** nhánh fallback khi danh sách dịch vụ GHN rỗng ghi trực tiếp `⚠️` trong `console.warn`; log chỉ chạy ở development và không đi vào response API. Controller ngoài phạm vi enforcement hiện tại, vì vậy cần phân loại cùng nhóm log vận hành/debug shipping trước khi chuẩn hóa.

**Cập nhật bước tiếp theo:** rà soát các controller và adapter đã dùng một phần `CLI_SYMBOLS` để tìm ký hiệu còn sót trong timer, wrapper logger hoặc nhánh development; không coi các ký hiệu debug này là nội dung API nếu chưa kiểm tra đường đi của response.

### Phát hiện rà soát bổ sung — lỗi phạm vi checker và formatter

- **Trung bình — `online-store-frontend/src/components/ProductDescriptionFormatter.tsx:86-110`:** hàm `isEmoji` nhận một UTF-16 code unit từ `processedText[i]`, nhưng lại kiểm tra các khoảng code point emoji ngoài BMP. Các emoji như `📌`, `🔥`, `💡`, `📱`, `💻` là surrogate pair, nên không khớp `DESCRIPTION_EMOJI` và cũng không khớp điều kiện `charCodeAt(0)`; logic chèn ngắt dòng trước emoji vì vậy không chạy với phần lớn emoji được khai báo trong `uiEmoji.ts`. Cần duyệt theo Unicode code point (ví dụ `for...of` hoặc `Array.from`) và vẫn quy đổi đúng chỉ số chuỗi trước khi tạo `breakPositions`.
- **Trung bình — `online-store-backend/scripts/check-cli-symbols.js:15-25, 45-67` và `online-store-backend/src/scripts/setup-production-indexes.js:20-107`:** checker đang enforce `scripts/setup-production-indexes.js` (thư mục gốc) nhưng entry point đang có emoji hard-code là `src/scripts/setup-production-indexes.js`; tương tự danh sách còn trộn hai cây `scripts/` và `src/scripts/`. Vì vậy `npm run check:emoji` vẫn báo thành công dù `src/scripts/setup-production-indexes.js` có `✅`, `📍`, `✓`, `✨`, `📋`, `🎉`, `❌` trực tiếp trong `console.*`. Cần đối chiếu từng entry point thực sự được chạy, loại bỏ đường dẫn legacy nếu không dùng và thêm file runtime tương ứng vào enforcement.
- **Thấp — `online-store-backend/src/scripts/fix-truncated-translations.js:24-114`, `retranslate.js:10-57`, `translateReject.js:13-84` và `translate-batch.js:167-300`:** các script sửa dữ liệu và duyệt/dịch bản dịch vẫn hard-code nhiều emoji/ký hiệu CLI (`🔧`, `✅`, `📊`, `🗑️`, `🔄`, `❌`, `⚠️`, `💡`, box-drawing) nhưng đều nằm ngoài `checkedFiles`. Đây là các script có thể được chạy qua `package.json` hoặc thủ công, nên kết quả pass hiện tại không bao phủ đầy đủ CLI runtime. Cần đưa chúng vào `CLI_SYMBOLS` và checker sau khi xác định format output/lưu file nào là artifact cần giữ nguyên.

**Cập nhật bước tiếp theo:** sửa danh sách enforcement để phản ánh entry point thực tế trước, rồi chuẩn hóa theo nhóm script translation. Khi điều chỉnh formatter frontend, cần kiểm tra lại ngắt dòng với cả emoji BMP (`✓`, `⚠️`) lẫn emoji surrogate pair (`📌`, `🔥`) để không thay đổi nội dung hiển thị ngoài ý muốn.

### Phát hiện rà soát bổ sung — entry point CLI chưa được enforcement

- **Trung bình — `online-store-backend/src/scripts/performance-benchmark.js:36-44, 383-401`:** `PerformanceBenchmark.log` lưu `📊`, `✅`, `⚠️`, `❌` và `•` trong object `prefix`; phần tổng kết còn hard-code `🎉`, `🎯`, `↓`, `↑`. `scripts/check-cli-symbols.js` có liệt kê file này tại dòng 25, nhưng chỉ dò Unicode trên cùng dòng với `console.*` tại dòng 75. Vì ký hiệu được lấy từ object/biến trước khi truyền vào `console.log`, checker cho kết quả pass dù output CLI vẫn hard-code. Cần mở rộng checker theo AST hoặc kiểm tra literal Unicode trong toàn bộ entry point đã enforcement, đồng thời loại trừ có chủ đích các nội dung không phải CLI nếu cần.
- **Thấp — `online-store-backend/src/scripts/fix-category-translations.js:264-400`:** hai lệnh package `npm run fix:category-translations` và `npm run fix:category-translations:dry-run` (`package.json:31-32`) còn hard-code `❌`, `🔌`, `✅`, `🧪`, `📂`, `⚠️`, `⏭️`, `📝`, `🔍`, `📊` và `→` trong output migration/upsert. File nằm ngoài `checkedFiles`, trong khi đây là script có ghi dữ liệu MongoDB. Cần chuẩn hóa qua `CLI_SYMBOLS` sau khi xác nhận các ký hiệu trong báo cáo là output terminal thuần túy, không phải format mà quy trình vận hành phụ thuộc.
- **Thấp — `online-store-backend/src/scripts/reseed-categories.js:15-45`:** script có `🔌`, `✅`, `📝`, `📋`, `❌` trực tiếp trong console khi upsert category. File không nằm trong `checkedFiles`; đồng thời package hiện chỉ expose `categories:sync` tới `reseed-categories-simple.js` (`package.json:30`), nên trước khi thay đổi cần xác nhận `reseed-categories.js` còn là entry point được vận hành hay là script legacy. Dù vậy, đây vẫn là vị trí cần đánh dấu để tránh mở rộng enforcement cho file không còn được gọi.

**Cập nhật bước tiếp theo:** ưu tiên sửa lỗ hổng kiểm tra của `performance-benchmark.js`, vì file đã được liệt kê trong enforcement nhưng checker vẫn không nhận ra symbol lấy gián tiếp qua biến. Sau đó rà soát các lệnh package còn lại để danh sách `checkedFiles` phản ánh entry point thực sự được chạy; không chuẩn hóa các script legacy khi chưa xác minh chúng còn được sử dụng.

### Phát hiện rà soát bổ sung — package script và utility kiểm tra dữ liệu

- **Trung bình — `online-store-backend/package.json:44`, `online-store-backend/src/scripts/test-translation-quality.js:14-57`:** lệnh package `npm run test:translation-quality` chạy trực tiếp một script còn hard-code `🧪`, `═`, `✅`, `📚`, `📖` và `❌` trong output CLI. Đây là entry point runtime được expose cho người vận hành nhưng không xuất hiện trong `checkedFiles` tại `online-store-backend/scripts/check-cli-symbols.js:5-67`; vì vậy `npm run check:emoji` không kiểm soát được các ký hiệu này. Có thể chuẩn hóa bằng `CLI_SYMBOLS` sau khi xác nhận toàn bộ output chỉ dành cho terminal.
- **Thấp — `online-store-backend/src/test/check-db-brands.js:10-52`:** utility kiểm tra thương hiệu trong cơ sở dữ liệu vẫn hard-code `📊`, `✅`, `📝`, `⚠️`, `🔍`, `📦`, `📈`, `•` và `❌` trong `console.*`. File không nằm trong allowlist checker và cũng không được expose qua package script hiện tại, nên phù hợp để ghi nhận là script chạy tay/diagnostic ngoài enforcement trước khi quyết định nó còn được vận hành hay là legacy.

**Cập nhật bước tiếp theo:** rà soát các entry point được khai báo trong `package.json` trước để ưu tiên phạm vi runtime thực sự được gọi. Với utility không được package expose, cần xác minh tình trạng sử dụng trước khi thêm vào enforcement, tránh mở rộng quy ước sang file legacy không còn chạy.

### Tiến độ xử lý mới

- **Đã hoàn thành:** chuẩn hóa `online-store-backend/src/scripts/test-translation-quality.js` để dùng `CLI_SYMBOLS` cho toàn bộ ký hiệu output CLI, giữ nguyên text và format hiển thị.
- **Đã hoàn thành:** bổ sung `bookOpen` vào `online-store-backend/src/utils/cliSymbols.js` để quản lý ký hiệu `📖`.
- **Đã hoàn thành:** chuẩn hóa `online-store-backend/src/test/check-db-brands.js` bằng `CLI_SYMBOLS`, bao gồm các ký hiệu báo cáo, cảnh báo, tìm kiếm, danh sách và lỗi; loại bỏ import không sử dụng.
- **Đã hoàn thành:** thêm hai entry point vào allowlist của `online-store-backend/scripts/check-cli-symbols.js`.
- **Đã xác thực:** `online-store-backend npm run check:emoji`, kiểm tra cú pháp JavaScript cho bốn file thay đổi và `git diff --check` đều thành công.
- **Đã hoàn thành thêm:** chuẩn hóa ký hiệu CLI cho `src/scripts/fix-category-translations.js`, `retranslate.js`, `translateReject.js` và `setup-production-indexes.js` qua `CLI_SYMBOLS`; output terminal được giữ nguyên.
- **Đã hoàn thành thêm:** mở rộng allowlist `check-cli-symbols.js` cho bốn entry point runtime trên.
- **Đã sửa:** bổ sung import `mongoose` duy nhất cho `src/scripts/translateHistory.js` và `translateReport.js`, tránh lỗi runtime khi các lệnh này đóng kết nối trong `finally`.
- **Đã xác thực:** checker emoji, kiểm tra cú pháp toàn bộ nhóm translation CLI và `git diff --check` đều thành công.

**Bước tiếp theo:** tiếp tục xử lý các entry point package/runtime còn hard-code đã được liệt kê trong các mục trước; chưa xử lý các nhóm API response, email template, locale, report lưu file và script legacy nếu chưa xác nhận phạm vi nội dung.
