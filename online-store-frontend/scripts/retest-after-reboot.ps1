[CmdletBinding()]
param(
  [string]$ProjectRoot = 'E:\Dev Camp\26-4-2 copy 69\online-store-frontend',
  [string]$BaseUrl = 'https://0002e5c211e64b61ac34-archive-momentum-tnvkvy8r.builderio.dev',
  [ValidateSet('vi', 'en', 'pt', 'fr', 'de', 'it', 'es', 'nl', 'sv')]
  [string]$Locale = 'vi',
  [string]$Email = 'admin@laptop.com',
  [string]$Password,
  [ValidateRange(1, 10000)]
  [int]$ExportLimit = 10,
  [int]$HttpTimeoutSec = 30,
  [int]$ExportTimeoutSec = 180,
  [switch]$SkipBrowser,
  [switch]$SkipTypeCheck
)

$ErrorActionPreference = 'Stop'
$BaseUrl = $BaseUrl.TrimEnd('/')
$ProjectRoot = (Resolve-Path $ProjectRoot).Path
$TempBrowserScript = Join-Path $ProjectRoot '.retest-after-reboot.generated.js'

function Get-HttpProbe {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Label
  )

  $url = "$BaseUrl$Path"
  $status = 0
  $body = ''
  $errorText = ''
  $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

  try {
    $response = Invoke-WebRequest `
      -Uri $url `
      -UseBasicParsing `
      -MaximumRedirection 5 `
      -TimeoutSec $HttpTimeoutSec
    $status = [int]$response.StatusCode
    $body = [string]$response.Content
  } catch {
    $errorText = $_.Exception.Message
    if ($_.Exception.Response) {
      try {
        $status = [int]$_.Exception.Response.StatusCode.value__
      } catch {
        $status = 0
      }
    }
  } finally {
    $stopwatch.Stop()
  }

  $result = [pscustomobject]@{
    label = $Label
    url = $url
    status = $status
    durationMs = $stopwatch.ElapsedMilliseconds
    error = $errorText
    bodySummary = if ($body.Length -gt 160) { $body.Substring(0, 160) } else { $body }
  }

  $color = if ($status -eq 200) { 'Green' } else { 'Red' }
  Write-Host ("[{0}] {1} {2} ({3} ms)" -f $status, $Label, $url, $stopwatch.ElapsedMilliseconds) -ForegroundColor $color
  if ($status -ne 200 -and $errorText) {
    Write-Host ("       {0}" -f $errorText) -ForegroundColor DarkYellow
  }

  return $result
}

function Test-CommandAvailable {
  param([Parameter(Mandatory = $true)][string]$Name)
  return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

Write-Host ''
Write-Host '===== RETEST AFTER REBOOT =====' -ForegroundColor Cyan
Write-Host ("Base URL: {0}" -f $BaseUrl)
Write-Host ("Locale:   {0}" -f $Locale)
Write-Host ''

$results = @()

if (-not $SkipTypeCheck) {
  $typeCheckOutput = ''
  $typeCheckExitCode = 0
  try {
    Push-Location $ProjectRoot
    $typeCheckOutput = (& npx --no-install tsc --noEmit --pretty false 2>&1 | Out-String).Trim()
    $typeCheckExitCode = $LASTEXITCODE
  } finally {
    Pop-Location
  }

  if ($typeCheckExitCode -eq 0) {
    Write-Host '[PASS] TypeScript check' -ForegroundColor Green
  } else {
    Write-Host '[FAIL] TypeScript check' -ForegroundColor Red
    if ($typeCheckOutput) { Write-Host $typeCheckOutput -ForegroundColor DarkYellow }
  }

  $results += [pscustomobject]@{
    label = 'TypeScript check'
    status = if ($typeCheckExitCode -eq 0) { 200 } else { 0 }
    durationMs = 0
    error = if ($typeCheckExitCode -eq 0) { '' } else { 'npx --no-install tsc failed' }
  }
}

$results += Get-HttpProbe -Path '/' -Label 'home page'
$results += Get-HttpProbe -Path '/login' -Label 'login page'
$results += Get-HttpProbe -Path '/products' -Label 'products page'

$apiPaths = @(
  @{ path = "/api/languages/active-config"; label = 'active locale config' },
  @{ path = "/api/translations?lang=$Locale&ns=components"; label = 'components translations' },
  @{ path = "/api/translations?lang=$Locale&ns=footer"; label = 'footer translations' },
  @{ path = "/api/translations?lang=$Locale&ns=cart"; label = 'cart translations' },
  @{ path = "/api/translations?lang=$Locale&ns=banner"; label = 'banner translations' },
  @{ path = "/api/translations?lang=$Locale&ns=home"; label = 'home translations' },
  @{ path = "/api/banners?pageNumber=1&pageSize=3&activeOnly=true&slot=homepage_right&lang=$Locale"; label = 'right banners' },
  @{ path = "/api/banners?pageNumber=1&pageSize=3&activeOnly=true&slot=homepage_inline&lang=$Locale"; label = 'inline banners' },
  @{ path = "/api/banners?pageNumber=1&pageSize=3&activeOnly=true&slot=homepage_left&lang=$Locale"; label = 'left banners' },
  @{ path = "/api/banners?pageNumber=1&pageSize=10&activeOnly=true&slot=homepage_hero&lang=$Locale"; label = 'hero banners' },
  @{ path = "/api/brands?lang=$Locale"; label = 'brands' },
  @{ path = "/api/categories?lang=$Locale&withProducts=true&pageSize=500"; label = 'categories' }
)

foreach ($apiPath in $apiPaths) {
  $results += Get-HttpProbe -Path $apiPath.path -Label $apiPath.label
}

if (-not $SkipBrowser) {
  if ([string]::IsNullOrWhiteSpace($Password)) {
    $securePassword = Read-Host 'Admin password' -AsSecureString
    $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    try {
      $Password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    } finally {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    }
  }

  if (-not (Test-CommandAvailable -Name 'node')) {
    throw 'Node.js is not available in PATH.'
  }

  $browserScript = @'
const { chromium } = require('playwright');

const [baseUrl, locale, email, password, exportLimit, exportTimeoutMs] = JSON.parse(process.argv[2]);

const hasZipSignature = (body) => body.length >= 4
  && body[0] === 0x50
  && body[1] === 0x4b
  && body[2] === 0x03
  && body[3] === 0x04;

const summarizeExport = async (page, query, accessToken) => {
  const exportUrl = new URL('/api/products/admin/export-bundle', baseUrl);
  for (const [key, value] of Object.entries(query)) {
    exportUrl.searchParams.set(key, value);
  }

  const result = await page.evaluate(async ({ url, timeoutMs, accessToken }) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/zip',
          Authorization: `Bearer ${accessToken}`,
        },
        credentials: 'include',
        signal: controller.signal,
      });
      const body = new Uint8Array(await response.arrayBuffer());
      let zipEndRecord = false;
      const scanStart = Math.max(0, body.length - 65557);
      for (let index = scanStart; index <= body.length - 4; index += 1) {
        if (body[index] === 0x50 && body[index + 1] === 0x4b
          && body[index + 2] === 0x05 && body[index + 3] === 0x06) {
          zipEndRecord = true;
          break;
        }
      }
      return {
        status: response.status,
        ok: response.ok,
        contentType: response.headers.get('content-type') || '',
        contentLength: response.headers.get('content-length') || '',
        byteLength: body.byteLength,
        firstBytes: Array.from(body.slice(0, 4)),
        zipEndRecord,
        bodySummary: new TextDecoder().decode(body.slice(0, 160)),
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }, { url: exportUrl.toString(), timeoutMs: exportTimeoutMs, accessToken });

  return {
    query,
    mode: query.locales ? 'locales' : 'lang',
    ...result,
    zipSignature: hasZipSignature(result.firstBytes),
  };
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const failedRequests = [];
  let loginStatus = 0;
  let accessToken = '';

  page.on('requestfailed', request => {
    failedRequests.push({
      method: request.method(),
      url: request.url(),
      errorText: request.failure()?.errorText || '',
    });
  });

  try {
    const loginUrl = new URL('/login', baseUrl).toString();
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: exportTimeoutMs });
    await page.locator('#login-email').waitFor({ state: 'visible', timeout: exportTimeoutMs });
    await page.locator('#login-email').fill(email);
    await page.locator('#login-password').fill(password);

    const loginResponsePromise = page.waitForResponse(
      response => response.request().method() === 'POST'
        && /\/api\/users\/login(?:\?|$)/.test(response.url()),
      { timeout: exportTimeoutMs },
    );
    await page.locator('button[type="submit"]').click();
    const loginResponse = await loginResponsePromise;
    loginStatus = loginResponse.status();
    const loginData = await loginResponse.json();
    accessToken = loginData.accessToken || loginData.token || '';

    if (!loginResponse.ok() || !accessToken) {
      throw new Error(`Login failed with status ${loginStatus}`);
    }

    await page.waitForTimeout(500);
    const modern = await summarizeExport(page, {
      format: 'json',
      limit: String(exportLimit),
      locales: locale,
    }, accessToken);
    const legacy = await summarizeExport(page, {
      format: 'json',
      limit: String(exportLimit),
      lang: locale,
    }, accessToken);

    console.log(JSON.stringify({
      pageUrl: page.url(),
      loginStatus,
      modern,
      legacy,
      failedRequests,
    }));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(JSON.stringify({ error: error.message }));
  process.exitCode = 1;
});
'@

  Set-Content -Path $TempBrowserScript -Value $browserScript -Encoding UTF8
  $nodeArguments = @($BaseUrl, $Locale, $Email, $Password, $ExportLimit, ($ExportTimeoutSec * 1000)) | ConvertTo-Json -Compress
  $browserOutput = ''
  $browserExitCode = 0

  try {
    Push-Location $ProjectRoot
    $browserOutput = (& node $TempBrowserScript $nodeArguments 2>&1 | Out-String).Trim()
    $browserExitCode = $LASTEXITCODE
  } finally {
    Pop-Location
    Remove-Item $TempBrowserScript -Force -ErrorAction SilentlyContinue
  }

  Write-Host ''
  Write-Host '===== PLAYWRIGHT AUTH/EXPORT =====' -ForegroundColor Cyan
  if ($browserOutput) {
    Write-Host $browserOutput
  }

  if ($browserExitCode -ne 0) {
    $results += [pscustomobject]@{
      label = 'Playwright auth/export'
      status = 0
      durationMs = 0
      error = "Node exit code $browserExitCode"
    }
  } else {
    try {
      $browserResult = $browserOutput | ConvertFrom-Json
      foreach ($exportResult in @($browserResult.modern, $browserResult.legacy)) {
        $isPass = $exportResult.status -eq 200 `
          -and $exportResult.ok `
          -and $exportResult.contentType -match 'application/zip' `
          -and $exportResult.byteLength -gt 0 `
          -and $exportResult.contentLength -and ([int64]$exportResult.contentLength -eq [int64]$exportResult.byteLength) `
          -and $exportResult.zipSignature `
          -and $exportResult.zipEndRecord
        $results += [pscustomobject]@{
          label = "Playwright export ($($exportResult.mode))"
          status = $exportResult.status
          durationMs = 0
          error = if ($isPass) { '' } else { 'Invalid or incomplete ZIP response' }
        }
      }
    } catch {
      $results += [pscustomobject]@{
        label = 'Playwright auth/export'
        status = 0
        durationMs = 0
        error = $_.Exception.Message
      }
    }
  }
}

$failed = @($results | Where-Object { $_.status -ne 200 })
Write-Host ''
Write-Host '===== SUMMARY =====' -ForegroundColor Cyan
Write-Host ("Checks: {0}, failed: {1}" -f $results.Count, $failed.Count)

if ($failed.Count -gt 0) {
  Write-Host 'RESULT: FAIL' -ForegroundColor Red
  exit 1
}

Write-Host 'RESULT: PASS' -ForegroundColor Green
exit 0
