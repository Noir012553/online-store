# Lỗi thiếu `openpyxl` khi scraper xuất Excel

## Hiện tượng

Khi chạy:

```powershell
npm run scrape:all
```

scraper dừng ở bước ghi file Excel với lỗi:

```text
ModuleNotFoundError: No module named 'openpyxl'
```

Traceback xuất hiện tại:

```python
csv_frame.to_excel(xlsx_tmp, index=False, engine="openpyxl")
```

trong `online-store-backend/python/scraper_runner.py`.

## Nguyên nhân

Scraper hiện xuất mỗi nhóm sản phẩm thành ba định dạng:

- JSON.
- CSV.
- XLSX.

`pandas` cần thư viện `openpyxl` để ghi file `.xlsx`, nhưng môi trường Python đang chạy scraper chưa cài dependency này.

Đây là lỗi thiếu dependency môi trường, không phải lỗi parser, crawler hoặc dữ liệu sản phẩm.

## Cách khắc phục

Từ thư mục `online-store-backend`, chạy:

```powershell
python -m pip install "openpyxl>=3.1,<4"
```

Hoặc cài toàn bộ dependency scraper:

```powershell
python -m pip install -r python/requirements-playwright.txt
```

Kiểm tra cài đặt:

```powershell
python -c "import openpyxl; print(openpyxl.__version__)"
```

Nếu lệnh `python` không trỏ đúng Python đang dùng, dùng Python Launcher:

```powershell
py -m pip install "openpyxl>=3.1,<4"
```

## Chạy lại scraper

Sau khi cài thành công:

```powershell
npm run scrape:all
```

Scraper sẽ tạo cấu trúc output theo nhóm tại:

```text
data/scraped-products/current/<nhom-san-pham>/
├── <nhom-san-pham>.json
├── <nhom-san-pham>.csv
└── <nhom-san-pham>.xlsx
```

Ảnh local nằm trong thư mục `images/` và file staging nằm trong thư mục `staging/`.

## Lưu ý

Nếu scraper đã dừng trước khi hoàn thành nhóm đầu tiên, cần chạy lại toàn bộ lệnh sau khi cài `openpyxl`. Các file output cũ không tự bị xóa.

Sau khi scraper hoàn tất, có thể seed từ dữ liệu đã cào mà không cào lại:

```powershell
npm run seed -- --skip-scrape; if ($?) { shutdown /s /t 60 }
```
