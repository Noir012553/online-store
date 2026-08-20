import argparse
import hashlib
import json
import os
import tempfile
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


def normalize_identity(product):
    sku = str(product.get('SKU') or '').strip()
    if sku.lower() not in INVALID_IDENTITIES:
        return sku

    brand = str(product.get('Brand') or '').strip()
    name = str(product.get('Name') or '').strip()
    return str(product.get('URL') or f'{brand}:{name}').strip()


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


def download_image(source_url, destination_base, slot):
    destination_base.mkdir(parents=True, exist_ok=True)
    temporary_path = None

    try:
        with requests.get(
            source_url,
            headers=HEADERS,
            timeout=(15, 30),
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


def is_image_signature(signature):
    return (
        signature.startswith(b'\xff\xd8\xff')
        or signature.startswith(b'\x89PNG\r\n\x1a\n')
        or signature[:6] in (b'GIF87a', b'GIF89a')
        or signature[:4] == b'RIFF' and signature[8:12] == b'WEBP'
    )


def to_relative_path(output_root, file_path):
    return file_path.relative_to(output_root).as_posix()


def process_image(source, destination_base, slot):
    source = str(source or '').strip()
    if not source:
        return '', None
    if not is_remote_image(source):
        return source.replace('\\', '/'), None

    return download_image(source, destination_base, slot), source


def process_file(json_path, output_root):
    products = json.loads(json_path.read_text(encoding='utf-8'))
    if not isinstance(products, list):
        raise ValueError(f'{json_path.name} must contain a product array')

    manifest = {}
    main_failures = []
    gallery_failures = []
    changed = False

    for index, product in enumerate(products):
        product_key = get_product_key(product)
        product_dir = output_root / 'images' / json_path.stem / product_key
        entry = {
            'productUrl': product.get('URL'),
            'productKey': product_key,
            'main': [],
            'gallery': [],
        }

        main_source = product.get('MainImage')
        if is_remote_image(main_source):
            try:
                main_path, source_url = process_image(main_source, product_dir, 'main')
                product['MainImage'] = to_relative_path(output_root, main_path)
                entry['main'] = {'sourceUrl': source_url, 'localPath': product['MainImage'], 'status': 'downloaded'}
                changed = True
            except Exception as error:
                main_failures.append(f'{json_path.name} row {index + 1}: {main_source} ({error})')
                entry['main'] = {'sourceUrl': main_source, 'status': 'failed', 'error': str(error)}
        else:
            entry['main'] = {'localPath': main_source, 'status': 'local'}

        gallery_sources = split_gallery(product.get('GalleryImages'))
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
                    entry['gallery'].append({'sourceUrl': gallery_source, 'status': 'failed', 'error': str(error)})
            elif gallery_source:
                gallery_paths.append(gallery_source.replace('\\', '/'))
                entry['gallery'].append({'localPath': gallery_source, 'status': 'local'})

        if gallery_paths:
            product['GalleryImages'] = ' || '.join(gallery_paths)
        elif product.get('GalleryImages'):
            product['GalleryImages'] = ''
        manifest[product_key] = entry

    if changed:
        temporary_path = json_path.with_suffix('.json.part')
        temporary_path.write_text(json.dumps(products, ensure_ascii=False, indent=4), encoding='utf-8')
        os.replace(temporary_path, json_path)

    manifest_path = output_root / 'manifests' / f'{json_path.stem}.images.json'
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
    target_files = get_target_files(output_root, args.file, args.since)
    if not target_files:
        raise SystemExit('No product JSON files matched image processing')

    all_main_failures = []
    all_gallery_failures = []
    for json_path in target_files:
        main_failures, gallery_failures = process_file(json_path, output_root)
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
