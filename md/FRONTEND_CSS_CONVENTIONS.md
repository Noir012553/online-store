# Quy ước CSS Frontend

## Mặc định

Dùng Tailwind CSS trực tiếp trong `className` cho style gắn với một component: bố cục, khoảng cách, màu sắc, typography, responsive và trạng thái tương tác.

```tsx
<button className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700">
  Lưu
</button>
```

Không chuyển một nhóm utility nhỏ, chỉ dùng một lần, sang file CSS riêng. Giữ các class liên quan cùng component để dễ đọc và chỉnh sửa.

## Dùng file CSS khi

- Quy tắc áp dụng toàn ứng dụng như reset, nền tảng, theme hoặc biến CSS: `src/css/styles/index.css`.
- Một component hoặc trang cần nhiều quy tắc riêng, selector phức tạp, responsive đặc thù, trạng thái tương tác hoặc keyframes: dùng CSS Module dưới `src/css/components/` hoặc `src/css/pages/`, theo nhóm đã nêu trong phần tổ chức thư mục.
- Khối CSS trong JSX dài hoặc lặp lại cần được tách ra để dễ đọc, bảo trì và giới hạn phạm vi selector: chuyển sang CSS Module.

Ưu tiên CSS Module cho CSS tĩnh gắn với component. Không viết `<style>` thường trong JSX vì selector có thể áp dụng toàn cục; cũng không dùng `<style jsx>` làm nơi lưu các khối CSS tĩnh dài. Chỉ giữ style trong JSX khi có lý do kỹ thuật cụ thể và phạm vi ảnh hưởng đã rõ.

Không chuyển một nhóm utility nhỏ, chỉ dùng một lần, sang file CSS. Tránh khai báo lại trong CSS những style đã có thể diễn đạt gọn bằng Tailwind và không trộn nhiều cách cho cùng một thuộc tính nếu không có lý do rõ ràng.

## Dùng inline style khi

Chỉ dùng `style={{...}}` cho giá trị động tại runtime, chẳng hạn giá trị tính toán từ dữ liệu hoặc biến CSS được cập nhật bằng JavaScript. Với giá trị cố định, ưu tiên utility class hoặc CSS phù hợp. Nếu CSS Module cần nhận giá trị động, truyền giá trị đó qua CSS custom property thay vì chuyển toàn bộ style tĩnh sang inline style.

## Responsive layout

Ưu tiên cách viết mobile-first: đặt kiểu mặc định cho màn hình nhỏ, rồi dùng breakpoint như `sm:`, `md:`, `lg:` khi bố cục cần thay đổi. Dùng utility responsive cho các điều chỉnh thông thường; chỉ đưa media query vào CSS Module khi quy tắc responsive phức tạp hoặc gắn với selector riêng của component.

Khi chỉnh CSS hiện có, giữ nguyên breakpoint và hành vi responsive nếu yêu cầu không bao gồm thay đổi thiết kế.

## Trạng thái tương tác và accessibility

Dùng variant Tailwind ngay trong `className` cho các trạng thái phổ biến mà component cung cấp, như `hover:`, `focus-visible:`, `disabled:`, `data-[state=active]:` và `aria-invalid:`.

```tsx
<button className="bg-red-600 text-white hover:bg-red-700 focus-visible:outline-2 disabled:opacity-50">
  Lưu
</button>
```

Không chỉ dựa vào `hover` để thể hiện trạng thái; giữ kiểu focus nhìn thấy được khi điều hướng bằng bàn phím. Dùng CSS Module khi trạng thái cần selector kết hợp hoặc hiệu ứng không thể diễn đạt gọn bằng variant.

## Motion

Dùng utility cho transition đơn giản. Dùng CSS Module cho keyframes hoặc animation nhiều trạng thái. Global stylesheet áp dụng baseline `prefers-reduced-motion` để rút ngắn animation, transition và cuộn mượt trên toàn ứng dụng. Với hiệu ứng còn gây chuyển động đáng kể, như dịch chuyển hoặc lắc lặp, dùng `motion-safe:` cho hiệu ứng hoặc tắt riêng bằng `motion-reduce:`/CSS Module; giữ chỉ báo trạng thái cần thiết ở dạng tĩnh.

## Màu sắc và theme

Ưu tiên utility/token theme sẵn có cho màu mang ý nghĩa như `bg-primary`, `text-muted-foreground` hoặc `border-border`. Duy trì bảng màu hiện tại của giao diện; chỉ dùng màu tùy chỉnh khi token hiện có không đáp ứng đúng thiết kế. Tránh lặp lại giá trị màu cố định qua inline style.

## Tổ chức thư mục CSS

Tập trung các file CSS dưới `online-store-frontend/src/css/`, giữ thư mục con theo nhóm để tránh trùng tên:

- `src/css/styles/`: stylesheet toàn cục và style dùng chung như `index.css`.
- `src/css/components/` và `src/css/components/admin/`: CSS Module của component.
- `src/css/pages/admin/`: CSS Module của trang admin.

Khi chuyển các file hiện có, chạy từ thư mục gốc repository. Dùng `git mv` với đường dẫn đích rõ ràng; không gom phẳng bằng wildcard vì có thể trùng tên file:

```sh
cd online-store-frontend
mkdir -p src/css/styles src/css/components/admin src/css/pages/admin

git mv src/styles/index.css src/css/styles/index.css
git mv src/styles/login.module.css src/css/styles/login.module.css
git mv src/components/Footer.module.css src/css/components/Footer.module.css
git mv src/components/HamsterLoader.module.css src/css/components/HamsterLoader.module.css
git mv src/components/HomeContent.module.css src/css/components/HomeContent.module.css
git mv src/components/admin/TranslationManagementPage.module.css src/css/components/admin/TranslationManagementPage.module.css
git mv src/pages/admin/auditLogViewer.module.css src/css/pages/admin/auditLogViewer.module.css
git mv src/pages/admin/dashboard.module.css src/css/pages/admin/dashboard.module.css
git mv src/pages/admin/i18nMonitoring.module.css src/css/pages/admin/i18nMonitoring.module.css
git mv src/pages/admin/translationBatchOverride.module.css src/css/pages/admin/translationBatchOverride.module.css
git mv src/pages/admin/translationManualOverride.module.css src/css/pages/admin/translationManualOverride.module.css
git mv src/pages/admin/translationsStatic.module.css src/css/pages/admin/translationsStatic.module.css
```

Sau khi di chuyển, cập nhật tất cả import CSS Module và import stylesheet toàn cục tới vị trí mới; không giữ bản sao ở đường dẫn cũ. Chạy typecheck, build và kiểm tra các trang/component đã đổi import trước khi hoàn tất. Các file CSS mới cũng phải được tạo trong nhóm thư mục tương ứng dưới `src/css/`.

## Chuyển đổi CSS hiện có

Khi tách style từ JSX sang CSS Module, giữ nguyên giá trị và breakpoint hiện tại; không đồng thời chỉnh lại thiết kế hoặc sửa selector toàn cục. Thực hiện theo từng component/trang và kiểm tra giao diện sau mỗi lần chuyển để phát hiện thay đổi do specificity hoặc scope.

## Tóm tắt

1. Tailwind trong JSX là lựa chọn mặc định cho style component thông thường.
2. CSS toàn cục chỉ dành cho quy tắc áp dụng toàn ứng dụng.
3. CSS Module là nơi ưu tiên cho CSS tĩnh, dài hoặc phức tạp của component/trang.
4. Tránh `<style>` và các khối `<style jsx>` tĩnh dài trong JSX.
5. Inline style chỉ dành cho giá trị động.
6. Dùng breakpoint mobile-first và giữ nguyên hành vi responsive hiện có khi không có yêu cầu đổi thiết kế.
7. Dùng variant Tailwind cho trạng thái tương tác; giữ trạng thái focus bàn phím và tôn trọng reduced motion.
8. Ưu tiên theme token cho màu ngữ nghĩa, tránh sao chép màu tĩnh vào inline style.
9. Lưu stylesheet trong `src/css/` theo nhóm `styles/`, `components/` hoặc `pages/`; cập nhật import khi di chuyển.
