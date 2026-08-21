import csv
import json
import time
import datetime
import requests
import pandas as pd
from bs4 import BeautifulSoup
from scraper_paths import (
    PRODUCT_OUTPUT_FIELDS,
    extract_product_image_urls,
    extract_product_prices,
    get_output_paths,
)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://gearvn.com/"
}

def get_all_collection_urls():
    all_urls = []
    page = 1
    while True:
        # URL danh mục Lenovo học tập và làm việc
        url = f"https://gearvn.com/collections/laptop-lenovo-hoc-tap-va-lam-viec?page={page}"
        print(f"Đang quét trang danh mục số {page}...")
        try:
            res = requests.get(url, headers=HEADERS, timeout=10)
            if res.status_code != 200: 
                break
            soup = BeautifulSoup(res.text, "html.parser")
            links = [a['href'] for a in soup.select("a[href*='/products/']")]
            
            found_any = False
            for href in links:
                clean_link = "https://gearvn.com" + href.split("?")[0] if href.startswith("/") else href.split("?")[0]
                if clean_link not in all_urls:
                    all_urls.append(clean_link)
                    found_any = True
                    
            if not found_any: 
                break
            page += 1
            time.sleep(0.5)
        except Exception as e:
            print(f"Lỗi khi quét trang danh mục: {e}")
            break
    return all_urls

def scrape_full():
    print(">>> Bắt đầu quét danh sách sản phẩm Lenovo (Học tập & Làm việc)...")
    product_urls = get_all_collection_urls()
    print(f">>> Đã tìm thấy {len(product_urls)} sản phẩm. Tiến hành cào chi tiết...")
    
    data_list = []
    
    for url in product_urls:
        print(f"Đang xử lý: {url}")
        try:
            res = requests.get(url, headers=HEADERS, timeout=10)
            soup = BeautifulSoup(res.text, "html.parser")
            
            # --- DỌN DẸP RÁC ---
            for block in soup.find_all("section"):
                if any(text in block.text for text in ["Sản phẩm tương tự", "Sản phẩm đã xem", "Mua kèm giá sốc"]):
                    block.decompose()

            # --- TRÍCH XUẤT DATA ---
            name = soup.h1.text.strip() if soup.h1 else "N/A"
            price, sku, instock = "N/A", "N/A", "In Stock"
            
            json_ld = soup.find("script", type="application/ld+json")
            if json_ld:
                try:
                    data = json.loads(json_ld.string)
                    item = data[0] if isinstance(data, list) else data
                    price = item.get("offers", {}).get("price", "N/A")
                    sku = item.get("sku", "N/A")
                    instock = "In Stock" if item.get("offers", {}).get("availability") == "https://schema.org/InStock" else "Out of Stock"
                except: pass

            # --- TRÍCH XUẤT HÌNH ẢNH ---
            image_list = extract_product_image_urls(soup)
            main_img = image_list[0] if image_list else ""
            gallery_imgs = " || ".join(image_list[1:]) if len(image_list) > 1 else ""

            # --- TRÍCH XUẤT THÔNG SỐ ---
            specs = {}
            for sec in soup.find_all("section"):
                if "Thông số nổi bật" in sec.text:
                    for grid_item in sec.find_all("div", class_="min-w-0"):
                        p_tags = grid_item.find_all("p")
                        if len(p_tags) >= 2:
                            key = p_tags[0].text.strip().replace(":", "")
                            val = p_tags[1].text.strip()
                            specs[key] = val
            
            price, regular_price = extract_product_prices(soup, price)

            data_list.append({
                "Brand": "Lenovo",
                "ID": url.split("/")[-1],
                "Name": name,
                "SKU": sku,
                "Price_VND": price,
                "Regular_Price": regular_price,
                "InStock": instock,
                "Categories": "Laptop Office",
                "Attributes": json.dumps(specs, ensure_ascii=False),
                "Description": "Thông số: " + str(specs),
                "MainImage": main_img,
                "GalleryImages": gallery_imgs,
                "URL": url
            })
        except Exception as e:
            print(f"Lỗi tại {url}: {e}")

    # --- LƯU FILE ---
    date_str = datetime.datetime.now().strftime("%Y%m%d")
    file_prefix = f"Lenovo_Laptop_Office_{date_str}"
    csv_filename, json_filename = get_output_paths(file_prefix)

    df = pd.DataFrame(data_list, columns=PRODUCT_OUTPUT_FIELDS)
    df.to_csv(csv_filename, index=False, encoding="utf-8-sig", quoting=csv.QUOTE_ALL)
    df.to_json(json_filename, orient="records", indent=4, force_ascii=False)
    
    print(f"\n>>> Hoàn thành! Đã xuất danh sách sản phẩm thành công:")
    print(f"- {csv_filename}")
    print(f"- {json_filename}")

if __name__ == "__main__":
    scrape_full()
