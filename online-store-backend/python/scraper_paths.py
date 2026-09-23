import os
import json
import os
import re
import unicodedata
from pathlib import Path
from urllib.parse import urljoin, urlsplit, urlunsplit

from bs4 import BeautifulSoup


PRODUCT_OUTPUT_FIELDS = (
    "ProductBrand", "ProductID", "ProductName", "ProductSKU", "ProductPriceVND",
    "ProductRegularPriceVND", "ProductCategory",
    "ProductSpecifications", "ProductTechnicalDescription", "ProductDescription",
    "ProductDescriptionImages", "ProductPromotions", "ProductMainImage",
    "ProductMainImageLocalPath", "ProductGalleryImages", "ProductGalleryImageLocalPaths",
    "ProductURL",
)

_PRODUCT_CARD_MARKERS = (
    "product-card",
    "product_card",
    "product-item",
    "product_item",
    "product-grid",
    "product_grid",
    "grid__item",
    "grid-item",
)
_LISTING_SCOPE_SELECTORS = (
    "main",
    "[role=\"main\"]",
    "#MainContent",
    "[data-collection-products]",
    "[data-product-grid]",
)
_EXCLUDED_CONTAINER_MARKERS = (
    "related",
    "recommend",
    "recent",
    "viewed",
    "upsell",
    "cross-sell",
    "cross_sell",
    "accessor",
    "bundle",
)


def _container_signature(node):
    classes = " ".join(node.get("class", []))
    values = (
        classes,
        str(node.get("id", "")),
        str(node.get("aria-label", "")),
        str(node.get("data-section-type", "")),
    )
    return " ".join(values).lower()


def _is_excluded_container(node):
    current = node
    for _ in range(6):
        if current is None or not getattr(current, "name", None):
            break
        if any(marker in _container_signature(current) for marker in _EXCLUDED_CONTAINER_MARKERS):
            return True
        current = current.parent
    return False


def _is_product_card(anchor):
    current = anchor
    for _ in range(6):
        if current is None or not getattr(current, "name", None):
            break
        signature = _container_signature(current)
        if any(marker in signature for marker in _PRODUCT_CARD_MARKERS):
            return True
        if current.get("data-product-id") or current.get("data-product"):
            return True
        if str(current.get("itemtype") or "").lower().endswith("product"):
            return True
        if current.name in ("article", "li") and current.select_one("img") and current.select_one(
            "[class*=price], [data-price], [data-product-price], meta[itemprop=price]"
        ):
            return True
        current = current.parent
    return False


def collect_product_links(soup, collection_url):
    """Collect unique same-site product URLs from actual collection cards."""
    collection = urlsplit(collection_url)
    allowed_hosts = {collection.netloc.lower(), "gearvn.com", "www.gearvn.com"}
    anchors = []
    for selector in _LISTING_SCOPE_SELECTORS:
        anchors.extend(soup.select(f'{selector} a[href*="/products/"]'))
    if not anchors:
        anchors = soup.select('a[href*="/products/"]')

    links = []
    seen = set()
    for anchor in anchors:
        if _is_excluded_container(anchor) or not _is_product_card(anchor):
            continue
        href = str(anchor.get("href") or "").strip()
        if not href:
            continue
        parsed = urlsplit(urljoin(collection_url, href))
        if parsed.netloc.lower() not in allowed_hosts or not parsed.path.startswith("/products/"):
            continue
        clean_url = urlunsplit(("https", "gearvn.com", parsed.path.rstrip("/"), "", ""))
        if clean_url not in seen:
            seen.add(clean_url)
            links.append(clean_url)
    return links


def normalize_metadata_key(value):
    """Return a stable key for comparing scraper metadata and source taxonomy."""
    normalized = unicodedata.normalize("NFKD", str(value or ""))
    normalized = "".join(character for character in normalized if not unicodedata.combining(character))
    return re.sub(r"[^a-z0-9]+", " ", normalized.lower()).strip()


def metadata_key(value):
    return normalize_metadata_key(value).replace(" ", "_")


_BRAND_DISPLAY_NAMES = {
    "asus": "Asus",
    "dareu": "DareU",
    "flesports": "FLEsports",
    "hp": "HP",
    "hyperx": "HyperX",
    "msi": "MSI",
}


def normalize_brand_display(value):
    brand = str(value or "").strip()
    return _BRAND_DISPLAY_NAMES.get(normalize_metadata_key(brand), brand)


def _normalize_taxonomy_text(value):
    return normalize_metadata_key(value)


def parse_scraper_metadata(scraper_path):
    """Parse output metadata from a scraper filename without a fixed taxonomy list."""
    stem = Path(scraper_path).stem
    if stem.endswith("_Scraper"):
        stem = stem[:-len("_Scraper")]
    parts = [part for part in stem.split("_") if part]
    if not parts:
        return {
            "brand": "",
            "categories": "",
            "brand_key": "",
            "categories_key": "",
        }

    brand = normalize_brand_display(parts[0])
    categories = " ".join(parts[1:])
    return {
        "brand": brand,
        "categories": categories,
        "brand_key": normalize_metadata_key(brand),
        "categories_key": metadata_key(categories),
    }


def _iter_json_ld_objects(value):
    if isinstance(value, list):
        for item in value:
            yield from _iter_json_ld_objects(item)
    elif isinstance(value, dict):
        yield value
        if "@graph" in value:
            yield from _iter_json_ld_objects(value["@graph"])


def extract_source_categories(soup):
    values = []
    for script in soup.select('script[type="application/ld+json"]'):
        try:
            payload = json.loads(script.string or script.get_text())
        except (TypeError, ValueError):
            continue
        for item in _iter_json_ld_objects(payload):
            category = item.get("category")
            if isinstance(category, (str, list)):
                values.extend(category if isinstance(category, list) else [category])

    for element in soup.select(
        '[itemprop="category"], meta[property="product:category"], meta[name="category"], '
        '[itemprop="itemListElement"] [itemprop="name"], [class*="breadcrumb"] a, '
        '[class*="breadcrumb"] [itemprop="name"], nav[aria-label*="breadcrumb"] a'
    ):
        values.append(element.get("content") or element.get_text(" ", strip=True))

    return [_normalize_taxonomy_text(value) for value in values if _normalize_taxonomy_text(value)]


def extract_source_brands(soup):
    values = []
    for script in soup.select('script[type="application/ld+json"]'):
        try:
            payload = json.loads(script.string or script.get_text())
        except (TypeError, ValueError):
            continue
        for item in _iter_json_ld_objects(payload):
            brand = item.get("brand")
            if isinstance(brand, dict):
                brand = brand.get("name")
            if isinstance(brand, str):
                values.append(brand)

    for element in soup.select(
        '[itemprop="brand"], meta[property="product:brand"], meta[name="brand"]'
    ):
        values.append(element.get("content") or element.get_text(" ", strip=True))

    return [_normalize_taxonomy_text(value) for value in values if _normalize_taxonomy_text(value)]


def _collection_product_tokens(collection_url):
    path_parts = [part for part in urlsplit(collection_url).path.split("/") if part]
    try:
        collection_index = path_parts.index("collections")
    except ValueError:
        return []
    collection_slug = path_parts[collection_index + 1] if len(path_parts) > collection_index + 1 else ""
    return [
        token
        for token in (_normalize_taxonomy_text(part) for part in collection_slug.split("-"))
        if len(token) >= 3
    ]


def product_matches_collection(soup, collection_url):
    """Validate detail metadata when a collection URL is explicitly provided."""
    path = urlsplit(str(collection_url or "")).path.lower()
    if path.startswith("/products/"):
        return False

    expected_tokens = _collection_product_tokens(collection_url)
    source_brands = extract_source_brands(soup)
    source_categories = [
        category
        for category in extract_source_categories(soup)
        if category not in set(source_brands)
    ]
    if not expected_tokens or not source_categories:
        return False

    collection_key = normalize_metadata_key(" ".join(expected_tokens))
    if not any(
        category == collection_key or category in collection_key
        for category in source_categories
    ):
        return False

    source_brands = extract_source_brands(soup)
    if source_brands:
        return any(
            brand == collection_key
            or re.search(rf"(?:^| ){re.escape(brand)}(?: |$)", collection_key)
            for brand in source_brands
        )
    return True


def get_output_directory():
    project_root = Path(__file__).resolve().parent.parent
    configured_output = os.getenv("SCRAPER_OUTPUT_DIR")

    if configured_output:
        output_dir = Path(configured_output).expanduser()
        if not output_dir.is_absolute():
            output_dir = project_root / output_dir
    else:
        output_dir = project_root / "data" / "scraped-products" / "current"

    return output_dir.resolve()


def get_output_paths(file_prefix, output_dir=None):
    output_dir = Path(output_dir or get_output_directory()).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    return (
        output_dir / f"{file_prefix}.csv",
        output_dir / f"{file_prefix}.json",
        output_dir / f"{file_prefix}.xlsx",
    )


_DESCRIPTION_SELECTORS = (
    '.news-html-content',
    '[data-product-description]',
    '[data-description]',
    '.product-description',
    '.product__description',
    '[class*="product-description"]',
)


def _decode_embedded_html(value):
    decoded = str(value or "")
    for escaped, character in (
        ("\\u003c", "<"),
        ("\\u003e", ">"),
        ("\\u0026", "&"),
        ('\\"', '"'),
    ):
        decoded = decoded.replace(escaped, character)
    return decoded


def _embedded_description_container(soup):
    chunks = []
    for script in soup.find_all("script"):
        script_text = script.string or script.get_text()
        match = re.search(r"self\.__next_f\.push\(\[\s*1\s*,\s*(\".*?\")\s*\]\)", script_text)
        if not match:
            continue
        try:
            chunks.append(json.loads(match.group(1)))
        except (TypeError, ValueError):
            continue

    if not chunks:
        return None

    embedded = BeautifulSoup(_decode_embedded_html("".join(chunks)), "html.parser")
    sections = embedded.select('[id^="section-"]')
    if not sections:
        return None

    first_section = sections[0]
    first_section_id = first_section.get("id")
    last_section = next(
        (section for section in sections[1:] if section.get("id") == first_section_id),
        sections[-1],
    )
    container = embedded.new_tag("div")
    current = first_section
    while current:
        next_node = current.next_sibling
        container.append(current.extract())
        if current is last_section:
            break
        current = next_node
    return container if container.get_text(" ", strip=True) or container.select_one("img") else None


def _description_container(soup):
    for selector in _DESCRIPTION_SELECTORS:
        for content in soup.select(selector):
            if content.get_text(" ", strip=True) or content.select_one("img"):
                return content
    return _embedded_description_container(soup)


def extract_product_description(soup):
    content = _description_container(soup)
    if not content:
        return ""

    parts = []
    for element in content.select('h1, h2, h3, h4, h5, h6, p, li'):
        text = element.get_text(" ", strip=True)
        if text and text not in parts:
            parts.append(text)
    if parts:
        return "\n\n".join(parts)
    return content.get_text(" ", strip=True)


def extract_product_description_images(soup):
    content = _description_container(soup)
    if not content:
        return []

    images = []
    seen_urls = set()
    for image in content.select('img'):
        image_url = _absolute_image_url(_image_url_from_tag(image))
        if not image_url or image_url in seen_urls:
            continue
        seen_urls.add(image_url)
        images.append({
            "ProductDescriptionImageURL": image_url,
            "ProductDescriptionImageAlt": str(image.get("alt") or "").strip(),
        })
    return images


def _parse_vnd_value(value):
    digits = "".join(character for character in str(value or "") if character.isdigit())
    return int(digits) if digits else None


_PROMOTION_TITLES = {
    "ưu đãi đi kèm",
    "khuyến mãi",
    "khuyến mại",
    "quà tặng",
    "promotion",
    "promotions",
    "offers",
}


def _promotion_section(soup):
    for title_node in soup.find_all(string=lambda value: str(value or "").strip().casefold() in _PROMOTION_TITLES):
        for parent in title_node.parents:
            if parent.name not in {"div", "section", "aside"}:
                continue
            if parent.find("p") or parent.find("a"):
                return parent
    return None


def extract_product_promotions(soup):
    section = _promotion_section(soup)
    if not section:
        return []

    promotions = []
    seen = set()
    for paragraph in section.find_all("p"):
        title = paragraph.get_text(" ", strip=True)
        if not title:
            continue

        link = paragraph.find("a", href=True)
        product_url = _absolute_image_url(link.get("href")) if link else ""
        gift_match = re.match(
            r"^Tặng\s+ngay\s+(\d+)\s*x\s+(.+?)(?:\s*\(trị\s*giá\s*([\d.,]+)\s*đ\))?$",
            title,
            flags=re.IGNORECASE,
        )
        if gift_match:
            gift_name = link.get_text(" ", strip=True) if link else gift_match.group(2).strip()
            promotion = {
                "ProductPromotionType": "Gift",
                "ProductPromotionTitle": title,
                "ProductPromotionGiftQuantity": int(gift_match.group(1)),
                "ProductPromotionGiftProductName": gift_name,
            }
            if product_url:
                promotion["ProductPromotionGiftProductURL"] = product_url
            gift_value = _parse_vnd_value(gift_match.group(3))
            if gift_value is not None:
                promotion["ProductPromotionGiftValueVND"] = gift_value
        else:
            scope_match = re.match(r"^\[([^\]]+)\]\s*", title)
            promotion = {
                "ProductPromotionType": "Discount",
                "ProductPromotionTitle": title,
                "ProductPromotionDiscountText": title,
            }
            if scope_match:
                promotion["ProductPromotionScope"] = scope_match.group(1).strip()

        identity = (
            promotion["ProductPromotionType"],
            promotion["ProductPromotionTitle"],
            promotion.get("ProductPromotionGiftProductURL", ""),
        )
        if identity not in seen:
            seen.add(identity)
            promotions.append(promotion)
    return promotions


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


def _iter_json_ld_values(value):
    if isinstance(value, list):
        for item in value:
            yield from _iter_json_ld_values(item)
    elif isinstance(value, dict):
        yield value
        for nested in value.values():
            if isinstance(nested, (dict, list)):
                yield from _iter_json_ld_values(nested)


def _json_ld_product_images(soup):
    images = []
    for script in soup.select('script[type="application/ld+json"]'):
        try:
            payload = json.loads(script.string or script.get_text())
        except (TypeError, ValueError):
            continue
        for value in _iter_json_ld_values(payload):
            types = value.get("@type", [])
            types = types if isinstance(types, list) else [types]
            if not any(str(item).casefold() == "product" for item in types):
                continue
            image_values = value.get("image", [])
            image_values = image_values if isinstance(image_values, list) else [image_values]
            for image in image_values:
                if isinstance(image, dict):
                    image = image.get("url") or image.get("contentUrl")
                url = _absolute_image_url(image)
                if url and url not in images:
                    images.append(url)
    return images


def _parse_price_value(value):
    digits = "".join(character for character in str(value or "") if character.isdigit())
    return int(digits) if digits else None


def _has_price_class(tag, class_fragment):
    return any(class_fragment in class_name for class_name in tag.get("class", []))


def _price_from_tag(tag, attributes=()):
    if not tag:
        return None

    for attribute in attributes:
        price = _parse_price_value(tag.get(attribute))
        if price:
            return price

    return _parse_price_value(tag.get_text(" ", strip=True))


def extract_product_prices(soup, fallback_price="N/A"):
    """Return sale and regular VND prices without inferring a missing regular price."""
    summary = soup.select_one('[data-product-summary-region="true"]') or soup
    original_price_tag = summary.select_one(
        '.line-through, del, s, .old-price, .regular-price, .price-regular, '
        '[data-product-regular-price], [data-compare-at-price]'
    )
    regular_price = _price_from_tag(
        original_price_tag,
        ('data-product-regular-price', 'data-compare-at-price', 'data-price', 'content', 'value'),
    )

    sale_price_tag = next(
        (
            tag
            for tag in summary.select(
                '[data-product-sale-price], [data-sale-price], .flash-price-sale, '
                '.sale-price, .price-sale, .color-red-700, .text-green-600, ins'
            )
            if not _has_price_class(tag, 'line-through')
            and (_price_from_tag(tag, ('data-product-sale-price', 'data-sale-price', 'data-price', 'content', 'value')) or 0) >= 1000
        ),
        None,
    )
    sale_price = _price_from_tag(
        sale_price_tag,
        ('data-product-sale-price', 'data-sale-price', 'data-price', 'content', 'value'),
    )

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

    for url in _json_ld_product_images(soup):
        if url not in seen:
            seen.add(url)
            urls.append(url)

    if not urls:
        og_image = soup.select_one('meta[property="og:image"], meta[property="og:image:secure_url"]')
        if og_image:
            url = _absolute_image_url(og_image.get("content"))
            if url:
                urls.append(url)

    return urls
