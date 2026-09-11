import csv
import datetime
import json
import os
import time
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import pandas as pd
import requests
from bs4 import BeautifulSoup

from scraper_paths import (
    PRODUCT_OUTPUT_FIELDS,
    collect_product_links,
    extract_product_image_urls,
    extract_product_prices,
    get_output_paths,
    parse_scraper_metadata,
)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://gearvn.com/",
}
RETRYABLE_STATUS_CODES = frozenset({429, 500, 502, 503, 504})
MAX_ATTEMPTS = 3


def fetch_html(url, *, headers=HEADERS, timeout=10, attempts=MAX_ATTEMPTS, sleep=time.sleep):
    for attempt in range(attempts):
        try:
            response = requests.get(url, headers=headers, timeout=timeout)
        except requests.RequestException as error:
            if attempt == attempts - 1:
                print(f"Lỗi request {url}: {error}")
                return None
            sleep(2 ** attempt)
            continue

        if response.status_code == 200:
            return response
        if response.status_code not in RETRYABLE_STATUS_CODES:
            print(f"HTTP {response.status_code} khi đọc {url}")
            return None
        if attempt < attempts - 1:
            sleep(2 ** attempt)

    return None


def _iter_json_ld_objects(value):
    if isinstance(value, list):
        for item in value:
            yield from _iter_json_ld_objects(item)
    elif isinstance(value, dict):
        yield value
        if "@graph" in value:
            yield from _iter_json_ld_objects(value["@graph"])


def extract_product_json_ld(soup):
    for script in soup.select('script[type="application/ld+json"]'):
        try:
            payload = json.loads(script.string or script.get_text())
        except (TypeError, ValueError):
            continue
        objects = list(_iter_json_ld_objects(payload))
        for item in objects:
            item_type = item.get("@type")
            types = item_type if isinstance(item_type, list) else [item_type]
            if any(str(value).lower() == "product" for value in types):
                return item
    return {}


def _first_offer(item):
    offers = item.get("offers")
    if isinstance(offers, list):
        return offers[0] if offers and isinstance(offers[0], dict) else {}
    return offers if isinstance(offers, dict) else {}


def extract_product_specs(soup):
    specs = {}
    for section in soup.find_all("section"):
        if "Thông số nổi bật" not in section.get_text(" ", strip=True):
            continue
        for grid_item in section.select("div.min-w-0"):
            paragraphs = grid_item.find_all("p")
            if len(paragraphs) < 2:
                continue
            key = paragraphs[0].get_text(" ", strip=True).replace(":", "")
            value = paragraphs[1].get_text(" ", strip=True)
            if key and value:
                specs[key] = value
    return specs


def _canonical_product_url(url):
    parsed = urlsplit(url)
    return urlunsplit(("https", "gearvn.com", parsed.path.rstrip("/"), "", ""))


def collect_collection_urls(collection_url_template, *, sleep=time.sleep):
    urls = []
    seen = set()
    page = 1
    while True:
        collection_url = collection_url_template.format(page=page)
        response = fetch_html(collection_url)
        if response is None:
            return urls, False
        links = collect_product_links(BeautifulSoup(response.text, "html.parser"), collection_url)
        new_links = []
        for link in links:
            canonical = _canonical_product_url(link)
            if canonical not in seen:
                seen.add(canonical)
                urls.append(canonical)
                new_links.append(canonical)
        if not new_links:
            return urls, True
        page += 1
        sleep(0.5)


def _product_record(soup, url, brand, categories):
    json_ld = extract_product_json_ld(soup)
    offer = _first_offer(json_ld)
    fallback_price = offer.get("price", "N/A")
    price, regular_price = extract_product_prices(soup, fallback_price)
    image_urls = extract_product_image_urls(soup)
    name = soup.h1.get_text(" ", strip=True) if soup.h1 else str(json_ld.get("name") or "")
    if not name:
        return None
    sku = str(json_ld.get("sku") or "").strip()
    availability = str(offer.get("availability") or "").lower()
    instock = "In Stock" if availability.endswith("instock") else "Out of Stock"
    specs = extract_product_specs(soup)
    return {
        "Brand": brand,
        "ID": url.rstrip("/").split("/")[-1],
        "Name": name,
        "SKU": sku,
        "Price_VND": price,
        "Regular_Price": regular_price,
        "InStock": instock,
        "Categories": categories,
        "Attributes": json.dumps(specs, ensure_ascii=False),
        "Description": "Thông số: " + str(specs),
        "MainImage": image_urls[0] if image_urls else "",
        "GalleryImages": " || ".join(image_urls[1:]),
        "URL": url,
    }


def deduplicate_records(records):
    result = []
    seen_urls = set()
    seen_skus = set()
    for record in records:
        url = _canonical_product_url(record["URL"])
        sku = str(record.get("SKU") or "").strip().lower()
        if url in seen_urls or (sku and sku != "n/a" and sku in seen_skus):
            continue
        record["URL"] = url
        seen_urls.add(url)
        if sku and sku != "n/a":
            seen_skus.add(sku)
        result.append(record)
    return result


def write_output_atomically(records, file_prefix):
    if not records:
        raise RuntimeError("Không ghi output rỗng")
    output_dir = Path(get_output_paths(file_prefix)[0]).parent
    csv_path, json_path = get_output_paths(file_prefix)
    csv_tmp = output_dir / f".{csv_path.name}.part"
    json_tmp = output_dir / f".{json_path.name}.part"
    try:
        frame = pd.DataFrame(records, columns=PRODUCT_OUTPUT_FIELDS)
        frame.to_csv(csv_tmp, index=False, encoding="utf-8-sig", quoting=csv.QUOTE_ALL)
        frame.to_json(json_tmp, orient="records", indent=4, force_ascii=False)
        os.replace(csv_tmp, csv_path)
        os.replace(json_tmp, json_path)
    finally:
        csv_tmp.unlink(missing_ok=True)
        json_tmp.unlink(missing_ok=True)
    return csv_path, json_path


def run_scraper(script_path, collection_slug):
    metadata = parse_scraper_metadata(script_path)
    collection_url_template = f"https://gearvn.com/collections/{collection_slug}?page={{page}}"
    print(f">>> Bắt đầu quét {metadata['brand']} {metadata['categories']}...")
    product_urls, collection_complete = collect_collection_urls(collection_url_template)
    if not collection_complete:
        raise RuntimeError("Không thể hoàn tất việc đọc collection; output cũ được giữ nguyên")
    if not product_urls:
        raise RuntimeError("Collection không có sản phẩm; output cũ được giữ nguyên")

    records = []
    failed_urls = []
    for url in product_urls:
        response = fetch_html(url)
        if response is None:
            failed_urls.append(url)
            continue
        soup = BeautifulSoup(response.text, "html.parser")
        record = _product_record(soup, url, metadata["brand"], metadata["categories"])
        if record is None:
            failed_urls.append(url)
            continue
        records.append(record)

    if failed_urls:
        raise RuntimeError(f"{len(failed_urls)} sản phẩm không đọc được; không ghi batch chưa hoàn chỉnh")
    records = deduplicate_records(records)
    date_str = datetime.datetime.now().strftime("%Y%m%d")
    file_prefix = f"{metadata['brand']}_{metadata['categories'].replace(' ', '_')}_{date_str}"
    csv_path, json_path = write_output_atomically(records, file_prefix)
    print(f">>> Hoàn thành: {len(records)} sản phẩm")
    print(f"- {csv_path}")
    print(f"- {json_path}")


if __name__ == "__main__":
    raise SystemExit("Hãy gọi run_scraper từ một scraper cấu hình cụ thể")
