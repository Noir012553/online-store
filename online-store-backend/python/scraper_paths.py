import os
import os
from pathlib import Path
from urllib.parse import urljoin


PRODUCT_OUTPUT_FIELDS = (
    "Brand", "ID", "Name", "SKU", "Price_VND", "Regular_Price", "InStock",
    "Categories", "Attributes", "Description", "MainImage", "GalleryImages", "URL",
)


def get_output_directory():
    project_root = Path(__file__).resolve().parent.parent
    configured_output = os.getenv("SCRAPER_OUTPUT_DIR")

    if configured_output:
        output_dir = Path(configured_output).expanduser()
        if not output_dir.is_absolute():
            output_dir = project_root / output_dir
    else:
        output_dir = project_root / "data" / "scraped-products"

    return output_dir.resolve()


def get_output_paths(file_prefix):
    output_dir = get_output_directory()
    output_dir.mkdir(parents=True, exist_ok=True)
    return (
        output_dir / f"{file_prefix}.csv",
        output_dir / f"{file_prefix}.json",
    )


def _image_url_from_tag(image):
    """Return the best URL from an image tag, including lazy-load variants."""
    for attribute in ("data-src", "data-original", "src"):
        value = str(image.get(attribute) or "").strip()
        if value:
            return value

    srcset = str(image.get("data-srcset") or image.get("srcset") or "").strip()
    if srcset:
        return srcset.split(",")[-1].strip().split()[0]
    return ""


def _absolute_image_url(value, base_url="https://gearvn.com"):
    value = str(value or "").strip()
    if not value:
        return ""
    if value.startswith("//"):
        return "https:" + value
    return urljoin(base_url, value)


def _parse_price_value(value):
    digits = "".join(character for character in str(value or "") if character.isdigit())
    return int(digits) if digits else None


def _has_price_class(tag, class_fragment):
    return any(class_fragment in class_name for class_name in tag.get("class", []))


def extract_product_prices(soup, fallback_price="N/A"):
    """Return sale and regular VND prices without inferring a missing regular price."""
    summary = soup.select_one('[data-product-summary-region="true"]') or soup

    original_price_tag = summary.select_one('.line-through')
    regular_price = _parse_price_value(original_price_tag.get_text(" ", strip=True)) if original_price_tag else None

    sale_price_tag = next(
        (
            tag
            for tag in summary.find_all('span')
            if not _has_price_class(tag, 'line-through')
            and (
                _has_price_class(tag, 'color-red-700')
                or _has_price_class(tag, 'flash-price-sale')
                or _has_price_class(tag, 'text-green-600')
            )
            and _parse_price_value(tag.get_text(" ", strip=True))
        ),
        None,
    )
    sale_price = _parse_price_value(sale_price_tag.get_text(" ", strip=True)) if sale_price_tag else None

    normalized_fallback = _parse_price_value(fallback_price) or fallback_price
    return sale_price or normalized_fallback, regular_price


def extract_product_image_urls(soup):
    """Extract product images in main/gallery order without scanning unrelated images.

    GearVN's explicit main image and thumbnail selectors are preferred. The semantic
    gallery selectors are only used when those selectors do not produce any images.
    """
    urls = []
    seen = set()

    def add_images(images):
        for image in images:
            url = _absolute_image_url(_image_url_from_tag(image))
            if url and url not in seen:
                seen.add(url)
                urls.append(url)

    # Keep the explicit GearVN main image first, followed by thumbnails in DOM order.
    add_images(soup.select('button[aria-label^="Xem ảnh sản phẩm"] img'))
    add_images(soup.select('img[alt^="Thumbnail "]'))
    if urls:
        return urls

    gallery_selectors = (
        '[data-product-gallery] img',
        '[data-gallery] img',
        '[class*="product-gallery"] img',
        '[class*="product__media"] img',
        '[class*="product-single__media"] img',
        '[class*="product-media"] img',
    )
    for selector in gallery_selectors:
        add_images(soup.select(selector))

    if not urls:
        og_image = soup.select_one('meta[property="og:image"]')
        if og_image:
            url = _absolute_image_url(og_image.get("content"))
            if url:
                urls.append(url)

    return urls
