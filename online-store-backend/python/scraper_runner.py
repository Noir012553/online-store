import csv
import csv
import datetime
import json
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import pandas as pd
import requests
from bs4 import BeautifulSoup

from scraper_paths import (
    PRODUCT_OUTPUT_FIELDS,
    collect_product_links,
    extract_product_description,
    extract_product_description_images,
    extract_product_image_urls,
    extract_product_prices,
    extract_product_promotions,
    get_output_paths,
    parse_scraper_metadata,
)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://gearvn.com/",
}
RETRYABLE_STATUS_CODES = frozenset({429, 500, 502, 503, 504})
MAX_ATTEMPTS = 3
DEFAULT_MAX_WORKERS = 4
MAX_MAX_WORKERS = 8
SCRAPE_SOURCE = "gearvn"
DEFAULT_PARSER_VERSION = "product-v2"
_thread_local = threading.local()


def _request_get(url, headers, timeout):
    session = getattr(_thread_local, "session", None)
    if session is None:
        session = requests.Session()
        _thread_local.session = session
    return session.get(url, headers=headers, timeout=timeout)


def get_max_workers():
    try:
        configured = int(os.getenv("SCRAPER_MAX_WORKERS", DEFAULT_MAX_WORKERS))
    except (TypeError, ValueError):
        configured = DEFAULT_MAX_WORKERS
    return min(max(configured, 1), MAX_MAX_WORKERS)


def fetch_html(url, *, headers=HEADERS, timeout=10, attempts=MAX_ATTEMPTS, sleep=None):
    sleep = sleep or time.sleep
    for attempt in range(attempts):
        try:
            response = _request_get(url, headers, timeout)
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


def collect_collection_urls(collection_url_template, *, sleep=None):
    sleep = sleep or time.sleep
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
    specs = extract_product_specs(soup)
    return {
        "ProductBrand": brand,
        "ProductID": url.rstrip("/").split("/")[-1],
        "ProductName": name,
        "ProductSKU": sku,
        "ProductPriceVND": price,
        "ProductRegularPriceVND": regular_price,
        "ProductCategory": categories,
        "ProductSpecifications": specs,
        "ProductTechnicalDescription": "Thông số: " + json.dumps(specs, ensure_ascii=False),
        "ProductDescription": extract_product_description(soup),
        "ProductDescriptionImages": extract_product_description_images(soup),
        "ProductPromotions": extract_product_promotions(soup),
        "ProductMainImage": image_urls[0] if image_urls else "",
        "ProductGalleryImages": image_urls[1:],
        "ProductURL": url,
    }


def deduplicate_records(records):
    result = []
    seen_urls = set()
    seen_skus = set()
    for record in records:
        url = _canonical_product_url(record["ProductURL"])
        sku = str(record.get("ProductSKU") or "").strip().lower()
        if url in seen_urls or (sku and sku != "n/a" and sku in seen_skus):
            continue
        record["ProductURL"] = url
        seen_urls.add(url)
        if sku and sku != "n/a":
            seen_skus.add(sku)
        result.append(record)
    return result


def build_staging_records(records, run_id, captured_at, parser_version):
    return [
        {
            "ScrapeSource": SCRAPE_SOURCE,
            "ScrapeURL": record["ProductURL"],
            "ScrapeRunID": run_id,
            "ScrapeCapturedAt": captured_at,
            "ScrapeParserVersion": parser_version,
            "ProductData": record,
        }
        for record in records
    ]


def write_output_atomically(records, staging_records, file_prefix):
    if not records:
        raise RuntimeError("Không ghi output rỗng")
    output_dir = Path(get_output_paths(file_prefix)[0]).parent
    csv_path, json_path = get_output_paths(file_prefix)
    staging_path = output_dir / f"{file_prefix}.staging.json"
    csv_tmp = output_dir / f".{csv_path.name}.part"
    json_tmp = output_dir / f".{json_path.name}.part"
    staging_tmp = output_dir / f".{staging_path.name}.part"
    try:
        frame = pd.DataFrame(records, columns=PRODUCT_OUTPUT_FIELDS)
        csv_frame = frame.apply(
            lambda column: column.map(
                lambda value: json.dumps(value, ensure_ascii=False)
                if isinstance(value, (dict, list))
                else value
            )
        )
        csv_frame.to_csv(csv_tmp, index=False, encoding="utf-8-sig", quoting=csv.QUOTE_ALL)
        frame.to_json(json_tmp, orient="records", indent=4, force_ascii=False)
        with staging_tmp.open("w", encoding="utf-8") as staging_file:
            json.dump(staging_records, staging_file, ensure_ascii=False, indent=2)
            staging_file.write("\n")
        os.replace(csv_tmp, csv_path)
        os.replace(json_tmp, json_path)
        os.replace(staging_tmp, staging_path)
    finally:
        csv_tmp.unlink(missing_ok=True)
        json_tmp.unlink(missing_ok=True)
        staging_tmp.unlink(missing_ok=True)
    return csv_path, json_path, staging_path


def _scrape_product(url, brand, categories):
    try:
        response = fetch_html(url)
        if response is None:
            return url, None
        soup = BeautifulSoup(response.text, "html.parser")
        return url, _product_record(soup, url, brand, categories)
    except Exception as error:
        print(f"Lỗi xử lý {url}: {error}")
        return url, None


def scrape_products(product_urls, brand, categories, max_workers=None):
    worker_count = max_workers or get_max_workers()
    records_by_url = {}
    failed_urls = []
    with ThreadPoolExecutor(max_workers=worker_count) as executor:
        futures = {
            executor.submit(_scrape_product, url, brand, categories): url
            for url in product_urls
        }
        for future in as_completed(futures):
            url, record = future.result()
            if record is None:
                failed_urls.append(url)
            else:
                records_by_url[url] = record
    records = [records_by_url[url] for url in product_urls if url in records_by_url]
    return records, failed_urls


def run_scraper(script_path, collection_slug):
    metadata = parse_scraper_metadata(script_path)
    collection_url_template = f"https://gearvn.com/collections/{collection_slug}?page={{page}}"
    worker_count = get_max_workers()
    print(f">>> Bắt đầu quét {metadata['brand']} {metadata['categories']} với {worker_count} workers...")
    product_urls, collection_complete = collect_collection_urls(collection_url_template)
    if not collection_complete:
        raise RuntimeError("Không thể hoàn tất việc đọc collection; output cũ được giữ nguyên")
    if not product_urls:
        print(
            f"⚠️ Collection {collection_slug} không có sản phẩm; "
            "giữ nguyên output cũ và bỏ qua scraper này."
        )
        return

    records, failed_urls = scrape_products(
        product_urls,
        metadata["brand"],
        metadata["categories"],
        worker_count,
    )
    if failed_urls:
        raise RuntimeError(f"{len(failed_urls)} sản phẩm không đọc được; không ghi batch chưa hoàn chỉnh")
    records = deduplicate_records(records)
    captured_at = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0)
    run_id = captured_at.strftime("%Y%m%dT%H%M%SZ")
    parser_version = str(os.getenv("SCRAPER_PARSER_VERSION") or DEFAULT_PARSER_VERSION).strip()
    staging_records = build_staging_records(
        records,
        run_id,
        captured_at.isoformat().replace("+00:00", "Z"),
        parser_version,
    )
    file_prefix = f"{metadata['brand']}_{metadata['categories'].replace(' ', '_')}_{captured_at.strftime('%Y%m%d')}"
    csv_path, json_path, staging_path = write_output_atomically(records, staging_records, file_prefix)
    print(f">>> Hoàn thành: {len(records)} sản phẩm")
    print(f"- {csv_path}")
    print(f"- {json_path}")
    print(f"- {staging_path}")


if __name__ == "__main__":
    raise SystemExit("Hãy gọi run_scraper từ một scraper cấu hình cụ thể")
