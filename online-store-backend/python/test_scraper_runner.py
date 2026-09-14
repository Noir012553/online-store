import json
import unittest
from unittest.mock import Mock, patch

from bs4 import BeautifulSoup

from scraper_paths import PRODUCT_OUTPUT_FIELDS
from scraper_runner import (
    _product_record,
    build_staging_records,
    deduplicate_records,
    extract_product_json_ld,
    fetch_html,
    get_max_workers,
    scrape_products,
)


class ScraperRunnerTest(unittest.TestCase):
    def test_fetch_html_retries_rate_limit_and_succeeds(self):
        retry = Mock(status_code=429)
        success = Mock(status_code=200, text="<html></html>")
        with patch("scraper_runner._request_get", side_effect=[retry, success]) as request:
            with patch("scraper_runner.time.sleep") as sleep:
                response = fetch_html("https://gearvn.com/products/example")

        self.assertIs(response, success)
        self.assertEqual(request.call_count, 2)
        sleep.assert_called_once_with(1)

    def test_fetch_html_does_not_retry_client_errors(self):
        response = Mock(status_code=404)
        with patch("scraper_runner._request_get", return_value=response) as request:
            with patch("scraper_runner.time.sleep") as sleep:
                self.assertIsNone(fetch_html("https://gearvn.com/products/missing"))

        request.assert_called_once()
        sleep.assert_not_called()

    def test_limits_configured_worker_count(self):
        with patch.dict("os.environ", {"SCRAPER_MAX_WORKERS": "99"}):
            self.assertEqual(get_max_workers(), 8)
        with patch.dict("os.environ", {"SCRAPER_MAX_WORKERS": "invalid"}):
            self.assertEqual(get_max_workers(), 4)

    def test_scrapes_products_concurrently_and_preserves_input_order(self):
        records = {
            "https://gearvn.com/products/a": {"ProductURL": "https://gearvn.com/products/a", "ProductSKU": "A"},
            "https://gearvn.com/products/b": {"ProductURL": "https://gearvn.com/products/b", "ProductSKU": "B"},
        }

        with patch("scraper_runner._scrape_product", side_effect=lambda url, brand, categories: (url, records[url])) as scrape:
            result, failed = scrape_products(list(records), "Brand", "Category", max_workers=2)

        self.assertEqual(result, list(records.values()))
        self.assertEqual(failed, [])
        self.assertEqual(scrape.call_count, 2)

    def test_extracts_product_from_multiple_json_ld_shapes(self):
        soup = BeautifulSoup(
            """
            <script type="application/ld+json">{"@graph":[{"@type":"BreadcrumbList"}]}</script>
            <script type="application/ld+json">
              [{"@type":"Product","name":"Example","offers":[{"price":"1000"}]}]
            </script>
            """,
            "html.parser",
        )

        product = extract_product_json_ld(soup)

        self.assertEqual(product["name"], "Example")
        self.assertEqual(product["offers"][0]["price"], "1000")

    def test_builds_product_record_with_the_canonical_schema(self):
        soup = BeautifulSoup(
            """
            <h1>Example Product</h1>
            <script type="application/ld+json">
              {"@type":"Product","sku":"SKU-1","offers":{"price":"1000","availability":"https://schema.org/InStock"}}
            </script>
            <section><h2>Thông tin sản phẩm</h2><div class="news-html-content"><p>Mô tả sản phẩm</p></div></section>
            """,
            "html.parser",
        )

        record = _product_record(soup, "https://gearvn.com/products/example", "Brand", "Category")

        self.assertEqual(set(record), set(PRODUCT_OUTPUT_FIELDS))
        self.assertEqual(record["ProductName"], "Example Product")
        self.assertEqual(record["ProductTechnicalDescription"], "Thông số: {}")
        self.assertEqual(record["ProductDescription"], "Mô tả sản phẩm")
        self.assertEqual(record["ProductPromotions"], [])

    def test_builds_staging_records_without_changing_canonical_product_data(self):
        product_data = {
            "ProductName": "Example Product",
            "ProductURL": "https://gearvn.com/products/example",
        }

        records = build_staging_records(
            [product_data],
            "20260315T101530Z",
            "2026-03-15T10:15:30Z",
            "product-v2",
        )

        self.assertEqual(records, [{
            "ScrapeSource": "gearvn",
            "ScrapeURL": "https://gearvn.com/products/example",
            "ScrapeRunID": "20260315T101530Z",
            "ScrapeCapturedAt": "2026-03-15T10:15:30Z",
            "ScrapeParserVersion": "product-v2",
            "ProductData": product_data,
        }])
        self.assertEqual(product_data, {
            "ProductName": "Example Product",
            "ProductURL": "https://gearvn.com/products/example",
        })

    def test_deduplicates_by_url_and_sku(self):
        records = [
            {"ProductURL": "https://gearvn.com/products/a/", "ProductSKU": "A"},
            {"ProductURL": "https://gearvn.com/products/a", "ProductSKU": "A-OTHER"},
            {"ProductURL": "https://gearvn.com/products/b", "ProductSKU": "A"},
            {"ProductURL": "https://gearvn.com/products/c", "ProductSKU": "C"},
        ]

        result = deduplicate_records(records)

        self.assertEqual([record["ProductURL"] for record in result], [
            "https://gearvn.com/products/a",
            "https://gearvn.com/products/c",
        ])


if __name__ == "__main__":
    unittest.main()
