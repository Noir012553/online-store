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
                'ProductDescriptionImageURL': 'images/batch/products/sku/description-01.jpg',
                'ProductDescriptionImageAlt': 'Ảnh mô tả',
            }])


if __name__ == '__main__':
    unittest.main()
