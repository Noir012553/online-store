import argparse
import argparse
import hashlib
import json
import os
import tempfile
import time
from datetime import datetime, timezone
from http.client import IncompleteRead
from pathlib import Path
from urllib.parse import urlparse

import requests

from scraper_paths import get_output_directory


MAX_IMAGE_BYTES = 5 * 1024 * 1024
IMAGE_EXTENSIONS = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
}
INVALID_IDENTITIES = {'', 'n/a', 'na', 'none', 'null', 'unknown'}
HEADERS = {
    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    'User-Agent': 'Mozilla/5.0 (compatible; LaptopStoreCrawler/1.0)',
    'Referer': 'https://gearvn.com/',
}


def _read_positive_int(name, fallback):
    try:
        value = int(os.getenv(name, fallback))
    except (TypeError, ValueError):
        return fallback
    return value if value > 0 else fallback


IMAGE_CONFIG = {
    'connect_timeout_seconds': _read_positive_int('SCRAPER_IMAGE_CONNECT_TIMEOUT_SECONDS', 15),
    'read_timeout_seconds': _read_positive_int('SCRAPER_IMAGE_READ_TIMEOUT_SECONDS', 30),
    'retry_attempts': _read_positive_int('SCRAPER_IMAGE_RETRY_ATTEMPTS', 3),
    'retry_backoff_seconds': _read_positive_int('SCRAPER_IMAGE_RETRY_BACKOFF_SECONDS', 1),
}


def normalize_identity(product):
    sku = str(product.get('ProductSKU') or product.get('SKU') or '').strip()
    if sku.lower() not in INVALID_IDENTITIES:
        return sku

    brand = str(product.get('ProductBrand') or product.get('Brand') or '').strip()
    name = str(product.get('ProductName') or product.get('Name') or '').strip()
    return str(product.get('ProductURL') or product.get('URL') or f'{brand}:{name}').strip()


def get_product_key(product):
    identity = normalize_identity(product)
    if not identity:
        raise ValueError('Product has no stable identity for image storage')
    return hashlib.sha256(identity.encode('utf-8')).hexdigest()[:24]


def split_gallery(value):
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str):
        return [item.strip() for item in value.replace('||', '|').split('|') if item.strip()]
    return []


def is_remote_image(value):
    return str(value or '').strip().lower().startswith(('http://', 'https://'))


def extension_for_response(response, source_url):
    content_type = response.headers.get('content-type', '').split(';', 1)[0].lower()
    if content_type in IMAGE_EXTENSIONS:
        return IMAGE_EXTENSIONS[content_type]

    suffix = Path(urlparse(source_url).path).suffix.lower()
    return suffix if suffix in {'.jpg', '.jpeg', '.png', '.webp', '.gif'} else '.jpg'


def _is_retryable_download_error(error):
    if isinstance(error, IncompleteRead):
        return True
    if isinstance(error, requests.exceptions.HTTPError):
        status = error.response.status_code if error.response is not None else None
        return status in {408, 429} or (status is not None and status >= 500)
    if isinstance(error, requests.exceptions.RequestException):
        return True

    current = error
    for _ in range(3):
        current = current.__cause__ or current.__context__
        if current is None:
            break
        if isinstance(current, IncompleteRead) or 'incompleteread' in type(current).__name__.lower():
            return True
    return 'incompleteread' in str(error).lower()


def download_image(source_url, destination_base, slot):
    destination_base.mkdir(parents=True, exist_ok=True)
    temporary_path = None

    try:
        with requests.get(
            source_url,
            headers=HEADERS,
            timeout=(
                IMAGE_CONFIG['connect_timeout_seconds'],
                IMAGE_CONFIG['read_timeout_seconds'],
            ),
            stream=True,
            allow_redirects=True,
        ) as response:
            response.raise_for_status()
            content_type = response.headers.get('content-type', '').split(';', 1)[0].lower()
            if content_type and not content_type.startswith('image/'):
                raise ValueError(f'Remote resource is not an image: {content_type}')

            destination = destination_base / f'{slot}{extension_for_response(response, source_url)}'
            if destination.exists():
                return destination

            with tempfile.NamedTemporaryFile(
                dir=destination_base,
                prefix=f'.{slot}.',
                suffix='.part',
                delete=False,
            ) as temporary_file:
                temporary_path = Path(temporary_file.name)
                total_bytes = 0
                for chunk in response.iter_content(chunk_size=64 * 1024):
                    if not chunk:
                        continue
                    total_bytes += len(chunk)
                    if total_bytes > MAX_IMAGE_BYTES:
                        raise ValueError('Remote image exceeds the 5 MB limit')
                    temporary_file.write(chunk)

        with temporary_path.open('rb') as image_file:
            signature = image_file.read(12)
        if not is_image_signature(signature):
            raise ValueError('Remote response does not contain a supported image')

        os.replace(temporary_path, destination)
        return destination
    except Exception:
        if temporary_path and temporary_path.exists():
            temporary_path.unlink()
        raise


def download_image_with_retry(source_url, destination_base, slot):
    last_error = None
    for attempt in range(IMAGE_CONFIG['retry_attempts']):
        try:
            return download_image(source_url, destination_base, slot)
        except Exception as error:
            last_error = error
            if not _is_retryable_download_error(error) or attempt == IMAGE_CONFIG['retry_attempts'] - 1:
                raise
            time.sleep(IMAGE_CONFIG['retry_backoff_seconds'] * (2 ** attempt))
    raise last_error


def is_image_signature(signature):
    return (
        signature.startswith(b'\xff\xd8\xff')
        or signature.startswith(b'\x89PNG\r\n\x1a\n')
        or signature[:6] in (b'GIF87a', b'GIF89a')
        or signature[:4] == b'RIFF' and signature[8:12] == b'WEBP'
    )


def to_relative_path(output_root, file_path):
    return file_path.relative_to(output_root).as_posix()


def infer_existing_batch_id(products, output_root):
    image_root = output_root / 'images'
    for product in products:
        image_values = [
            product.get('ProductMainImage') or product.get('MainImage'),
            *split_gallery(product.get('ProductGalleryImages') or product.get('GalleryImages')),
        ]
        for image_value in image_values:
            relative_path = Path(str(image_value or '').replace('\\', '/'))
            if len(relative_path.parts) > 1 and relative_path.parts[0] == 'images':
                batch_id = relative_path.parts[1]
                if (image_root / batch_id).exists():
                    return batch_id
    return None


def process_image(source, destination_base, slot):
    source = str(source or '').strip()
    if not source:
        return '', None
    if not is_remote_image(source):
        return source.replace('\\', '/'), None

    return download_image_with_retry(source, destination_base, slot), source


def create_batch_id():
    return datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')


def process_file(json_path, output_root, batch_id=None):
    products = json.loads(json_path.read_text(encoding='utf-8'))
    if not isinstance(products, list):
        raise ValueError(f'{json_path.name} must contain a product array')

    batch_id = infer_existing_batch_id(products, output_root) or batch_id or create_batch_id()
    manifest = {}
    main_failures = []
    gallery_failures = []
    changed = False

    for index, product in enumerate(products):
        product_key = get_product_key(product)
        product_dir = output_root / 'images' / batch_id / json_path.stem / product_key
        entry = {
            'batchId': batch_id,
            'productUrl': product.get('ProductURL') or product.get('URL'),
            'productKey': product_key,
            'main': [],
            'gallery': [],
        }

        main_key = 'ProductMainImage' if 'ProductMainImage' in product else 'MainImage'
        gallery_key = 'ProductGalleryImages' if 'ProductGalleryImages' in product else 'GalleryImages'
        main_source = product.get(main_key)
        if is_remote_image(main_source):
            try:
                main_path, source_url = process_image(main_source, product_dir, 'main')
                product[main_key] = to_relative_path(output_root, main_path)
                entry['main'] = {'sourceUrl': source_url, 'localPath': product[main_key], 'status': 'downloaded'}
                changed = True
            except Exception as error:
                main_failures.append(f'{json_path.name} row {index + 1}: {main_source} ({error})')
                entry['main'] = {'sourceUrl': main_source, 'status': 'failed', 'error': str(error)}
        else:
            entry['main'] = {'localPath': main_source, 'status': 'local'}

        gallery_sources = split_gallery(product.get(gallery_key))
        gallery_paths = []
        for gallery_index, gallery_source in enumerate(gallery_sources):
            slot = f'gallery-{gallery_index + 1:02d}'
            if is_remote_image(gallery_source):
                try:
                    gallery_path, source_url = process_image(gallery_source, product_dir, slot)
                    gallery_path = to_relative_path(output_root, gallery_path)
                    gallery_paths.append(gallery_path)
                    entry['gallery'].append({'sourceUrl': source_url, 'localPath': gallery_path, 'status': 'downloaded'})
                    changed = True
                except Exception as error:
                    gallery_failures.append(f'{json_path.name} row {index + 1} gallery {gallery_index + 1}: {gallery_source} ({error})')
                    gallery_paths.append(gallery_source)
                    entry['gallery'].append({'sourceUrl': gallery_source, 'status': 'failed', 'error': str(error)})
            elif gallery_source:
                gallery_path = gallery_source.replace('\\', '/')
                gallery_paths.append(gallery_path)
                entry['gallery'].append({'localPath': gallery_path, 'status': 'local'})

        if gallery_paths:
            product[gallery_key] = gallery_paths if gallery_key == 'ProductGalleryImages' else ' || '.join(gallery_paths)

        description_key = 'ProductDescriptionImages' if 'ProductDescriptionImages' in product else 'DescriptionImages'
        description_entries = product.get(description_key) or []
        description_paths = []
        entry['description'] = []
        for description_index, description_entry in enumerate(description_entries):
            if isinstance(description_entry, dict):
                description_source = (
                    description_entry.get('ProductDescriptionImageURL')
                    or description_entry.get('url')
                    or description_entry.get('sourceUrl')
                )
                updated_entry = dict(description_entry)
            else:
                description_source = description_entry
                updated_entry = {}

            description_source = str(description_source or '').strip()
            if not description_source:
                continue

            slot = f'description-{description_index + 1:02d}'
            if is_remote_image(description_source):
                try:
                    description_path, source_url = process_image(description_source, product_dir, slot)
                    description_path = to_relative_path(output_root, description_path)
                    entry['description'].append({
                        'sourceUrl': source_url,
                        'localPath': description_path,
                        'status': 'downloaded',
                    })
                    changed = True
                except Exception as error:
                    entry['description'].append({
                        'sourceUrl': description_source,
                        'status': 'failed',
                        'error': str(error),
                    })
                    continue
            else:
                description_path = description_source.replace('\\', '/')
                entry['description'].append({
                    'localPath': description_path,
                    'status': 'local',
                })

            updated_entry['ProductDescriptionImageURL'] = description_path
            if 'ProductDescriptionImageAlt' not in updated_entry and 'alt' in updated_entry:
                updated_entry['ProductDescriptionImageAlt'] = updated_entry['alt']
            description_paths.append(updated_entry)

        if description_key in product:
            product[description_key] = description_paths

        manifest[product_key] = entry

    if changed:
        temporary_path = json_path.with_suffix('.json.part')
        temporary_path.write_text(json.dumps(products, ensure_ascii=False, indent=4), encoding='utf-8')
        os.replace(temporary_path, json_path)

    manifest_path = output_root / 'manifests' / batch_id / f'{json_path.stem}.images.json'
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    return main_failures, gallery_failures


def get_target_files(output_root, file_arg, since):
    if file_arg:
        target = Path(file_arg)
        if not target.is_absolute():
            target = output_root / target
        return [target.resolve()]

    return sorted(
        path for path in output_root.glob('*.json')
        if since is None or path.stat().st_mtime >= since
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--file')
    parser.add_argument('--since', type=float)
    args = parser.parse_args()
    output_root = get_output_directory()
    batch_id = create_batch_id()
    target_files = get_target_files(output_root, args.file, args.since)
    if not target_files:
        raise SystemExit('No product JSON files matched image processing')

    all_main_failures = []
    all_gallery_failures = []
    for json_path in target_files:
        main_failures, gallery_failures = process_file(json_path, output_root, batch_id)
        all_main_failures.extend(main_failures)
        all_gallery_failures.extend(gallery_failures)
        print(f'[ImageProcessor] Processed {json_path.name}')

    for failure in all_gallery_failures:
        print(f'[ImageProcessor] WARNING gallery: {failure}')
    if all_main_failures:
        for failure in all_main_failures:
            print(f'[ImageProcessor] ERROR main: {failure}')
        raise SystemExit(1)


if __name__ == '__main__':
    main()
