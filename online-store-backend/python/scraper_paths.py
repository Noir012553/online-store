import os
from pathlib import Path


def get_output_directory():
    project_root = Path(os.getenv("SCRAPER_PROJECT_ROOT", Path.cwd())).expanduser().resolve()
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
