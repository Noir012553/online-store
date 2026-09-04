import argparse
import asyncio
import csv
import json
import os
import re
import sys
import tempfile
import time
import zipfile
from pathlib import Path
from urllib.parse import urljoin, urlparse

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
    ".svg": lambda data: (
        b"<svg" in data[:1024].lstrip().lower()
        or (data[:1024].lstrip().lower().startswith(b"<?xml") and b"<svg" in data[:1024].lower())
    ),
}

TUNNEL_MARKERS = (
    "timeout: no recent network activity",
    "failed to accept quic stream",
    "connection terminated",
    "context canceled",
    "application error 0x0",
    "unable to reach the origin service",
)


class ExportTestFailure(RuntimeError):
    def __init__(self, message, report):
        super().__init__(message)
        self.report = report


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
    parser.add_argument("--poll-interval-seconds", type=float, default=5)
    parser.add_argument("--email-env", default="EXPORT_TEST_EMAIL")
    parser.add_argument("--password-env", default="EXPORT_TEST_PASSWORD")
    parser.add_argument("--tunnel-log", type=Path, help="Optional cloudflared log to scan for transport errors")
    parser.add_argument("--report", type=Path)
    parser.add_argument("--zip-output", type=Path)
    return parser.parse_args()


def safe_json(value):
    try:
        text = json.dumps(value, ensure_ascii=False, sort_keys=True)
    except TypeError:
        text = str(value)
    text = re.sub(r"Bearer\s+\S+", "Bearer [REDACTED]", text, flags=re.IGNORECASE)
    return re.sub(r"\beyJ[a-zA-Z0-9._-]+\b", "[REDACTED]", text)


def image_signature_is_valid(name, data):
    suffix = Path(name).suffix.lower()
    validator = IMAGE_SIGNATURES.get(suffix)
    return validator(data) if validator else False


def redact_url(value):
    parsed = urlparse(value)
    hostname = parsed.hostname or ""
    if ":" in hostname and not hostname.startswith("["):
        hostname = f"[{hostname}]"
    try:
        port = f":{parsed.port}" if parsed.port else ""
    except ValueError:
        port = ""
    return parsed._replace(netloc=f"{hostname}{port}", query="", fragment="").geturl()


def safe_job(job):
    sanitized = dict(job or {})
    if sanitized.get("downloadUrl"):
        sanitized["downloadUrl"] = redact_url(sanitized["downloadUrl"])
    return sanitized


def validate_zip(zip_path, headers, content_format):
    content_length = headers.get("content-length", "")
    content_length_matches = (
        int(content_length) == zip_path.stat().st_size if content_length.isdigit() else None
    )
    result = {
        "ok": False,
        "bytes": zip_path.stat().st_size,
        "contentLengthHeader": content_length,
        "contentLengthMatches": content_length_matches,
        "contentFormat": content_format,
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
        with zipfile.ZipFile(zip_path) as archive:
            bad_entry = archive.testzip()
            if bad_entry:
                result["zipError"] = f"ZIP_CRC_INVALID:{bad_entry}"
                return result

            names = archive.namelist()
            products = []
            if content_format == "json":
                if "products.json" not in names:
                    result["zipError"] = "PRODUCTS_JSON_MISSING"
                    return result
                parsed_products = json.loads(archive.read("products.json").decode("utf-8"))
                if not isinstance(parsed_products, dict) or not isinstance(parsed_products.get("products"), list):
                    result["zipError"] = "PRODUCTS_JSON_INVALID"
                    return result
                products = parsed_products["products"]
            else:
                if "products.csv" not in names:
                    result["zipError"] = "PRODUCTS_CSV_MISSING"
                else:
                    csv_data = archive.read("products.csv").decode("utf-8-sig")
                    rows = list(csv.reader(csv_data.splitlines()))
                    if not rows or not any(cell.strip() for cell in rows[0]):
                        result["zipError"] = "PRODUCTS_CSV_INVALID"
                    result["productCount"] = max(0, len(rows) - 1)
            result["productCount"] = len(products) if content_format == "json" else result["productCount"]

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
            result["ok"] = (
                result["contentLengthMatches"] is not False
                and not result["zipError"]
                and not result["missingAssetPaths"]
                and not result["emptyImageEntryCount"]
                and not result["invalidImageEntryCount"]
            )
    except (OSError, ValueError, KeyError, zipfile.BadZipFile, json.JSONDecodeError) as error:
        result["zipError"] = f"{type(error).__name__}:{error}"

    return result


def scan_tunnel_log(log_path):
    if not log_path:
        return None
    if not log_path.exists():
        return {"path": str(log_path), "error": "TUNNEL_LOG_NOT_FOUND"}

    counts = {marker: 0 for marker in TUNNEL_MARKERS}
    try:
        for line in log_path.read_text(encoding="utf-8", errors="replace").splitlines():
            lowered = line.lower()
            for marker in TUNNEL_MARKERS:
                if marker in lowered:
                    counts[marker] += 1
    except OSError as error:
        return {"path": str(log_path), "error": f"TUNNEL_LOG_READ_FAILED:{error}"}

    return {
        "path": str(log_path),
        "markers": {marker: count for marker, count in counts.items() if count},
        "totalMatches": sum(counts.values()),
    }


def origin_matches(base_url, candidate_url):
    base = urlparse(base_url)
    candidate = urlparse(candidate_url)
    return (base.scheme, base.netloc) == (candidate.scheme, candidate.netloc)


async def read_response_body(response):
    try:
        return await response.json()
    except (ValueError, PlaywrightError):
        return {"raw": (await response.text())[:2000]}


async def cancel_job(request, headers, base_url, job_id, report):
    try:
        response = await request.post(
            f"/api/products/admin/export-jobs/{job_id}/cancel",
            headers=headers,
        )
        report["events"].append({"event": "cancel", "status": response.status})
        print(f"[cancel] HTTP {response.status}")
    except PlaywrightError as error:
        report["events"].append({"event": "cancel_transport_error", "error": str(error).split("\nCall log:")[0]})
        print(f"[cancel] transport error: {report['events'][-1]['error']}")


async def download_zip(playwright, base_url, headers, download_url, output_path, timeout_ms, report):
    browser = await playwright.chromium.launch(headless=True)
    download_headers = {}
    download_status = None
    request_headers = headers if origin_matches(base_url, download_url) else {}
    context = None
    page = None
    response_holder = {}

    def remember_response(response):
        if response.request.method == "GET":
            response_holder["response"] = response

    try:
        context = await browser.new_context(extra_http_headers=request_headers, accept_downloads=True)
        page = await context.new_page()
        page.on("response", remember_response)
        async with page.expect_download(timeout=timeout_ms) as download_info:
            try:
                await page.goto(download_url, wait_until="commit", timeout=timeout_ms)
            except PlaywrightError as error:
                if "Download is starting" not in str(error):
                    raise
        download = await download_info.value
        await download.save_as(str(output_path))
        response = response_holder.get("response")
        if not response:
            raise RuntimeError("DOWNLOAD_RESPONSE_NOT_OBSERVED")
        download_status = response.status
        download_headers = await response.all_headers()
    finally:
        if page:
            page.remove_listener("response", remember_response)
        if context:
            await context.close()
        await browser.close()

    if download_status != 200:
        raise RuntimeError(f"DOWNLOAD_FAILED_{download_status}")

    report["events"].append({
        "event": "download",
        "status": download_status,
        "contentLength": download_headers.get("content-length", ""),
        "bytes": output_path.stat().st_size,
    })
    return download_headers


async def run_check(args):
    target_urls = {
        "frontend": args.frontend_base_url
        or os.environ.get("EXPORT_FRONTEND_BASE_URL")
        or DEFAULT_URLS[args.environment]["frontend"],
        "backend": args.backend_base_url
        or os.environ.get("EXPORT_BACKEND_BASE_URL")
        or DEFAULT_URLS[args.environment]["backend"],
    }
    base_url = (args.base_url or target_urls[args.target]).rstrip("/")
    email = os.environ.get(args.email_env)
    password = os.environ.get(args.password_env)
    if not email or not password:
        raise RuntimeError(f"Set {args.email_env} and {args.password_env} before running the check")
    if args.limit < 1 or args.limit > 10000:
        raise RuntimeError("--limit must be between 1 and 10000")
    if args.max_wait_minutes <= 0 or args.poll_interval_seconds <= 0:
        raise RuntimeError("Wait and poll intervals must be greater than zero")

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
        "tunnel": None,
    }

    async with async_playwright() as playwright:
        request = await playwright.request.new_context(base_url=base_url, timeout=timeout_ms)
        token = None
        job_id = None
        job = None
        try:
            started_at = time.monotonic()
            login_response = await request.post("/api/users/login", data={"email": email, "password": password})
            login_body = await read_response_body(login_response)
            report["events"].append({
                "event": "login",
                "status": login_response.status,
                "elapsedMs": round((time.monotonic() - started_at) * 1000),
            })
            print(f"[login] HTTP {login_response.status}")
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
            print(f"[enqueue] HTTP {enqueue_response.status}")
            if enqueue_response.status != 202:
                raise RuntimeError(f"ENQUEUE_FAILED_{enqueue_response.status}: {safe_json(enqueue_body)}")

            job_id = enqueue_body.get("jobId")
            if not job_id:
                raise RuntimeError("ASYNC_JOB_ID_MISSING")
            print(f"[job] {job_id}")

            previous_status = None
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
                        print(f"[poll] HTTP {status_response.status}")
                        await asyncio.sleep(args.poll_interval_seconds)
                        continue

                    job = status_body.get("job", status_body)
                    event["jobStatus"] = job.get("status")
                    event["attempts"] = job.get("attempts")
                    if job.get("status") != previous_status:
                        previous_status = job.get("status")
                        print(f"[poll] status={previous_status} attempts={job.get('attempts')}")
                    if job.get("status") == "ready":
                        break
                    if job.get("status") in {"failed", "cancelled"}:
                        raise RuntimeError(
                            f"ASYNC_JOB_{job['status'].upper()}: {job.get('errorMessage')}"
                        )
                except PlaywrightError as error:
                    message = str(error).split("\nCall log:")[0]
                    report["events"].append({"event": "poll_transport_error", "error": message})
                    print(f"[poll] transport error: {message}")
                await asyncio.sleep(args.poll_interval_seconds)

            if not job or job.get("status") != "ready":
                await cancel_job(request, headers, base_url, job_id, report)
                raise RuntimeError("ASYNC_JOB_TIMEOUT_OR_STATUS_UNAVAILABLE")

            raw_download_url = job.get("downloadUrl") or f"/api/products/admin/export-jobs/{job_id}/download"
            download_url = urljoin(base_url + "/", raw_download_url)
            report["downloadUrl"] = redact_url(download_url)
            report["downloadOriginMatchesTarget"] = origin_matches(base_url, download_url)
            print(f"[download] {redact_url(download_url)}")
            if not report["downloadOriginMatchesTarget"]:
                print("[download] origin differs from target; allowed for configured external storage")

            with tempfile.TemporaryDirectory(prefix="export-test-") as temp_dir:
                zip_path = args.zip_output or Path(temp_dir) / f"products-export-{job_id}.zip"
                zip_path.parent.mkdir(parents=True, exist_ok=True)
                download_headers = await download_zip(
                    playwright,
                    base_url,
                    headers,
                    download_url,
                    zip_path,
                    max(timeout_ms, int(args.max_wait_minutes * 60 * 1000)),
                    report,
                )
                zip_result = validate_zip(zip_path, download_headers, args.format)
                report["result"] = {
                    "jobId": job_id,
                    "job": safe_job(job),
                    "zipPath": str(zip_path) if args.zip_output else None,
                    "zip": zip_result,
                }
                print(f"[validate] valid={zip_result['ok']} products={zip_result['productCount']} images={zip_result['imageEntryCount']}")
                if not zip_result["ok"]:
                    raise RuntimeError(f"ZIP_INVALID: {safe_json(zip_result)}")

            report["tunnel"] = scan_tunnel_log(args.tunnel_log)
            return report
        except ExportTestFailure:
            raise
        except asyncio.CancelledError:
            if token and job_id:
                await cancel_job(request, headers, base_url, job_id, report)
            raise
        except Exception as error:
            report["result"] = {
                "ok": False,
                "jobId": job_id,
                "error": str(error),
            }
            report["tunnel"] = scan_tunnel_log(args.tunnel_log)
            raise ExportTestFailure(str(error), report) from error
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
        report = await run_check(args)
        write_report(args.report, report)
        print("[FINAL RESULT] PASS")
        return 0
    except ExportTestFailure as error:
        write_report(args.report, error.report)
        print(f"[FINAL RESULT] FAIL\n[ERROR] {error}")
        return 1
    except (RuntimeError, PlaywrightError) as error:
        print(f"[FINAL RESULT] FAIL\n[ERROR] {safe_json(error)}")
        return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
