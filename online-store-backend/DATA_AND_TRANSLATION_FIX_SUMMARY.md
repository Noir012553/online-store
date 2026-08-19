# Tổng kết vấn đề và các bản sửa dữ liệu sản phẩm

Tài liệu này ghi lại các lỗi đã gặp trong luồng seed/import sản phẩm, nguyên nhân, các file đã thay đổi, kết quả kiểm tra và những việc còn tồn đọng.

## 1. Yêu cầu dữ liệu nguồn

Nguồn crawler phải được giữ nguyên và được dùng làm nguồn dữ liệu chính, không tự tạo giá trị giả cho các trường sau:

```text
Brand
ID
Name
SKU
Price_VND
Regular_Price
InStock
Categories
Attributes
Description
MainImage
GalleryImages
URL
```

Nguyên tắc hiện tại:

- `Brand` được dùng cho `Product.brand`.
- `Name` được dùng cho `Product.name`.
- `SKU` được dùng cho `Product.sku` và hỗ trợ dedupe.
- `Price_VND` được dùng cho `Product.price`.
- `Regular_Price` được dùng cho `Product.originalPrice`.
- `InStock` được chuẩn hóa thành `Product.countInStock`.
- `Categories` được resolve sang MongoDB `Category._id`.
- `Attributes` được dùng cho `Product.specs`.
- `Description` được dùng cho `Product.description`.
- `MainImage` được dùng cho `Product.image`.
- `GalleryImages` được dùng cho `Product.images`.
- `ID` và `URL` được dùng cho nhận diện/dedupe khi phù hợp, nhưng chưa được lưu thành field riêng trong `Product` ở phase hiện tại.
- `baseCurrencyCode` được gán cố định là `VND` vì đây là quy ước tiền tệ của `Price_VND`, không phải dữ liệu sản phẩm bị thay thế.

Không được dùng các giá trị fallback như:

```text
brand_generic
product_category_laptop
/images/placeholder.jpg
inStock = true
```

## 2. Lỗi seed product translation catalog

### 2.1. Seed tính cả ngôn ngữ nguồn `vi`

Lỗi ban đầu:

```text
Product translation catalog incomplete: 5428/5436
5436 = 604 sản phẩm x 9 ngôn ngữ
vi -> 0/604
```

`vi` là ngôn ngữ nguồn nên không cần tạo bản dịch trong product translation catalog. Việc tính `vi` như một target language làm ma trận bị thừa 604 bản ghi.

Đã sửa trong `online-store-backend/src/seeds/specTranslationSeeder.js`:

```js
const SOURCE_LANG_CODE = getDefaultLanguage().code;
const TRANSLATED_LANG_CODES = SUPPORTED_LANGUAGES
  .map(({ code }) => code)
  .filter((code) => code !== SOURCE_LANG_CODE);
```

Ma trận đúng:

```text
604 sản phẩm x 8 ngôn ngữ đích = 4832 product-language combinations
```

Các ngôn ngữ đích hiện tại:

```text
en, pt, fr, de, it, es, nl, sv
```

### 2.2. Catalog chỉ đạt `86/604` hoặc thiếu `4144/4832`

Sau khi bỏ `vi`, ma trận đã đúng nhưng seed vẫn báo thiếu bản dịch. Nguyên nhân là validation của seeder bắt buộc `description` và `specs` phải có, trong khi schema `Product` cho phép hai field này rỗng:

```js
description: {
  type: String,
  default: '',
},

specs: {
  type: mongoose.Schema.Types.Mixed,
  default: {},
},
```

Các product không có description hoặc specs bị đánh dấu pending dù dữ liệu nguồn hợp lệ. Con số thiếu tương ứng:

```text
518 sản phẩm x 8 ngôn ngữ = 4144 bản ghi
```

Đã sửa validation trong `specTranslationSeeder.js`:

```js
const hasSourceDescription = typeof sourceProduct?.description === 'string'
  && sourceProduct.description.trim();

entry.brand = sourceProduct?.brand || null;
if (!String(entry.name || '').trim()) validationErrors.push('missing_name');

if (hasSourceDescription && !String(entry.description || '').trim()) {
  validationErrors.push('missing_description');
}

if (missingSpec) validationErrors.push('incomplete_specs');
```

Quy tắc mới:

- `name` và `brand` là các field nền tảng bắt buộc.
- Chỉ bắt buộc bản dịch `description` nếu product nguồn thực sự có description.
- Chỉ kiểm tra độ đầy đủ của specs tương ứng với các spec value có trong product nguồn.
- Không coi description/specs rỗng là lỗi nếu nguồn cũng rỗng.

### 2.3. Đồng bộ validation ở các tầng khác

Đã đồng bộ cùng nguyên tắc trong:

- `online-store-backend/src/services/translationHelper.js`
- `online-store-backend/src/controllers/translationController.js`

Các tầng này không còn bắt buộc mọi product phải có description/specs nếu nguồn không có dữ liệu. Query source product cũng chỉ lấy các field cần thiết:

```js
Product.findById(productId)
  .select('name description brand specs')
  .lean();
```

Product translation seeder cũng dùng cùng phạm vi soft-delete:

```js
const totalProducts = await Product.countDocuments({ isDeleted: false });

const products = await Product.find({ isDeleted: false })
  .skip(skip)
  .limit(CHUNK_SIZE)
  .lean()
  .select('_id name description brand specs');
```

## 3. Lỗi `too_long` làm bản dịch bị xem là không đạt

Report trước đây có dạng:

```text
Approved: 13104 (100%)
Pending: 0
Needs retranslate: 0
ISSUES BREAKDOWN:
  too_long: 199
```

Yêu cầu nghiệp vụ là ưu tiên bản dịch đầy đủ, chấp nhận bản dịch dài hơn và chấp nhận tốn thêm token. `too_long` vì vậy không nên là lỗi blocking nếu bản dịch vẫn có nội dung và đúng ngôn ngữ.

Đã thêm vào `online-store-backend/src/config/translationValidation.js`:

```js
CRITICAL_ERRORS: ['empty', 'wrong_language'],
NON_BLOCKING_ERRORS: ['too_long'],
```

Đã cập nhật `online-store-backend/src/utils/translationReporter.js` và `online-store-backend/src/seeds/index.js` để tách lỗi blocking khỏi cảnh báo chất lượng:

```js
const target = config.NON_BLOCKING_ERRORS.includes(stat._id)
  ? report.advisoriesBreakdown
  : report.issuesBreakdown;

target[stat._id] = breakdown;
```

Kết quả mong muốn:

- `too_long` không làm seed fail.
- `too_long` không còn nằm trong `ISSUES BREAKDOWN`.
- `too_long` được hiển thị dưới `QUALITY ADVISORIES`.
- Các lỗi nghiêm trọng như `empty` và `wrong_language` vẫn chặn approval/retranslation theo rule hiện tại.

## 4. Kết quả seed sau khi sửa

Kết quả chạy thành công đã ghi nhận:

```text
605 products
4840 product-language combinations
605/605 cho tất cả 8 ngôn ngữ đích
13104/13104 approved
Pending: 0
Needs retranslate: 0
```

Công thức:

```text
605 sản phẩm x 8 ngôn ngữ = 4840 product-language combinations
```

Số `13104` là tổng các cache translation record theo từng field, trong khi `4840` là số document tổng hợp theo product-language trong `ProductCatalogTranslationCache`; hai số này thuộc hai tầng dữ liệu khác nhau.

Các lệnh liên quan:

```bash
npm run seed
npm run seed -- --only-module=specTranslations
npm run seed -- --skip-scrape
```

## 5. Mapping crawler ở backend

### 5.1. Import adapter

File: `online-store-backend/src/utils/importAdapters/BaseImportAdapter.js`

Đã bổ sung nhận diện product crawler bằng field nguồn `Price_VND` và map trực tiếp các field crawler:

```js
const isCrawlerProduct = Object.hasOwn(product, 'Price_VND');
const normalized = {};

for (const [key, value] of Object.entries(product)) {
  const normalizedKey = fieldMapping[key.toLowerCase()] || key;
  normalized[normalizedKey] = value;
}

if (!isCrawlerProduct) return normalized;

normalized.name = product.Name;
normalized.brand = product.Brand;
normalized.sku = product.SKU;
normalized.price = product.Price_VND;
normalized.originalPrice = product.Regular_Price;
normalized.category = product.Categories;
normalized.specs = product.Attributes;
normalized.description = product.Description;
normalized.image = product.MainImage;
normalized.images = product.GalleryImages;
normalized.countInStock = /^(in stock|true|1)$/i.test(
  String(product.InStock).trim()
) ? 1 : 0;
normalized.baseCurrencyCode = 'VND';
```

Điểm quan trọng:

- Không thay `Brand` bằng brand mặc định.
- Không thay `Categories` bằng category laptop mặc định.
- Không thay `InStock` thiếu bằng `true`.
- Không thay `MainImage` thiếu bằng placeholder.
- Dữ liệu crawler được normalize một lần trước khi validate/import.

### 5.2. Route import không bypass adapter

File: `online-store-backend/src/controllers/productImportController.js`

Code cũ cho phép payload `products` đi thẳng vào pipeline và có thể bỏ qua normalize:

```js
let parsedProducts = products;

if (data) {
  const adapter = adapterManager.getAdapter(format);
  parsedProducts = await adapter.parse(data);
}
```

Đã sửa thành:

```js
const adapter = adapterManager.getAdapter(format);
const parsedProducts = await adapter.parse(data || products);
```

Nhờ đó cả hai dạng payload đều được xử lý cùng một adapter:

- dữ liệu trong `data`;
- dữ liệu trong `products`.

Nếu gửi raw crawler object như `{ Brand, Name, Price_VND, Categories, ... }`, route không còn đưa thẳng raw object vào bước import.

### 5.3. Resolve category không phân biệt hoa thường

Category map hiện lưu cả canonical name và alias ở dạng nguyên bản/lowercase:

```js
const addCategoryToMap = (categoryMap, category) => {
  const names = [category.name, ...(category.sourceNames || [])];
  names.filter(Boolean).forEach((name) => {
    categoryMap[name] = category._id;
    categoryMap[String(name).toLowerCase()] = category._id;
  });
};
```

Lookup đã bổ sung fallback lowercase:

```js
let categoryId = categoryMap[product.category]
  || categoryMap[String(product.category).toLowerCase()];
```

### 5.4. Alias category crawler

File: `online-store-backend/src/factories/categoryFactory.js`

Đã bổ sung alias để tránh tạo category trùng:

```js
{
  name: 'Headphones',
  sourceNames: [
    'Headphone',
    'Tai Nghe',
    'Tai Nghe Chụp Tai',
    'Tai Nghe Gaming',
  ],
}
```

```js
{
  name: 'Office Laptop',
  sourceNames: [
    'Laptop Office',
    'Laptop Truyền Thống',
    'Laptop Văn Phòng',
  ],
}
```

Mapping hiện tại:

```text
Headphone     -> Headphones
Laptop Office -> Office Laptop
```

Đây là mapping alias đã biết từ dữ liệu crawler, không phải tự gán mọi sản phẩm vào một category mặc định.

## 6. Schema backend hiện tại

File: `online-store-backend/src/models/Product.js`

Các quyết định schema quan trọng:

```js
brand: {
  type: String,
  required: true,
},

category: {
  type: mongoose.Schema.Types.ObjectId,
  required: true,
  ref: 'Category',
},

description: {
  type: String,
  default: '',
},

specs: {
  type: mongoose.Schema.Types.Mixed,
  default: {},
},
```

Kết luận:

- `brand` hiện là chuỗi lấy từ `Brand`, chưa phải `Brand ObjectId`.
- `category` là `Category ObjectId`; tên category từ `Categories` chỉ dùng để resolve ID.
- `description` và `specs` có thể rỗng.
- Chưa thực hiện migration lớn từ `Product.brand: String` sang `Brand ObjectId`.

## 7. Mapping ở frontend

### 7.1. Xóa fallback dữ liệu giả

File: `online-store-frontend/src/lib/adapters.ts`

`LaptopSchema` hiện yêu cầu dữ liệu thực cho các field nền tảng:

```ts
name: z.string().trim().min(1),
brand: z.string().trim().min(1),
category: z.string().trim().min(1),
price: z.number().nonnegative(),
image: z.string().trim().min(1),
countInStock: z.number().nonnegative().optional(),
inStock: z.boolean().optional(),
```

Đã bỏ các default giả:

```text
brand_generic
product_category_laptop
/images/placeholder.jpg
inStock: true
```

### 7.2. Giữ category backend trả về

`ProductAdapter.beforeParse` xử lý cả category object và category string mà không phát minh giá trị mới:

```ts
if (normalized.category && typeof normalized.category === 'object') {
  const categoryName = normalized.category.name || normalized.categoryName;
  normalized.categoryId = normalized.category._id || normalized.category.id;

  if (typeof categoryName === 'string' && categoryName.trim()) {
    normalized.categoryName = categoryName.trim();
    normalized.category = categoryName.trim();
  } else {
    delete normalized.category;
  }
} else if (typeof normalized.category === 'string') {
  const categoryName = normalized.category.trim();

  if (categoryName) {
    normalized.category = categoryName;
  } else {
    delete normalized.category;
  }
} else {
  delete normalized.category;
}
```

Nếu backend không có category hợp lệ, adapter không tự chuyển sản phẩm thành laptop.

### 7.3. Đồng bộ tồn kho

```ts
if (normalized.countInStock !== undefined) {
  normalized.inStock = Number(normalized.countInStock) > 0;
} else {
  delete normalized.inStock;
}
```

File `online-store-frontend/src/lib/data.ts` cũng đã đổi:

```ts
inStock?: boolean;
```

Frontend không còn coi product thiếu `InStock` là còn hàng.

### 7.4. Hiển thị brand/category

File `online-store-frontend/src/components/ProductCard.tsx` đang lấy:

- brand trực tiếp từ `laptop.brand`;
- category từ object/string backend sau khi adapter normalize.

Fallback text như `no_brand` hoặc `no_category` chỉ dùng để hiển thị giao diện, không ghi ngược vào product data.

## 8. Các lỗi phát sinh trong quá trình sửa

### 8.1. Khai báo `fs` trùng

Trong `online-store-backend/src/seeds/productSeedPipeline.js` từng phát sinh:

```text
SyntaxError: Identifier 'fs' has already been declared
```

Nguyên nhân là thêm nhầm hai lần:

```js
const fs = require('fs');
const fs = require('fs');
```

Đã xóa khai báo dư. Backend syntax check sau đó đạt.

### 8.2. Nghi ngờ `config is not defined`

`online-store-backend/src/utils/translationValidator.js` đã có import đúng:

```js
const config = require('../config/translationValidation');
```

Vì vậy lỗi này thuộc source cũ/phiên bản trước, không còn là lỗi hiện tại trong commit đang kiểm tra.

## 9. Kết quả kiểm tra

Đã thực hiện/ghi nhận:

- Backend syntax check: đạt sau khi sửa khai báo `fs` trùng.
- Frontend TypeScript check `npm exec -- tsc --noEmit`: chạy thành công.
- Seed product translation catalog: đạt đủ sản phẩm và ngôn ngữ như phần trên.

Lần chạy `npm test` đầy đủ vẫn còn các failure không cùng nguyên nhân với mapping crawler:

1. `translationProductCache.test.js`
   - Assertion cũ kỳ vọng số request dịch khác với pipeline hiện tại.
   - Pipeline dịch name, description, specs; brand được giữ từ source.

2. `test-backend-endpoints-phase3.js`
   - Test dùng ID giả như `test_product_001`, không phải MongoDB ObjectId hợp lệ.
   - Controller trả `400` đúng theo validation ID hiện tại.

3. `test-rollback-procedures.js`
   - Test yêu cầu git working tree sạch.
   - Trong lúc phát triển đang có thay đổi code nên test fail theo điều kiện môi trường.

4. `test-simple.js`
   - Đây là integration test gọi `localhost:5000`.
   - Sẽ fail nếu backend không chạy hoặc endpoint debug VNPay không trả success.

5. `sourceImportValidator.test.js`
   - Test registry có khai báo file nhưng file không tồn tại.
   - Đây là lỗi cấu hình test runner.

Các test trên chưa được sửa trong phạm vi bản sửa mapping Brand/Category.

## 10. Việc còn tồn đọng

### Cần làm tiếp cho dữ liệu crawler

- Chạy lại category seed/sync để alias mới áp dụng vào database:

```bash
cd online-store-backend
npm run seed -- --only-module=categories
```

- Kiểm tra các category duplicate đã tồn tại như `Headphone`, `Laptop Office`, `Laptop`.
- Nếu cần, viết migration merge category cũ về canonical category; chưa tự động merge vì đây là thay đổi dữ liệu database khó hoàn tác.
- Kiểm tra trực tiếp fixture raw crawler đủ 13 field qua JSON adapter/import endpoint.

Fixture kiểm tra đề xuất:

```json
{
  "Brand": "Razer",
  "ID": "source-id",
  "Name": "Product name",
  "SKU": "SKU-001",
  "Price_VND": 100000,
  "Regular_Price": 120000,
  "InStock": "In Stock",
  "Categories": "Headphone",
  "Attributes": "{\"Color\":\"Black\"}",
  "Description": "Source description",
  "MainImage": "https://example.com/main.jpg",
  "GalleryImages": ["https://example.com/1.jpg"],
  "URL": "https://example.com/product"
}
```

Kết quả normalize mong đợi:

```js
{
  brand: 'Razer',
  category: 'Headphone',
  name: 'Product name',
  sku: 'SKU-001',
  price: 100000,
  originalPrice: 120000,
  countInStock: 1,
  specs: { Color: 'Black' },
  description: 'Source description',
  image: 'https://example.com/main.jpg',
  images: ['https://example.com/1.jpg'],
  baseCurrencyCode: 'VND'
}
```

### Quyết định schema brand

Hiện tại giữ `Product.brand` là string để tránh migration lớn. Nếu cần quản lý brand bằng collection riêng, phải quyết định và thực hiện riêng:

- migrate `Product.brand` sang `Brand ObjectId`;
- cập nhật import resolver từ `Brand`;
- cập nhật API và frontend;
- migrate dữ liệu product hiện có;
- cập nhật test và seed brand.

### Các scraper nguồn

Adapter đã dùng đúng dữ liệu crawler, nhưng một số scraper Python vẫn có logic tạo dữ liệu trước khi export:

- `Regular_Price` có nơi đang gán bằng `price`;
- `Description` có nơi được tạo từ `Attributes`;
- `InStock` có nơi có fallback trong scraper;
- `Brand` và `Categories` có thể được cấu hình theo từng scraper.

Nếu yêu cầu là giữ nguyên dữ liệu gốc tuyệt đối, cần kiểm tra từng scraper và thay logic tạo dữ liệu bằng giá trị lấy trực tiếp từ trang nguồn. Đây là phạm vi riêng với việc normalize ở backend.

## 11. Các lệnh vận hành chính

```bash
# Seed toàn bộ
npm run seed

# Chỉ aggregate product translation cache
npm run seed -- --only-module=specTranslations

# Import dữ liệu có sẵn, bỏ qua crawler
npm run seed -- --skip-scrape

# Kiểm tra frontend TypeScript
npm exec -- tsc --noEmit

# Chạy test suite
npm test
```

## 12. Tóm tắt trạng thái

### Đã sửa

- Loại `vi` khỏi target translation languages.
- Sửa ma trận product-language từ `604 x 9` thành `604 x 8` và hoạt động đúng với `605 x 8`.
- Đồng bộ validation description/specs với Product schema.
- Seed đủ product translation catalog.
- Chuyển `too_long` thành quality advisory, không blocking.
- Normalize raw crawler fields ở backend adapter.
- Đảm bảo cả payload `data` và `products` đều đi qua adapter.
- Resolve category theo canonical name, alias và lowercase.
- Thêm alias `Headphone` và `Laptop Office`.
- Bỏ fallback brand/category/image/inStock giả ở frontend.
- Giữ brand/category/inStock theo dữ liệu backend/crawler.
- Sửa lỗi khai báo `fs` trùng.

### Chưa sửa

- Các test độc lập đang lệch với implementation hoặc môi trường chạy.
- Category duplicate đã có trong database chưa được merge.
- Chưa migrate `Product.brand` sang `Brand ObjectId`.
- Một số scraper vẫn có thể tạo `Regular_Price`, `Description` hoặc `InStock` thay vì lấy giá trị gốc tuyệt đối.
