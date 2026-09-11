import json
import unittest
from unittest.mock import Mock, patch

from bs4 import BeautifulSoup

from scraper_runner import (
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
            "https://gearvn.com/products/a": {"URL": "https://gearvn.com/products/a", "SKU": "A"},
            "https://gearvn.com/products/b": {"URL": "https://gearvn.com/products/b", "SKU": "B"},
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

    def test_deduplicates_by_url_and_sku(self):
        records = [
            {"URL": "https://gearvn.com/products/a/", "SKU": "A"},
            {"URL": "https://gearvn.com/products/a", "SKU": "A-OTHER"},
            {"URL": "https://gearvn.com/products/b", "SKU": "A"},
            {"URL": "https://gearvn.com/products/c", "SKU": "C"},
        ]

        result = deduplicate_records(records)

        self.assertEqual([record["URL"] for record in result], [
            "https://gearvn.com/products/a",
            "https://gearvn.com/products/c",
        ])


if __name__ == "__main__":
    unittest.main()
