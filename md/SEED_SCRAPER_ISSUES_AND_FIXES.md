# Tổng hợp vấn đề Seed, Scraper và Package

## 1. Phạm vi

Tài liệu này tổng hợp các vấn đề đã phát hiện trong quá trình chạy seed/crawler tại `online-store-backend`, cùng nguyên nhân, thay đổi đã áp dụng và cách vận hành sau khi sửa.

Các nhóm chính:

- Dynamic render bị timeout khi cào GearVN.
- Dữ liệu sản phẩm bị rỗng hoặc sai trường.
- Thứ tự crawler và seed chưa đúng yêu cầu.
- Script `seed-and-verify.sh` hoạt động không đáng tin cậy.
- Metadata package dư ở thư mục root.
- Cảnh báo install script của npm trên Windows PowerShell.
- Giới hạn kiểm thử do môi trường thiếu dependency Python.

---

## 2. Dynamic render bị timeout

### Hiện tượng

Một số URL GearVN xuất hiện lỗi:

```text
Cảnh báo dynamic render ...
Node renderer exit 1: page.goto: net::ERR_TIMED_OUT
```

Các URL Logitech và một số sản phẩm khác có thể không phản hồi kịp khi Playwright điều hướng.

### Nguyên nhân

Renderer tại `online-store-backend/scripts/render-scraper-page.js` ban đầu:

- Dùng timeout điều hướng hard-code.
- Chỉ xử lý timeout của Playwright, chưa nhận diện đầy đủ `ERR_TIMED_OUT` và `ERR_CONNECTION_TIMED_OUT`.
- Có thể tiếp tục chờ DOM sau khi kết nối đã timeout.
- `page.content()` có thể tiếp tục lỗi nếu page đã bị đóng.
- Python scraper in cảnh báo với mọi subprocess có exit code khác `0`, kể cả timeout mạng có thể fallback về HTML tĩnh.

### Cách xử lý

Renderer hiện:

- Nhận diện timeout của Playwright và lỗi timeout mạng.
- Trả HTML hiện có ngay khi navigation timeout.
- Bọc an toàn thao tác đọc `page.content()`.
- Chặn tải `image`, `media`, `font` trong dynamic render để giảm thời gian và lưu lượng không cần thiết.
- Chỉ coi lỗi không phải timeout là lỗi cần báo.

Python scraper hiện fallback về HTML tĩnh với timeout mạng thay vì làm hỏng toàn bộ batch.

### Cấu hình timeout

Các timeout không còn rải rác trong code. Có thể cấu hình bằng biến `SCRAPER_*` trong `.env`:

```env
SCRAPER_REQUEST_TIMEOUT_SECONDS=8
SCRAPER_RETRY_ATTEMPTS=3
SCRAPER_RETRY_BACKOFF_SECONDS=1

SCRAPER_DYNAMIC_RENDER_TIMEOUT_SECONDS=45
SCRAPER_NAVIGATION_TIMEOUT_MS=15000
SCRAPER_DOMCONTENTLOADED_TIMEOUT_MS=3000
SCRAPER_SELECTOR_TIMEOUT_MS=7000
SCRAPER_EXPANDABLE_CLICK_TIMEOUT_MS=2000
SCRAPER_EXPANDABLE_SETTLE_MS=300

SCRAPER_IMAGE_CONNECT_TIMEOUT_SECONDS=8
SCRAPER_IMAGE_READ_TIMEOUT_SECONDS=20
SCRAPER_IMAGE_RETRY_ATTEMPTS=3
SCRAPER_IMAGE_RETRY_BACKOFF_SECONDS=1
SCRAPER_MAX_WORKERS=4
```

`SCRAPER_DYNAMIC_RENDER_TIMEOUT_SECONDS=45` là ngân sách tổng cho subprocess. `SCRAPER_NAVIGATION_TIMEOUT_MS=15000` là timeout riêng cho bước điều hướng trang.

Nếu `.env` thật có giá trị cũ như:

```env
SCRAPER_NAVIGATION_TIMEOUT_MS=45000
```

thì giá trị này sẽ override mặc định trong code.

### Trạng thái

Đã sửa trong:

- `online-store-backend/scripts/render-scraper-page.js`
- `online-store-backend/python/scraper_runner.py`
- `online-store-backend/python/prepare_product_images.py`
- `online-store-backend/.env.example`

---

## 3. Dữ liệu sản phẩm bị rỗng hoặc sai

### 3.1. Mô tả sản phẩm rỗng

#### Hiện tượng

Một số sản phẩm keyboard/laptop có:

```json
"ProductDescription": ""
```

#### Nguyên nhân

Parser chỉ tìm:

```css
.news-html-content
```

Trong khi một số trang dùng wrapper khác cho phần mô tả.

#### Cách xử lý

Parser bổ sung các selector:

- `.product-description`
- `.product__description`
- `[data-product-description]`
- `[data-description]`
- `[class*="product-description"]`

Nếu HTML không có mô tả phù hợp, parser fallback sang trường `description` trong JSON-LD.

---

### 3.2. Ảnh mô tả rỗng

#### Hiện tượng

```json
"ProductDescriptionImages": []
```

#### Nguyên nhân

Ảnh mô tả dùng chung container `.news-html-content`, nên khi wrapper thay đổi thì cả nội dung và ảnh đều bị bỏ qua.

#### Cách xử lý

Ảnh mô tả sử dụng chung cơ chế tìm container mô tả mới, đồng thời vẫn khử URL trùng lặp.

---

### 3.3. Gallery chỉ có main image hoặc bị rỗng

#### Hiện tượng

```json
"ProductMainImage": "...",
"ProductGalleryImages": []
```

#### Nguyên nhân

Parser trước đây return ngay khi tìm được một ảnh từ selector thumbnail/main. Vì vậy nó không tiếp tục đọc:

- Gallery semantic HTML.
- Danh sách ảnh trong JSON-LD.
- Các nguồn ảnh bổ sung khác.

#### Cách xử lý

Parser hiện hợp nhất ảnh từ:

1. Selector gallery GearVN.
2. Các container gallery semantic.
3. JSON-LD `Product.image`.
4. `og:image` khi không có nguồn khác.

Các URL trùng lặp được loại bỏ.

---

### 3.4. Promotion bị rỗng

#### Hiện tượng

```json
"ProductPromotions": []
```

#### Nguyên nhân

Parser cũ chỉ nhận:

- Element `<section>`.
- Text tiêu đề chính xác là `Ưu đãi đi kèm`.
- Promotion nằm trong các thẻ `<p>`.

Thực tế trang có thể dùng các tiêu đề:

- `Khuyến mãi`.
- `Khuyến mại`.
- `Quà tặng`.
- `Promotion`.
- `Offers`.

và có thể đặt trong `div` hoặc `aside`.

#### Cách xử lý

Parser đã mở rộng danh sách tiêu đề và tìm container cha gần nhất có nội dung promotion.

---

### 3.5. Specifications bị dính nội dung promotion

#### Hiện tượng

Một sản phẩm Acer có `ProductSpecifications` chứa toàn bộ nội dung như:

```text
Tặng ngay ... Mua ngay ... Giao tận nơi ... Thêm vào giỏ hàng
```

#### Nguyên nhân

Parser cũ có fallback:

```python
_extract_spec_items(soup)
```

Điều này khiến nó quét toàn bộ trang khi không xác định được khu vực thông số. Ngoài ra, giá trị của một item có thể lấy cả nội dung promotion lồng bên trong.

#### Cách xử lý

Parser hiện:

- Ưu tiên section có heading `Thông số` hoặc `Kỹ thuật`.
- Nhận thêm các container thông số có data attribute/class tương ứng.
- Không còn quét toàn bộ DOM khi không tìm thấy khu vực thông số.
- Chỉ đọc các node con trực tiếp phù hợp.
- Loại giá trị chứa các marker như:
  - `Ưu đãi`.
  - `Khuyến mãi`.
  - `Tặng ngay`.
  - `Mua ngay`.
  - `Thêm vào giỏ`.
  - `Giao tận nơi`.

Nếu không xác định được vùng thông số, kết quả trả về `{}` thay vì lấy nhầm text của toàn bộ trang.

### Test hồi quy đã thêm

- Mô tả dùng wrapper `.product-description`.
- Gallery lấy từ JSON-LD.
- Promotion nằm trong `div` với heading `Khuyến mãi`.
- Nội dung promotion không được ghi vào specifications.

---

## 4. Thứ tự crawler và seed

### Thứ tự cũ

`npm run seed` trước đây chạy các module seed nền, sau đó mới đến product pipeline. Crawler nằm bên trong product pipeline nên data sản phẩm được cào sau các module như language, customer, location.

### Thứ tự mới

Với lệnh mặc định:

```powershell
npm run seed
```

luồng mới là:

```text
1. Crawler chạy trước.
2. Ghi JSON/CSV vào data/scraped-products.
3. Kết nối MongoDB.
4. Seed dữ liệu nền.
5. Đọc và validate file sản phẩm.
6. Upload ảnh và import/upsert Product.
7. Dịch sản phẩm.
8. Seed inventory, reviews, orders, coupons và spec translations.
```

Crawler được chạy trước cả `connectMongo()` để đúng yêu cầu cào data đầu tiên.

Sau khi crawler hoàn tất, product pipeline nhận `skipScrape=true` để không cào lần hai.

### Các chế độ đặc biệt

| Lệnh | Hành vi |
|---|---|
| `npm run seed` | Cào trước, sau đó seed và import đầy đủ |
| `npm run seed -- --force-scrape` | Ép cào lại trước khi import |
| `npm run seed -- --skip-scrape` | Không cào, dùng file data hiện có |
| `npm run seed -- --dry-run` | Không cào và không ghi dữ liệu thật |
| `npm run seed -- --i18n-only` | Chỉ seed i18n, không crawler |
| `npm run scrape:all` | Chỉ cào và ghi file, không import MongoDB |

Thay đổi nằm ở:

- `online-store-backend/src/seeds/index.js`
- `online-store-backend/src/seeds/seedRegistry.js`
- `online-store-backend/src/seeds/productSeedPipeline.js`

---

## 5. Script `seed-and-verify.sh`

### Vấn đề cũ

Script shell ban đầu chỉ có các lệnh `echo` và gọi:

```bash
node src/seeds/translationSeeder.js
node src/scripts/diagnose-i18n.js
```

Các vấn đề:

1. `echo "SEEDER COMPLETED"` luôn in ra, kể cả khi seed lỗi.
2. `translationSeeder.js` chỉ export hàm và không tự gọi hàm khi chạy trực tiếp bằng Node.
3. Script không có `set -e`, nên bước seed lỗi vẫn có thể chạy diagnostic tiếp.
4. Thông báo thành công không phản ánh đúng exit code.

### Cách xử lý

Đã tạo:

```text
online-store-backend/scripts/seed-and-verify.js
```

Script Node mới:

- Chạy seeder chuẩn `src/seeds/index.js --i18n-only`.
- Chạy diagnostic sau khi seed thành công.
- Dừng ngay nếu một bước thất bại.
- Dùng `spawnSync` với `stdio: inherit` để giữ log đầy đủ.

Đã thêm npm script:

```powershell
npm run seed:verify
```

File `.sh` cũ đã được xóa vì không còn cần thiết.

---

## 6. Metadata package ở root

### Vấn đề

Root repository có:

- `package.json` chỉ chứa wrapper test cho backend.
- `pnpm-lock.yaml` gần như rỗng, importer root là `{}`.
- Frontend và backend đã có package riêng.

### Cách xử lý

Đã xóa:

```text
/package.json
/pnpm-lock.yaml
```

Giữ lại root `.gitignore` vì file này chứa rule chung cho toàn repository như:

- `node_modules/`
- `.next/`
- `coverage/`
- `reports/`
- build output

Các package chính vẫn nằm tại:

```text
online-store-frontend/package.json
online-store-backend/package.json
```

---

## 7. Cảnh báo npm install và `@scarf/scarf`

### Cảnh báo

Khi chạy `npm install`, npm báo:

```text
@scarf/scarf@1.4.0
postinstall: node ./report.js
```

Install script bị chặn bởi npm vì chưa được approve.

Đây là telemetry postinstall, không phải dependency nghiệp vụ mà backend cần để chạy.

### Lỗi PowerShell

Lệnh sau bị lỗi:

```powershell
npm install-scripts approve <pkg>
```

Nguyên nhân là `<pkg>` chỉ là placeholder trong tài liệu. PowerShell hiểu dấu `<` là toán tử.

Nếu thực sự muốn approve, cú pháp là:

```powershell
npm install-scripts approve @scarf/scarf
```

Tuy nhiên cách an toàn hơn là giữ chặn hoặc deny:

```powershell
npm install-scripts deny @scarf/scarf
```

Các thông báo khác không phải lỗi nghiêm trọng:

- `node-domexception deprecated`: dependency gián tiếp đã cũ.
- `npm fund`: thông tin tài trợ.
- `found 0 vulnerabilities`: npm không phát hiện lỗ hổng trong lần audit đó.

Không nên chạy `npm update` liên tục vì nó có thể thay đổi nhiều package và lockfile ngoài phạm vi cần thiết.

---

## 8. Kiểm thử và giới hạn môi trường

Đã kiểm tra thành công:

- Syntax Python bằng `python3 -m py_compile`.
- Syntax Node bằng `node --check`.
- JSON `package.json` hợp lệ.
- `git diff --check` không có lỗi whitespace.
- Syntax shell bằng `bash -n` trước khi file shell bị xóa.

Chưa chạy được unittest Python vì môi trường kiểm thử hiện tại thiếu:

```text
bs4 / beautifulsoup4
```

Lỗi quan sát được:

```text
ModuleNotFoundError: No module named 'bs4'
```

Việc này là thiếu dependency môi trường, không phải lỗi syntax của parser.

Không chạy full `npm run seed` trong môi trường tự động vì lệnh này:

- Gọi scraper bên ngoài.
- Ghi dữ liệu MongoDB.
- Upload hoặc xử lý ảnh.
- Gọi các dịch vụ bên ngoài.

---

## 9. Quy trình vận hành khuyến nghị

### Chỉ cào data

```powershell
cd online-store-backend
npm run scrape:all
```

### Cào và seed đầy đủ

```powershell
cd online-store-backend
npm run seed
```

Lệnh này hiện đã cào trước rồi mới seed/import.

### Cào lại bắt buộc

```powershell
npm run seed -- --force-scrape
```

### Chỉ import file đã cào

```powershell
npm run seed -- --skip-scrape
```

### Chỉ seed i18n và kiểm tra

```powershell
npm run seed:verify
```

### Kiểm tra output trước khi import

Kiểm tra thư mục:

```text
online-store-backend/data/scraped-products/
```

Các trường cần chú ý:

- `ProductDescription`
- `ProductDescriptionImages`
- `ProductPromotions`
- `ProductMainImage`
- `ProductGalleryImages`
- `ProductSpecifications`

Các file output cũ không tự thay đổi sau khi sửa parser. Cần chạy lại scraper và import lại dữ liệu để áp dụng parser mới.

---

## 10. Việc cần theo dõi tiếp

1. Cài dependency Python để chạy đầy đủ test scraper:

   ```powershell
   pip install -r online-store-backend/python/requirements-playwright.txt
   ```

   Đồng thời bảo đảm môi trường có `beautifulsoup4`, `requests` và `pandas` nếu requirements hiện tại chưa liệt kê đủ.

2. Chạy targeted scraper trước khi chạy full seed:

   ```powershell
   npm run scrape:akko-keyboard
   npm run scrape:acer-gaming
   ```

3. Kiểm tra một số JSON output sau khi parser mới chạy.

4. Nếu vẫn thấy timeout, kiểm tra `.env` thật vì biến môi trường có thể override default trong code.

5. Nếu terminal đang chạy một bản copy khác của repository, bảo đảm các file parser và seed orchestrator đã được đồng bộ vào đúng thư mục đang chạy.
