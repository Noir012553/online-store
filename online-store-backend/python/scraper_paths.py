from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SCRAPER_OUTPUT_DIR = PROJECT_ROOT / "data" / "scraped-products"


def get_output_paths(file_prefix):
    SCRAPER_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    return (
        SCRAPER_OUTPUT_DIR / f"{file_prefix}.csv",
        SCRAPER_OUTPUT_DIR / f"{file_prefix}.json",
    )
