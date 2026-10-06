import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from prepare_product_images import process_file


class PrepareProductImagesTest(unittest.TestCase):
    def test_downloads_description_images_and_rewrites_json_path(self):
        with tempfile.TemporaryDirectory() as directory:
            output_root = Path(directory)
            json_path = output_root / 'products.json'
            json_path.write_text(json.dumps([{
                'ProductSKU': 'SKU-1',
                'ProductName': 'Example Product',
                'ProductMainImage': 'images/batch/products/sku/main.jpg',
                'ProductDescriptionImages': [{
                    'ProductDescriptionImageURL': 'https://cdn.example.com/description.jpg',
                    'ProductDescriptionImageAlt': 'Ảnh mô tả',
                }],
            }]), encoding='utf-8')
            downloaded_path = output_root / 'images' / 'batch' / 'products' / 'sku' / 'description-01.jpg'

            with patch('prepare_product_images.download_image_with_retry', return_value=downloaded_path):
                main_failures, gallery_failures = process_file(
                    json_path,
                    output_root,
                    batch_id='batch',
                )

            self.assertEqual(main_failures, [])
            self.assertEqual(gallery_failures, [])
            product = json.loads(json_path.read_text(encoding='utf-8'))[0]
            self.assertEqual(product['ProductDescriptionImages'], [{
                'ProductDescriptionImageURL': 'https://cdn.example.com/description.jpg',
                'ProductDescriptionImageLocalPath': 'images/batch/products/sku/description-01.jpg',
                'ProductDescriptionImageAlt': 'Ảnh mô tả',
            }])
            self.assertEqual(product['ProductMainImageLocalPath'], 'images/batch/products/sku/main.jpg')


    def test_preserves_source_urls_and_adds_local_paths_for_all_image_slots(self):
        with tempfile.TemporaryDirectory() as directory:
            output_root = Path(directory)
            json_path = output_root / 'products.json'
            json_path.write_text(json.dumps([{
                'ProductSKU': 'SKU-2',
                'ProductName': 'Example Product 2',
                'ProductMainImage': 'https://cdn.example.com/main.jpg',
                'ProductGalleryImages': [
                    'https://cdn.example.com/gallery-1.jpg',
                    'https://cdn.example.com/gallery-2.jpg',
                ],
                'ProductDescriptionImages': [],
            }]), encoding='utf-8')

            def fake_download(source_url, destination_base, slot):
                return destination_base / f'{slot}.jpg'

            with patch('prepare_product_images.download_image_with_retry', side_effect=fake_download):
                process_file(json_path, output_root, batch_id='batch')

            product = json.loads(json_path.read_text(encoding='utf-8'))[0]
            self.assertEqual(product['ProductMainImage'], 'https://cdn.example.com/main.jpg')
            self.assertEqual(product['ProductMainImageLocalPath'], 'images/batch/products/sku-2/main.jpg')
            self.assertEqual(product['ProductGalleryImages'], [
                'https://cdn.example.com/gallery-1.jpg',
                'https://cdn.example.com/gallery-2.jpg',
            ])
            self.assertEqual(product['ProductGalleryImageLocalPaths'], [
                'images/batch/products/sku-2/gallery-01.jpg',
                'images/batch/products/sku-2/gallery-02.jpg',
            ])


if __name__ == '__main__':
    unittest.main()
