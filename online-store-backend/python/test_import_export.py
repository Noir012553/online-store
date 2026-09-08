import argparse
import asyncio
import csv
import io
import json
import os
import sys
import time
import zipfile
from pathlib import Path
from playwright.async_api import Error as PlaywrightError
from playwright.async_api import async_playwright


DEFAULT_URLS = {
    "production": {
        "frontend": "https://manln.online",
        "backend": "https://backend.manln.online",
    },
    "local": {
        "frontend": "http://127.0.0.1:3000",
        "backend": "http://127.0.0.1:5000",
    },
}

REQUIRED_FIELDS = (
    "name",
    "brand",
    "price",
    "category",
    "baseCurrencyCode",
    "image",
    "description",
    "countInStock",
    "specs",
)


class FlowFailure(RuntimeError):
    pass


def parse_args():
    parser = argparse.ArgumentParser(
        description="Dynamic Playwright smoke test for product export and ZIP import"
    )
    parser.add_argument("--environment", choices=("production", "local"), default="production")
    parser.add_argument("--target", choices=("frontend", "backend"), default="backend")
    parser.add_argument("--base-url")
    parser.add_argument("--frontend-base-url")
    parser.add_argument("--backend-base-url")
    parser.add_argument("--import-file", type=Path, help="Use an existing ZIP instead of exporting first")
    parser.add_argument("--category")
    parser.add_argument("--brand")
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--locale", default="vi")
    parser.add_argument("--format", choices=("json", "csv"), default="json")
    parser.add_argument("--mode", choices=("insert", "update", "upsert"), default="upsert")
    parser.add_argument("--commit-import", action="store_true", help="Write imported products; default is dry-run")
    parser.add_argument("--max-wait-minutes", type=float, default=30)
    parser.add_argument("--request-timeout-seconds", type=float, default=120)
    parser.add_argument("--poll-interval-seconds", type=float, default=5)
    parser.add_argument("--email-env", default="EXPORT_TEST_EMAIL")
    parser.add_argument("--password-env", default="EXPORT_TEST_PASSWORD")
    parser.add_argument("--report", type=Path)
    parser.add_argument("--zip-output", type=Path)
    return parser.parse_args()


def safe_json(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, default=str)


async def response_body(response):
    try:
        return await response.json()
    except (ValueError, PlaywrightError):
        return {"raw": (await response.text())[:2000]}


def resolve_base_url(args):
    target_urls = {
        "frontend": args.frontend_base_url
        or os.environ.get("EXPORT_FRONTEND_BASE_URL")
        or DEFAULT_URLS[args.environment]["frontend"],
        "backend": args.backend_base_url
        or os.environ.get("EXPORT_BACKEND_BASE_URL")
        or DEFAULT_URLS[args.environment]["backend"],
    }
    return (args.base_url or target_urls[args.target]).rstrip("/")


def validate_zip(zip_bytes, content_format):
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as archive:
        names = archive.namelist()
        data_names = [name for name in names if name in {"products.json", "products.csv"}]
        if len(data_names) != 1:
            raise FlowFailure(f"ZIP_DATA_ENTRY_INVALID: {data_names}")
        data_name = data_names[0]
        expected_name = f"products.{content_format}"
        if data_name != expected_name:
            raise FlowFailure(f"ZIP_FORMAT_MISMATCH: expected {expected_name}, got {data_name}")

        if content_format == "json":
            payload = json.loads(archive.read(data_name).decode("utf-8"))
            products = payload.get("products") if isinstance(payload, dict) else payload
        else:
            rows = list(csv.DictReader(io.StringIO(archive.read(data_name).decode("utf-8-sig"))))
            products = rows

        if not isinstance(products, list) or not products:
            raise FlowFailure("ZIP_PRODUCTS_EMPTY")

        missing = []
        for index, product in enumerate(products, start=1):
            fields = [
                field
                for field in REQUIRED_FIELDS
                if field != "specs" and (field not in product or product[field] in (None, ""))
            ]
            if content_format == "csv":
                spec_columns = [key for key in product if key.startswith("specs_")]
                if not any(product.get(key) not in (None, "") for key in spec_columns):
                    fields.append("specs")
            elif not isinstance(product.get("specs"), dict) or not product["specs"]:
                fields.append("specs")
            if fields:
                missing.append({"row": index, "fields": sorted(set(fields))})

        if missing:
            raise FlowFailure(f"ZIP_REQUIRED_FIELDS_MISSING: {safe_json(missing[:10])}")

        return {
            "entryCount": len(names),
            "dataEntry": data_name,
            "productCount": len(products),
            "imageEntryCount": sum(name.startswith("assets/images/") for name in names),
        }


async def login(request, email, password):
    response = await request.post("/api/users/login", data={"email": email, "password": password})
    body = await response_body(response)
    print(f"[login] HTTP {response.status}")
    if response.status != 200:
        raise FlowFailure(f"LOGIN_FAILED_{response.status}: {safe_json(body)}")
    token = body.get("accessToken") or body.get("token")
    if not token:
        raise FlowFailure("LOGIN_TOKEN_MISSING")
    return {"Authorization": f"Bearer {token}"}


async def export_zip(request, headers, args, deadline):
    params = {
        "format": args.format,
        "locales": args.locale,
        "limit": str(args.limit),
        "async": "true",
    }
    if args.category and args.category != "all":
        params["category"] = args.category
    if args.brand and args.brand != "all":
        params["brand"] = args.brand

    response = await request.get(
        "/api/products/admin/export-bundle",
        params=params,
        headers=headers,
    )
    body = await response_body(response)
    print(f"[export enqueue] HTTP {response.status}")
    if response.status != 202:
        raise FlowFailure(f"EXPORT_ENQUEUE_FAILED_{response.status}: {safe_json(body)}")

    job_id = body.get("jobId")
    if not job_id:
        raise FlowFailure("EXPORT_JOB_ID_MISSING")

    job = body
    previous_status = None
    while time.monotonic() < deadline:
        status_response = await request.get(
            f"/api/products/admin/export-jobs/{job_id}",
            headers=headers,
        )
        status_body = await response_body(status_response)
        if status_response.status != 200:
            print(f"[export poll] HTTP {status_response.status}")
            await asyncio.sleep(args.poll_interval_seconds)
            continue

        job = status_body.get("job", status_body)
        status = job.get("status")
        if status != previous_status:
            print(f"[export poll] status={status}")
            previous_status = status
        if status == "ready":
            break
        if status in {"failed", "cancelled"}:
            raise FlowFailure(f"EXPORT_JOB_{status.upper()}: {job.get('errorMessage')}")
        await asyncio.sleep(args.poll_interval_seconds)
    else:
        raise FlowFailure("EXPORT_JOB_TIMEOUT")

    download_url = job.get("downloadUrl") or f"/api/products/admin/export-jobs/{job_id}/download"
    download_response = await request.get(download_url, headers=headers)
    print(f"[export download] HTTP {download_response.status}")
    if download_response.status != 200:
        body = await response_body(download_response)
        raise FlowFailure(f"EXPORT_DOWNLOAD_FAILED_{download_response.status}: {safe_json(body)}")

    zip_bytes = await download_response.body()
    return zip_bytes, {"jobId": job_id, "status": job.get("status")}


async def import_zip(request, headers, zip_bytes, args):
    multipart = {
        "file": {
            "name": "products-export.zip",
            "mimeType": "application/zip",
            "buffer": zip_bytes,
        },
        "mode": args.mode,
        "dryRun": "false" if args.commit_import else "true",
    }
    response = await request.post(
        f"/api/products/admin/import-file?lang={args.locale}",
        headers=headers,
        multipart=multipart,
    )
    body = await response_body(response)
    print(f"[import {'commit' if args.commit_import else 'dry-run'}] HTTP {response.status}")
    if response.status < 200 or response.status >= 300 or not body.get("success"):
        raise FlowFailure(f"IMPORT_FAILED_{response.status}: {safe_json(body)}")
    return body


async def run(args):
    email = os.environ.get(args.email_env)
    password = os.environ.get(args.password_env)
    if not email or not password:
        raise FlowFailure(f"Set {args.email_env} and {args.password_env} before running the test")
    if args.limit < 1 or args.limit > 10000:
        raise FlowFailure("--limit must be between 1 and 10000")

    base_url = resolve_base_url(args)
    timeout_ms = int(args.request_timeout_seconds * 1000)
    deadline = time.monotonic() + args.max_wait_minutes * 60
    report = {
        "target": base_url,
        "environment": args.environment,
        "format": args.format,
        "mode": args.mode,
        "dryRun": not args.commit_import,
        "events": [],
    }

    async with async_playwright() as playwright:
        request = await playwright.request.new_context(base_url=base_url, timeout=timeout_ms)
        try:
            headers = await login(request, email, password)
            report["events"].append({"event": "login", "status": 200})

            if args.import_file:
                zip_bytes = args.import_file.read_bytes()
                export_info = {"source": str(args.import_file)}
            else:
                zip_bytes, export_info = await export_zip(request, headers, args, deadline)
                if args.zip_output:
                    args.zip_output.parent.mkdir(parents=True, exist_ok=True)
                    args.zip_output.write_bytes(zip_bytes)
                    print(f"[zip output] {args.zip_output}")
            report["export"] = export_info

            zip_info = validate_zip(zip_bytes, args.format)
            report["zip"] = zip_info
            print(f"[zip validate] entries={zip_info['entryCount']} products={zip_info['productCount']} images={zip_info['imageEntryCount']}")

            import_result = await import_zip(request, headers, zip_bytes, args)
            report["import"] = {
                "success": import_result.get("success"),
                "dryRun": import_result.get("dryRun"),
                "totalProducts": import_result.get("totalProducts"),
                "results": import_result.get("results"),
                "errors": import_result.get("errors", []),
            }
            return report
        finally:
            await request.dispose()


def write_report(path, report):
    if not path:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[report] {path}")


async def main():
    args = parse_args()
    try:
        report = await run(args)
        write_report(args.report, report)
        print("[FINAL RESULT] PASS")
        return 0
    except (FlowFailure, PlaywrightError) as error:
        print(f"[FINAL RESULT] FAIL\n[ERROR] {error}")
        return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
