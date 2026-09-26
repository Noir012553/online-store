# Tổng quan dự án cửa hàng trực tuyến

## 1. Giới thiệu

Đây là hệ thống cửa hàng trực tuyến tập trung vào sản phẩm laptop và thiết bị công nghệ. Hệ thống gồm giao diện storefront cho khách hàng và khu vực quản trị; backend cung cấp API, xử lý nghiệp vụ, lưu dữ liệu và kết nối với các dịch vụ bên ngoài.

Các chức năng chính gồm xem/tìm kiếm sản phẩm, giỏ hàng, thanh toán, theo dõi đơn hàng, tài khoản khách hàng và quản trị sản phẩm, đơn hàng, danh mục, khuyến mãi cùng nội dung cửa hàng. Giao diện hỗ trợ đa ngôn ngữ và nhiều loại tiền tệ.

## 2. Kiến trúc tổng thể

```text
Người dùng
   │
   ▼
Next.js / React (online-store-frontend)
   │  Request /api/* được Next.js rewrite tới backend
   ▼
Express REST API + Socket.IO (online-store-backend)
   ├── MongoDB qua Mongoose
   ├── VNPay / thanh toán COD
   ├── GHN / vận chuyển
   ├── Cloudflare R2 / lưu trữ ảnh
   └── Cloudflare AI và LibreTranslate / dịch nội dung
```

Frontend và backend là hai ứng dụng riêng. Frontend gửi request API qua đường dẫn `/api`; cấu hình rewrite trong Next.js chuyển request sang backend. Backend tổ chức xử lý theo routes, controllers, services và models. MongoDB lưu dữ liệu nghiệp vụ cùng dữ liệu cache bản dịch.

## 3. Cấu trúc repository

```text
online-store/
├── online-store-frontend/       # Ứng dụng giao diện Next.js
│   └── src/
│       ├── pages/               # Trang và route theo Pages Router
│       ├── components/          # Thành phần giao diện dùng lại
│       ├── context/             # State dùng chung qua React Context
│       ├── hooks/               # Custom hooks
│       ├── lib/                 # API client, tiện ích, dịch thuật
│       ├── locales/             # Bản dịch và dữ liệu i18n phía giao diện
│       └── styles/              # CSS và style toàn cục
├── online-store-backend/        # API và nghiệp vụ phía máy chủ
│   └── src/
│       ├── app.js               # Khởi tạo Express, middleware và server
│       ├── routes/              # Khai báo endpoint API
│       ├── controllers/         # Nhận request, điều phối response
│       ├── services/            # Nghiệp vụ và tích hợp dịch vụ ngoài
│       ├── models/              # Schema và model Mongoose
│       ├── middleware/          # Xác thực, phân quyền, validation, giới hạn request
│       ├── config/              # Cấu hình ứng dụng và dịch vụ
│       ├── seeds/               # Khởi tạo dữ liệu và bản dịch
│       ├── locales/             # File bản dịch theo ngôn ngữ
│       ├── scripts/             # Công cụ vận hành, migration, kiểm tra
│       └── test/                # Test và test runner
├── libretranslate-tool/         # Công cụ liên quan LibreTranslate
└── md/                          # Tài liệu kỹ thuật dự án
```

Mỗi ứng dụng có `package.json` riêng; lệnh frontend chạy trong `online-store-frontend`, lệnh backend chạy trong `online-store-backend`.

## 4. Công nghệ sử dụng

| Phần | Công nghệ | Vai trò |
|---|---|---|
| Frontend | Next.js 16, React 19, TypeScript | Xây dựng trang web, điều hướng và giao diện tương tác |
| UI | Tailwind CSS 4, Radix UI, Lucide | Style, thành phần giao diện và biểu tượng |
| State và dữ liệu | React Context, TanStack Query, Axios | State dùng chung, quản lý request và gọi API |
| Backend | Node.js, Express 5 | Cung cấp REST API và xử lý nghiệp vụ |
| Database | MongoDB, Mongoose | Lưu tài khoản, sản phẩm, đơn hàng và dữ liệu liên quan |
| Realtime | Socket.IO | Gửi sự kiện cập nhật theo thời gian thực |
| Xác thực | JWT, bcrypt | Xác thực phiên/token và băm mật khẩu |
| Thanh toán | VNPay, COD | Tạo và xử lý các phương thức thanh toán |
| Vận chuyển | GHN | Tích hợp dịch vụ giao hàng |
| Lưu trữ media | Cloudflare R2, AWS S3 SDK | Tải lên và lưu trữ ảnh/tệp |
| Dịch thuật | Cloudflare AI, LibreTranslate | Dịch nội dung động và hỗ trợ cơ chế dự phòng |

## 5. Cách tổ chức nghiệp vụ

- **Routes** ánh xạ URL và HTTP method đến controller.
- **Controllers** kiểm tra request, gọi xử lý nghiệp vụ và tạo response.
- **Services** chứa nghiệp vụ cần tái sử dụng, xử lý tích hợp và các luồng phức tạp.
- **Models** định nghĩa schema MongoDB qua Mongoose.
- **Middleware** xử lý xác thực, phân quyền, validation, CORS và giới hạn request.
- **Frontend** chia trang, components, hooks, context và thư viện gọi API để tách phần hiển thị khỏi logic dùng chung.

## 6. Một số luồng tiêu biểu

### Mua hàng

1. Khách hàng duyệt/tìm sản phẩm và thêm vào giỏ.
2. Frontend gửi thông tin checkout đến API.
3. Backend xác thực dữ liệu, tạo đơn hàng và xử lý phương thức thanh toán.
4. Trạng thái được lưu trong MongoDB; một số cập nhật được phát qua Socket.IO.

### Quản trị

1. Người quản trị đăng nhập.
2. Middleware kiểm tra token và quyền truy cập.
3. Frontend gọi các API quản trị để quản lý sản phẩm, đơn hàng và nội dung.
4. Controller và service cập nhật dữ liệu qua các model Mongoose.

### Đa ngôn ngữ

- Bản dịch giao diện được tổ chức thành các file JSON theo ngôn ngữ và namespace.
- Nội dung động như thông tin sản phẩm được xử lý qua dịch vụ và cache bản dịch riêng.
- Frontend chọn ngôn ngữ, tải namespace cần thiết và hiển thị bản dịch tương ứng.

## 7. Chạy ứng dụng khi demo

Cài dependencies riêng trong từng ứng dụng, sau đó chạy frontend và backend ở hai terminal:

```powershell
cd online-store-backend
npm install
npm run dev
```

```powershell
cd online-store-frontend
npm install
npm run dev
```

Frontend dùng cổng mặc định `3000`; backend dùng cổng mặc định `5000`. Cần cấu hình các biến môi trường cần thiết, đặc biệt là kết nối MongoDB và thông tin dịch vụ tích hợp, trong file môi trường cục bộ. Không đưa giá trị bí mật của `.env` vào tài liệu hoặc slide.

## 8. Gợi ý giới thiệu khi bảo vệ

> Đồ án của em là hệ thống cửa hàng trực tuyến chuyên về laptop và thiết bị công nghệ. Hệ thống được chia thành frontend Next.js/React và backend Node.js/Express; hai phần trao đổi qua REST API, backend sử dụng MongoDB để lưu dữ liệu. Các chức năng chính gồm tìm kiếm và xem sản phẩm, giỏ hàng, đặt hàng, thanh toán, quản trị và hỗ trợ đa ngôn ngữ. Ngoài ra hệ thống tích hợp các dịch vụ như VNPay, GHN, Cloudflare R2 và dịch thuật để hoàn thiện quy trình mua hàng và vận hành.

## 9. File tham khảo trong mã nguồn

- Frontend: `online-store-frontend/package.json`, `online-store-frontend/next.config.ts`, `online-store-frontend/src/pages/`, `online-store-frontend/src/lib/api.ts`.
- Backend: `online-store-backend/package.json`, `online-store-backend/src/app.js`, `online-store-backend/src/routes/`, `online-store-backend/src/models/`, `online-store-backend/src/services/`.
