# Báo cáo chẩn đoán seed GHN Ward

## 1. Phạm vi

Báo cáo này ghi lại vấn đề seed dữ liệu địa điểm GHN trong phase `pre-products`, kết quả kiểm tra API bằng PowerShell và các thay đổi đã thực hiện để đồng bộ cấu hình GHN trước khi lưu Ward vào MongoDB.

Phạm vi gồm:

- Province.
- District.
- Ward.
- Cấu hình token, ShopId và API URL của GHN.
- Seeder location và parser response GHN.

## 2. Lỗi ban đầu

Sau khi chạy:

```powershell
npm run seed:pre-products
```

Các module nền hoàn tất, nhưng module `locations` cảnh báo:

```text
Fetched 65 provinces
Fetched 726 districts
Fetched 0 wards
Location seeding failed: Ward data was fetched but no wards exist in the database
locations failed (non-critical)
```

Phase seed vẫn kết thúc thành công vì `locations` được khai báo là module không critical. Tuy nhiên database không có dữ liệu Ward, nên các luồng chọn địa chỉ giao hàng có thể không hoạt động.

## 3. Các giả thuyết đã kiểm tra

### 3.1. Legacy index MongoDB

Ban đầu đã kiểm tra khả năng unique index cũ chỉ dùng:

```text
provider + wardCode
```

Trong khi Ward cần định danh theo phạm vi district:

```text
provider + districtId + wardCode
```

Model hiện tại dùng index:

```javascript
WardSchema.index(
  { provider: 1, districtId: 1, wardCode: 1 },
  { unique: true }
);
```

Seeder cũng đã có bước loại legacy index và đồng bộ index mới. Tuy nhiên log sau đó vẫn báo `Fetched 0 wards`, nên lỗi không còn nằm ở bước ghi MongoDB.

### 3.2. Sai field WardID

GHN response không cung cấp `WardID` như giả định ban đầu. Response thực tế dùng:

```json
{
  "WardCode": "510113",
  "DistrictID": 1566,
  "WardName": "Xã Mỹ Hòa Hưng"
}
```

Seeder đã được sửa để dùng `WardCode` làm fallback cho `wardId`:

```javascript
const wardCode = String(ward.WardCode || ward.wardCode || '').trim();
const wardId = Number(ward.WardID ?? ward.wardId ?? wardCode);
const wardName = String(ward.WardName || ward.wardName || '').trim();
```

### 3.3. Sai district được chọn trong diagnostic

Diagnostic PowerShell ban đầu tự chọn province đầu tiên `2002`. Một số province/district trả response thành công nhưng không có Ward. Khi test tiếp, district bị giữ giá trị `0`, dẫn đến request sai:

```text
/master-data/ward?district_id=0
```

Diagnostic đã được sửa để tự thử các province cho đến khi gặp province có district hợp lệ, đồng thời hỗ trợ response district dạng object hoặc array.

## 4. Kiểm tra API bằng PowerShell

Lệnh diagnostic:

```powershell
npm run test:ghn-ward -- -ProvinceId 202 -DistrictId 1566
```

Script:

```text
online-store-backend/scripts/test-ghn-ward.ps1
```

Script không ghi MongoDB và không in token. Nó kiểm tra:

- Token GHN.
- ShopId.
- Province endpoint.
- District endpoint.
- Ward bằng GET.
- Ward bằng POST.

### 4.1. Kết quả API

Kết quả thực tế:

```text
GHN base URL: https://dev-online-gateway.ghn.vn/shiip/public-api
Token: configured
ShopId: configured
Province: HTTP 200, code=200, message=Success, count=65
ProvinceId: 202
District: HTTP 200, code=200, message=Success, count=25
DistrictId: 1566
Ward GET: HTTP 200, code=200, message=Success, count=13
Ward POST: HTTP 200, code=200, message=Success, count=13
GHN Ward diagnostic passed.
```

Một số Ward mẫu:

```text
WardCode  DistrictID  WardName
510113    1566        Xã Mỹ Hòa Hưng
510112    1566        Xã Mỹ Khánh
510111    1566        ...
```

Terminal PowerShell hiển thị tiếng Việt bị lỗi encoding ở một số dòng, ví dụ `X£ã`. Đây là vấn đề hiển thị của terminal, không phải dữ liệu API bị hỏng.

### 4.2. Kết luận từ API test

Kết quả trên xác nhận:

- Token GHN hợp lệ.
- ShopId hợp lệ.
- Endpoint Province hoạt động.
- Endpoint District hoạt động.
- Endpoint Ward hoạt động.
- Cả GET và POST đều trả 13 Ward cho district `1566`.

Vì vậy lỗi không phải do GHN tắt Ward toàn bộ và cũng không phải do MongoDB không thể lưu Ward.

## 5. Nguyên nhân cấu hình provider cũ

Trong `shippingProviderSeeder.js`, khi provider GHN đã tồn tại, code cũ chỉ log:

```text
GHN provider already configured. Skipping creation.
```

Code không cập nhật lại:

- `apiKey`.
- `ShopId`.
- `apiUrl`.

Điều này tạo khả năng provider trong MongoDB dùng credential hoặc endpoint cũ, trong khi PowerShell dùng giá trị mới từ `.env`.

## 6. Thay đổi code đã thực hiện

### 6.1. Đồng bộ GHN provider mỗi lần seed

File:

```text
online-store-backend/src/seeds/shippingProviderSeeder.js
```

Provider hiện được cập nhật lại từ environment:

```javascript
existingGhn.apiKey = ghnToken;
existingGhn.apiUrl = process.env.GHN_API_URL
  || 'https://dev-online-gateway.ghn.vn/shiip/public-api';
existingGhn.token = process.env.GHN_SHOP_ID || existingGhn.token;
existingGhn.currencyCode = 'VND';
existingGhn.isActive = true;
existingGhn.isDeleted = false;
```

Log mới:

```text
GHN provider configuration synchronized.
```

### 6.2. GHN service dùng cấu hình provider

File:

```text
online-store-backend/src/services/ghnService.js
```

Client GHN hiện dùng:

```javascript
baseURL: provider.apiUrl || GHN_BASE_URL
```

ShopId được lấy theo thứ tự:

```text
GHN_SHOP_ID từ environment
→ provider.token trong MongoDB
```

### 6.3. Chuẩn hóa Ward response

`getWards()` hỗ trợ:

- GET và POST.
- `data` là mảng.
- `data.wards` là mảng.
- `data.data` là mảng.
- `data` là object Ward đơn.

Seeder location dùng `WardCode` làm fallback cho `wardId` và upsert theo:

```text
provider + districtId + wardCode
```

## 7. Kiểm tra syntax

Đã kiểm tra thành công:

```powershell
node --check src/seeds/shippingProviderSeeder.js
node --check src/services/ghnService.js
node --check src/seeds/locationSeeder.js
```

Đã kiểm tra `package.json` sau khi thêm command:

```text
package.json OK
```

## 8. Quy trình chạy lại

Chạy từ thư mục backend:

```powershell
npm run seed:pre-products
```

Kết quả phần Shipping Provider cần chuyển từ:

```text
GHN provider already configured. Skipping creation.
```

sang:

```text
GHN provider configuration synchronized.
```

Sau đó kiểm tra phần location:

```text
Fetched 65 provinces
Fetched 726 districts
Fetched <số Ward hợp lệ> wards
Saved/updated <số Ward> wards
Location Data Sync Complete!
```

## 9. Trạng thái hiện tại

| Hạng mục | Trạng thái |
| --- | --- |
| Province API | Đạt: 65 records |
| District API | Đạt: 25 records cho province 202; seed tổng hợp 726 districts |
| Ward API GET | Đạt: 13 records cho district 1566 |
| Ward API POST | Đạt: 13 records cho district 1566 |
| Token/ShopId GHN | Đạt trong PowerShell diagnostic |
| WardCode mapping | Đã sửa |
| Legacy Ward index | Đã xử lý |
| GHN provider synchronization | Đã sửa |
| Syntax backend liên quan | Đạt |
| Chạy lại `seed:pre-products` sau bản sửa cuối | Chưa xác nhận |

## 10. Lưu ý

Không phải mọi district GHN đều chắc chắn có Ward data trong cùng response. Diagnostic phải dùng district hợp lệ, ví dụ:

```powershell
npm run test:ghn-ward -- -ProvinceId 202 -DistrictId 1566
```

Không paste từng block script vào PowerShell prompt. Hãy chạy file qua npm hoặc `powershell -File`, nếu không `$PSScriptRoot` có thể rỗng và các lệnh sau lỗi nối tiếp nhau.
