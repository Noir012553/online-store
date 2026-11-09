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

- Quy tắc áp dụng toàn ứng dụng như reset, nền tảng, theme hoặc biến CSS: `src/styles/index.css`.
- Cần selector phức tạp, hiệu ứng/keyframes đặc thù hoặc cấu trúc không phù hợp với utility class.
- Một component thực sự cần style riêng khó biểu đạt rõ ràng bằng Tailwind: dùng CSS Module cạnh component hoặc trong `src/styles/`.

Tránh khai báo lại trong CSS những style đã có thể diễn đạt gọn bằng Tailwind. Không trộn nhiều cách cho cùng một thuộc tính nếu không có lý do rõ ràng.

## Dùng inline style khi

Chỉ dùng `style={{...}}` cho giá trị động tại runtime, chẳng hạn giá trị tính toán từ dữ liệu hoặc biến CSS được cập nhật bằng JavaScript. Với giá trị cố định, ưu tiên utility class hoặc CSS phù hợp.

## Tóm tắt

1. Tailwind trong JSX là lựa chọn mặc định.
2. CSS toàn cục dành cho quy tắc toàn ứng dụng.
3. CSS Module dành cho selector/hiệu ứng phức tạp hoặc style đặc thù của component.
4. Inline style chỉ dành cho giá trị động.
