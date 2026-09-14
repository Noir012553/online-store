import unittest

from bs4 import BeautifulSoup

from scraper_paths import (
    collect_product_links,
    extract_product_description,
    extract_product_description_images,
    extract_product_promotions,
    parse_scraper_metadata,
    product_matches_collection,
)


class ScraperPathsTest(unittest.TestCase):
    def test_collects_only_product_cards_from_same_site(self):
        html = """
        <main>
          <div class="product-card"><a href="/products/valid">Valid</a></div>
          <section class="related-products">
            <div class="product-card"><a href="/products/related">Related</a></div>
          </section>
          <div><a href="/products/no-card">No card</a></div>
          <article><img src="x"><span class="price">1</span><a href="/products/article">Article</a></article>
          <div class="product-card"><a href="https://example.com/products/external">External</a></div>
        </main>
        """
        links = collect_product_links(
            BeautifulSoup(html, "html.parser"),
            "https://gearvn.com/collections/test?page=1",
        )

        self.assertEqual(
            links,
            [
                "https://gearvn.com/products/valid",
                "https://gearvn.com/products/article",
            ],
        )

    def test_matches_collection_type_from_product_metadata(self):
        soup = BeautifulSoup(
            """
            <script type="application/ld+json">
              {"@type":"Product","category":"Laptop Gaming"}
            </script>
            """,
            "html.parser",
        )

        self.assertTrue(
            product_matches_collection(
                soup,
                "https://gearvn.com/collections/laptop-gaming-acer?page=1",
            )
        )

    def test_parses_metadata_from_scraper_filename(self):
        self.assertEqual(
            parse_scraper_metadata("/tmp/Acer_Laptop_Gaming_Scraper.py"),
            {
                "brand": "Acer",
                "categories": "Laptop Gaming",
                "brand_key": "acer",
                "categories_key": "laptop_gaming",
            },
        )
        self.assertEqual(
            parse_scraper_metadata("Razer_Keyboard_Scraper.py"),
            {
                "brand": "Razer",
                "categories": "Keyboard",
                "brand_key": "razer",
                "categories_key": "keyboard",
            },
        )

    def test_extracts_product_description_images_and_promotions(self):
        soup = BeautifulSoup(
            """
            <section>
              <h2>Thông tin sản phẩm</h2>
              <div class="news-html-content">
                <h2>Hiệu năng ổn định</h2>
                <p>Phù hợp cho công việc văn phòng.</p>
                <p><img src="//cdn.example.com/feature.jpg" alt="Ảnh tính năng"></p>
              </div>
            </section>
            <section>
              <div><span>Ưu đãi đi kèm</span></div>
              <p>Tặng ngay 1 x <a href="/products/gift-mouse">Chuột không dây</a> (trị giá 360.000đ)</p>
              <p>[Laptop] Giảm 1% tối đa 500k cho HSSV khi mua laptop</p>
              <button>Xem thêm 1 ưu đãi</button>
            </section>
            """,
            "html.parser",
        )

        self.assertIn("Hiệu năng ổn định", extract_product_description(soup))
        self.assertEqual(
            extract_product_description_images(soup),
            [{
                "ProductDescriptionImageURL": "https://cdn.example.com/feature.jpg",
                "ProductDescriptionImageAlt": "Ảnh tính năng",
            }],
        )
        self.assertEqual(
            extract_product_promotions(soup),
            [
                {
                    "ProductPromotionType": "Gift",
                    "ProductPromotionTitle": "Tặng ngay 1 x Chuột không dây (trị giá 360.000đ)",
                    "ProductPromotionGiftQuantity": 1,
                    "ProductPromotionGiftProductName": "Chuột không dây",
                    "ProductPromotionGiftProductURL": "https://gearvn.com/products/gift-mouse",
                    "ProductPromotionGiftValueVND": 360000,
                },
                {
                    "ProductPromotionType": "Discount",
                    "ProductPromotionTitle": "[Laptop] Giảm 1% tối đa 500k cho HSSV khi mua laptop",
                    "ProductPromotionDiscountText": "[Laptop] Giảm 1% tối đa 500k cho HSSV khi mua laptop",
                    "ProductPromotionScope": "Laptop",
                },
            ],
        )

    def test_rejects_product_url_as_collection_context(self):
        self.assertFalse(
            product_matches_collection(
                BeautifulSoup("", "html.parser"),
                "https://gearvn.com/products/example-product",
            )
        )

    def test_rejects_wrong_collection_category_or_brand(self):
        soup = BeautifulSoup(
            """
            <script type="application/ld+json">
              {
                "@type":"Product",
                "category":"Laptop Gaming",
                "brand":{"@type":"Brand","name":"Acer"}
              }
            </script>
            """,
            "html.parser",
        )

        self.assertFalse(
            product_matches_collection(
                soup,
                "https://gearvn.com/collections/laptop-office-acer?page=1",
            )
        )
        self.assertFalse(
            product_matches_collection(
                soup,
                "https://gearvn.com/collections/laptop-gaming-razer?page=1",
            )
        )


if __name__ == "__main__":
    unittest.main()
