"""Production export diagnostics using Playwright's async HTTP client."""

import argparse
import asyncio
import json
import os
import sys
import time
import zipfile
from io import BytesIO
from pathlib import Path
from urllib.parse import urljoin

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

IMAGE_SIGNATURES = {
    ".jpg": lambda data: data[:3] == b"\xff\xd8\xff",
    ".jpeg": lambda data: data[:3] == b"\xff\xd8\xff",
    ".png": lambda data: data[:8] == b"\x89PNG\r\n\x1a\n",
    ".gif": lambda data: data[:6] in {b"GIF87a", b"GIF89a"},
    ".webp": lambda data: data[:4] == b"RIFF" and data[8:12] == b"WEBP",
    ".avif": lambda data: data[4:8] == b"ftyp" and data[8:12] in {b"avif", b"avis"},
}


def parse_args():
    parser = argparse.ArgumentParser(description="Check product export with Python Playwright")
    parser.add_argument("--environment", choices=("production", "local"), default="production")
    parser.add_argument("--target", choices=("frontend", "backend"), default="backend")
    parser.add_argument("--base-url", help="Override the selected target URL")
    parser.add_argument("--frontend-base-url", help="Override frontend URL")
    parser.add_argument("--backend-base-url", help="Override backend URL")
    parser.add_argument("--category")
    parser.add_argument("--brand")
    parser.add_argument("--limit", type=int, default=100)
    parser.add_argument("--locale", default="vi")
    parser.add_argument("--format", choices=("json", "csv"), default="json")
    parser.add_argument("--max-wait-minutes", type=float, default=30)
    parser.add_argument("--request-timeout-seconds", type=float, default=120)
    parser.add_argument("--email-env", default="EXPORT_TEST_EMAIL")
    parser.add_argument("--password-env", default="EXPORT_TEST_PASSWORD")
    parser.add_argument("--report", type=Path)
    parser.add_argument("--zip-output", type=Path)
    return parser.parse_args()


def safe_json(value):
    try:
        return json.dumps(value, ensure_ascii=False, sort_keys=True)
    except TypeError:
        return str(value)


def image_signature_is_valid(name, data):
    suffix = Path(name).suffix.lower()
    validator = IMAGE_SIGNATURES.get(suffix)
    return validator(data) if validator else True


def validate_zip(payload, headers):
    result = {
        "ok": False,
        "bytes": len(payload),
        "contentLengthHeader": headers.get("content-length", ""),
        "contentLengthMatches": headers.get("content-length", "").isdigit()
        and int(headers["content-length"]) == len(payload),
        "productCount": 0,
        "imageReferences": 0,
        "referencesWithAssetPath": 0,
        "referencesWithoutAssetPath": 0,
        "imageEntryCount": 0,
        "emptyImageEntryCount": 0,
        "invalidImageEntryCount": 0,
        "missingAssetPaths": [],
        "translationLocales": [],
        "zipError": None,
    }

    try:
        with zipfile.ZipFile(BytesIO(payload)) as archive:
            bad_entry = archive.testzip()
            if bad_entry:
                result["zipError"] = f"ZIP_CRC_INVALID:{bad_entry}"
                return result

            names = archive.namelist()
            if "products.json" not in names:
                result["zipError"] = "PRODUCTS_JSON_MISSING"
                return result

            products = json.loads(archive.read("products.json").decode("utf-8"))
            products = products.get("products", []) if isinstance(products, dict) else []
            result["productCount"] = len(products)

            referenced_assets = set()
            for product in products:
                translations = product.get("translations", {})
                if isinstance(translations, dict):
                    result["translationLocales"].extend(translations.keys())

                image_asset_paths = product.get("imageAssetPaths", [])
                if isinstance(image_asset_paths, list):
                    referenced_assets.update(
                        path for path in image_asset_paths if isinstance(path, str) and path
                    )

                images = product.get("images", [])
                if not isinstance(images, list):
                    continue
                for image in images:
                    if not isinstance(image, dict) or not image.get("url"):
                        continue
                    result["imageReferences"] += 1
                    asset_path = image.get("assetPath")
                    if asset_path:
                        result["referencesWithAssetPath"] += 1
                        referenced_assets.add(asset_path)
                    else:
                        result["referencesWithoutAssetPath"] += 1

            image_names = [name for name in names if name.startswith("assets/images/")]
            result["imageEntryCount"] = len(image_names)
            for name in image_names:
                data = archive.read(name)
                if not data:
                    result["emptyImageEntryCount"] += 1
                elif not image_signature_is_valid(name, data):
                    result["invalidImageEntryCount"] += 1

            result["missingAssetPaths"] = sorted(
                asset_path for asset_path in referenced_assets if asset_path not in names
            )
            result["translationLocales"] = sorted(set(result["translationLocales"]))
            result["ok"] = not result["zipError"] and not result["missingAssetPaths"] and not result[
                "emptyImageEntryCount"
            ] and not result["invalidImageEntryCount"]
    except (OSError, ValueError, KeyError, zipfile.BadZipFile, json.JSONDecodeError) as error:
        result["zipError"] = f"{type(error).__name__}:{error}"

    return result


async def read_response_body(response):
    try:
        return await response.json()
    except (ValueError, PlaywrightError):
        return {"raw": (await response.text())[:2000]}


async def run_check(args):
    target_urls = {
        "frontend": args.frontend_base_url
        or os.environ.get("EXPORT_FRONTEND_BASE_URL")
        or DEFAULT_URLS[args.environment]["frontend"],
        "backend": args.backend_base_url
        or os.environ.get("EXPORT_BACKEND_BASE_URL")
        or DEFAULT_URLS[args.environment]["backend"],
    }
    base_url = args.base_url or target_urls[args.target]
    email = os.environ.get(args.email_env)
    password = os.environ.get(args.password_env)
    if not email or not password:
        raise RuntimeError("Set EXPORT_TEST_EMAIL and EXPORT_TEST_PASSWORD before running the check")
    if args.limit < 1 or args.limit > 10000:
        raise RuntimeError("--limit must be between 1 and 10000")

    timeout_ms = int(args.request_timeout_seconds * 1000)
    deadline = time.monotonic() + args.max_wait_minutes * 60
    report = {
        "target": base_url,
        "environment": args.environment,
        "limit": args.limit,
        "locale": args.locale,
        "format": args.format,
        "category": args.category,
        "brand": args.brand,
        "events": [],
        "result": None,
    }

    async with async_playwright() as playwright:
        request = await playwright.request.new_context(base_url=base_url, timeout=timeout_ms)
        try:
            started_at = time.monotonic()
            login_response = await request.post("/api/users/login", data={"email": email, "password": password})
            login_body = await read_response_body(login_response)
            report["events"].append({
                "event": "login",
                "status": login_response.status,
                "elapsedMs": round((time.monotonic() - started_at) * 1000),
            })
            if login_response.status != 200:
                raise RuntimeError(f"LOGIN_FAILED_{login_response.status}: {safe_json(login_body)}")

            token = login_body.get("accessToken") or login_body.get("token")
            if not token:
                raise RuntimeError("LOGIN_TOKEN_MISSING")

            headers = {"Authorization": f"Bearer {token}"}
            export_params = {
                "format": args.format,
                "locales": args.locale,
                "limit": str(args.limit),
                "async": "true",
            }
            if args.category and args.category != "all":
                export_params["category"] = args.category
            if args.brand and args.brand != "all":
                export_params["brand"] = args.brand
            started_at = time.monotonic()
            enqueue_response = await request.get(
                "/api/products/admin/export-bundle",
                params=export_params,
                headers=headers,
            )
            enqueue_body = await read_response_body(enqueue_response)
            report["events"].append({
                "event": "enqueue",
                "status": enqueue_response.status,
                "elapsedMs": round((time.monotonic() - started_at) * 1000),
            })
            if enqueue_response.status != 202:
                raise RuntimeError(
                    f"ENQUEUE_FAILED_{enqueue_response.status}: {safe_json(enqueue_body)}"
                )

            job_id = enqueue_body.get("jobId")
            if not job_id:
                raise RuntimeError("ASYNC_JOB_ID_MISSING")

            job = None
            while time.monotonic() < deadline:
                poll_started_at = time.monotonic()
                try:
                    status_response = await request.get(
                        f"/api/products/admin/export-jobs/{job_id}",
                        headers=headers,
                    )
                    status_body = await read_response_body(status_response)
                    event = {
                        "event": "poll",
                        "status": status_response.status,
                        "elapsedMs": round((time.monotonic() - poll_started_at) * 1000),
                    }
                    report["events"].append(event)
                    if status_response.status != 200:
                        print(f"[POLL {status_response.status}] {safe_json(status_body)[:500]}")
                        await asyncio.sleep(5)
                        continue
                    job = status_body.get("job", status_body)
                    event["jobStatus"] = job.get("status")
                    event["attempts"] = job.get("attempts")
                    print(f"[JOB {job.get('status')}] attempts={job.get('attempts')}")
                    if job.get("status") == "ready":
                        break
                    if job.get("status") in {"failed", "cancelled"}:
                        raise RuntimeError(f"ASYNC_JOB_{job['status'].upper()}: {job.get('errorMessage')}")
                except PlaywrightError as error:
                    report["events"].append({
                        "event": "poll_transport_error",
                        "error": str(error).split("\nCall log:")[0],
                    })
                    print(f"[POLL TRANSPORT ERROR] {report['events'][-1]['error']}")
                await asyncio.sleep(5)

            if not job or job.get("status") != "ready":
                raise RuntimeError("ASYNC_JOB_TIMEOUT_OR_STATUS_UNAVAILABLE")

            download_url = job.get("downloadUrl") or f"/api/products/admin/export-jobs/{job_id}/download"
            download_started_at = time.monotonic()
            download_response = await request.get(urljoin(base_url, download_url), headers=headers, timeout=int(args.max_wait_minutes * 60 * 1000))
            download_elapsed_ms = round((time.monotonic() - download_started_at) * 1000)
            report["events"].append({
                "event": "download",
                "status": download_response.status,
                "elapsedMs": download_elapsed_ms,
            })
            if download_response.status != 200:
                body = await read_response_body(download_response)
                raise RuntimeError(f"DOWNLOAD_FAILED_{download_response.status}: {safe_json(body)}")

            payload = await download_response.body()
            if args.zip_output:
                args.zip_output.parent.mkdir(parents=True, exist_ok=True)
                args.zip_output.write_bytes(payload)
            zip_result = validate_zip(payload, download_response.headers)
            report["result"] = {
                "jobId": job_id,
                "job": job,
                "zip": zip_result,
            }
            if not zip_result["ok"]:
                raise RuntimeError(f"ZIP_INVALID: {safe_json(zip_result)}")
            return report
        finally:
            await request.dispose()


def print_report(report):
    print("[TARGET]", report["target"])
    print("[RESULT]", safe_json(report.get("result")))
    for event in report["events"]:
        print("[EVENT]", safe_json(event))


async def main():
    args = parse_args()
    try:
        report = await run_check(args)
        print_report(report)
        if args.report:
            args.report.parent.mkdir(parents=True, exist_ok=True)
            args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print("[FINAL RESULT] PASS")
        return 0
    except (RuntimeError, PlaywrightError) as error:
        print(f"[FINAL RESULT] FAIL\n[ERROR] {error}")
        return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
