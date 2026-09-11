import unittest

from bs4 import BeautifulSoup

from scraper_paths import (
    collect_product_links,
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
