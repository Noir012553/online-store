import os
import os
from pathlib import Path


PRODUCT_OUTPUT_FIELDS = (
    "Brand", "ID", "Name", "SKU", "Price_VND", "Regular_Price", "InStock",
    "Categories", "Attributes", "Description", "MainImage", "GalleryImages", "URL",
)


def get_output_directory():
    project_root = Path(__file__).resolve().parent.parent
    configured_output = os.getenv("SCRAPER_OUTPUT_DIR")

    if configured_output:
        output_dir = Path(configured_output).expanduser()
        if not output_dir.is_absolute():
            output_dir = project_root / output_dir
    else:
        output_dir = project_root / "data" / "scraped-products"

    return output_dir.resolve()


def get_output_paths(file_prefix):
    output_dir = get_output_directory()
    output_dir.mkdir(parents=True, exist_ok=True)
    return (
        output_dir / f"{file_prefix}.csv",
        output_dir / f"{file_prefix}.json",
    )
