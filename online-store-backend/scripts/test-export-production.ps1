param(
    [ValidateSet('production', 'local')]
    [string]$Environment = 'production',

    [ValidateSet('frontend', 'backend')]
    [string]$Target = 'frontend',

    [ValidateRange(1, 10000)]
    [int]$Limit = 100,

    [ValidateRange(1, 720)]
    [int]$MaxWaitMinutes = 30,

    [ValidateRange(5, 300)]
    [int]$RequestTimeoutSeconds = 120,

    [string]$FrontendBaseUrl,
    [string]$BackendBaseUrl,
    [string]$CredentialPath = "$HOME\.online-store-export-credential.xml",

    [switch]$SaveZip,
    [string]$ZipOutputPath
)

$ErrorActionPreference = 'Stop'

$productionFrontendUrl = 'https://manln.online'
$productionBackendUrl = 'https://backend.manln.online'
$localFrontendUrl = 'http://127.0.0.1:3000'
$localBackendUrl = 'http://127.0.0.1:5000'

if (-not $FrontendBaseUrl) {
    $FrontendBaseUrl = if ($Environment -eq 'production') {
        $productionFrontendUrl
    } else {
        $localFrontendUrl
    }
}

if (-not $BackendBaseUrl) {
    $BackendBaseUrl = if ($Environment -eq 'production') {
        $productionBackendUrl
    } else {
        $localBackendUrl
    }
}

$baseUrl = if ($Target -eq 'frontend') { $FrontendBaseUrl } else { $BackendBaseUrl }
$runStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$desktopPath = [Environment]::GetFolderPath('Desktop')
$reportPath = Join-Path `
    $desktopPath `
    ("export-zip-$Environment-$Target-$Limit-$runStamp.log")

if ($SaveZip -and -not $ZipOutputPath) {
    $ZipOutputPath = Join-Path `
        $desktopPath `
        ("products-export-$Environment-$Target-$Limit-$runStamp.zip")
}

if ($ZipOutputPath) {
    $zipDirectory = Split-Path -Parent $ZipOutputPath
    if ($zipDirectory) {
        New-Item -ItemType Directory -Path $zipDirectory -Force | Out-Null
    }
}

try {
    Stop-Transcript | Out-Null
} catch {
}

Start-Transcript -Path $reportPath -Force

try {
    if (-not (Test-Path $CredentialPath)) {
        throw "Không tìm thấy credential file: $CredentialPath"
    }

    $credential = Import-Clixml -Path $CredentialPath
    $env:EXPORT_TEST_EMAIL = $credential.UserName
    $env:EXPORT_TEST_PASSWORD = $credential.GetNetworkCredential().Password
    $env:NODE_PATH = 'C:\Windows\system32\node_modules'

    Write-Host "[TEST MODE] ASYNC EXPORT"
    Write-Host "[ENVIRONMENT] $Environment"
    Write-Host "[TARGET] $Target"
    Write-Host "[FRONTEND] $FrontendBaseUrl"
    Write-Host "[BACKEND] $BackendBaseUrl"
    Write-Host "[LIMIT] $Limit"
    Write-Host "[MAX WAIT] $MaxWaitMinutes minutes"
    Write-Host "[REQUEST TIMEOUT] $RequestTimeoutSeconds seconds"
    Write-Host "[RUN COUNT] 1"
    Write-Host "[IMAGE DEBUG LOG] disabled"
    Write-Host ""

    @'
const fs = require('fs');
const zlib = require('zlib');
const { request } = require('playwright');

const targetBaseUrl = process.env.EXPORT_TARGET_BASE_URL;
const backendBaseUrl = process.env.EXPORT_BACKEND_BASE_URL;
const email = process.env.EXPORT_TEST_EMAIL;
const password = process.env.EXPORT_TEST_PASSWORD;
const limit = Number(process.env.EXPORT_LIMIT);
const maxWaitMs = Number(process.env.EXPORT_MAX_WAIT_MINUTES) * 60 * 1000;
const requestTimeoutMs = Number(process.env.EXPORT_REQUEST_TIMEOUT_SECONDS) * 1000;
const exportQuery = `format=json&locales=vi&limit=${limit}&async=true`;

const safeErrorMessage = error => String(error?.message || error)
  .split('\nCall log:')[0]
  .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
  .replace(/\beyJ[a-zA-Z0-9._-]+\b/g, '[REDACTED]');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const findEndOfCentralDirectory = buffer => {
  for (let index = buffer.length - 22; index >= 0; index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) return index;
  }
  return -1;
};

const readZipEntries = buffer => {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  if (eocdOffset < 0) throw new Error('ZIP_END_OF_CENTRAL_DIRECTORY_NOT_FOUND');

  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries = new Map();
  let offset = centralDirectoryOffset;
  const end = centralDirectoryOffset + centralDirectorySize;

  while (offset < end) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error(`ZIP_CENTRAL_DIRECTORY_INVALID_AT_${offset}`);
    }

    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + fileNameLength);

    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    entries.set(name, {
      name,
      compressedSize,
      uncompressedSize,
      compressionMethod,
      localHeaderOffset,
    });

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
};

const readZipEntry = (buffer, entry) => {
  const localOffset = entry.localHeaderOffset;
  if (buffer.readUInt32LE(localOffset) !== 0x04034b50) {
    throw new Error(`ZIP_LOCAL_HEADER_INVALID_${entry.name}`);
  }

  const fileNameLength = buffer.readUInt16LE(localOffset + 26);
  const extraLength = buffer.readUInt16LE(localOffset + 28);
  const dataStart = localOffset + 30 + fileNameLength + extraLength;
  const compressedData = buffer.subarray(dataStart, dataStart + entry.compressedSize);

  if (entry.compressionMethod === 0) return compressedData;
  if (entry.compressionMethod === 8) return zlib.inflateRawSync(compressedData);
  throw new Error(`ZIP_COMPRESSION_UNSUPPORTED_${entry.name}`);
};

const hasImageSignature = (buffer, name) => {
  const lowerName = name.toLowerCase();
  if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) {
    return buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  }
  if (lowerName.endsWith('.png')) {
    return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (lowerName.endsWith('.gif')) {
    return ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'));
  }
  if (lowerName.endsWith('.webp')) {
    return buffer.subarray(0, 4).toString('ascii') === 'RIFF'
      && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  if (lowerName.endsWith('.avif')) {
    return buffer.subarray(4, 8).toString('ascii') === 'ftyp'
      && ['avif', 'avis'].includes(buffer.subarray(8, 12).toString('ascii'));
  }
  if (lowerName.endsWith('.svg')) {
    const text = buffer.subarray(0, 1024).toString('utf8').trimStart().toLowerCase();
    return text.includes('<svg') || (text.startsWith('<?xml') && text.includes('<svg'));
  }
  return false;
};

const validateZip = (buffer, headers) => {
  const entries = readZipEntries(buffer);
  const names = [...entries.keys()];
  const hasProductsJson = entries.has('products.json');
  const imageEntries = names.filter(name => name.startsWith('assets/images/'));
  const contentLengthHeader = headers['content-length'] || '';
  const contentLength = Number(contentLengthHeader);
  const contentLengthMatches = Number.isFinite(contentLength) && contentLength === buffer.length;
  const zipSignature = buffer.length >= 4
    && buffer[0] === 0x50
    && buffer[1] === 0x4b
    && buffer[2] === 0x03
    && buffer[3] === 0x04;

  let products = [];
  let productsJsonError = '';

  if (hasProductsJson) {
    try {
      const data = readZipEntry(buffer, entries.get('products.json'));
      const parsed = JSON.parse(data.toString('utf8'));
      products = Array.isArray(parsed.products) ? parsed.products : [];
    } catch (error) {
      productsJsonError = safeErrorMessage(error);
    }
  }

  const imageReferences = products.flatMap((product, productIndex) => (
    Array.isArray(product.images)
      ? product.images.map((image, imageIndex) => ({
        productId: product.productId || null,
        productIndex: productIndex + 1,
        imageIndex,
        type: image?.type || null,
        url: image?.url || null,
        assetPath: image?.assetPath || null,
      }))
      : []
  ));
  const referencesWithUrl = imageReferences.filter(image => image.url);
  const referencesWithoutUrl = imageReferences.filter(image => !image.url);
  const referencesWithoutAssetPath = referencesWithUrl.filter(image => !image.assetPath);
  const referencedAssetPaths = [
    ...products.flatMap(product => (
      Array.isArray(product.imageAssetPaths) ? product.imageAssetPaths : []
    )),
    ...referencesWithUrl.map(image => image.assetPath).filter(Boolean),
  ];
  const uniqueReferencedAssetPaths = [...new Set(referencedAssetPaths)];
  const missingAssetPaths = uniqueReferencedAssetPaths
    .filter(assetPath => !entries.has(assetPath));

  const imageValidation = imageEntries.map(name => {
    const entry = entries.get(name);
    try {
      const data = readZipEntry(buffer, entry);
      return {
        name,
        bytes: data.length,
        declaredBytes: entry.uncompressedSize,
        empty: data.length === 0,
        validSignature: hasImageSignature(data, name),
        error: '',
      };
    } catch (error) {
      return {
        name,
        bytes: 0,
        declaredBytes: entry.uncompressedSize,
        empty: false,
        validSignature: false,
        error: safeErrorMessage(error),
      };
    }
  });
  const emptyImageEntries = imageValidation.filter(image => image.empty);
  const invalidImageEntries = imageValidation.filter(image => !image.empty && !image.validSignature);
  const imageEntrySamples = imageValidation.slice(0, 20);
  const missingAssetSamples = referencesWithoutAssetPath.slice(0, 20);
  const productsHaveImages = imageReferences.length > 0;
  const hasImagesFolder = imageEntries.length > 0;
  const imageAssetsComplete = (
    referencesWithoutUrl.length === 0
    && referencesWithoutAssetPath.length === 0
    && missingAssetPaths.length === 0
    && emptyImageEntries.length === 0
    && invalidImageEntries.length === 0
  );
  const zipError = productsJsonError
    || (!contentLengthMatches ? 'CONTENT_LENGTH_MISMATCH' : '')
    || (!zipSignature ? 'ZIP_SIGNATURE_INVALID' : '')
    || (!hasProductsJson ? 'PRODUCTS_JSON_MISSING' : '')
    || (productsHaveImages && !hasImagesFolder ? 'IMAGES_FOLDER_MISSING' : '')
    || (referencesWithoutUrl.length > 0 ? 'IMAGE_REFERENCES_WITHOUT_URL' : '')
    || (referencesWithoutAssetPath.length > 0 ? 'IMAGE_REFERENCES_WITHOUT_ASSET_PATH' : '')
    || (missingAssetPaths.length > 0 ? 'MISSING_ASSET_PATHS' : '')
    || (emptyImageEntries.length > 0 ? 'EMPTY_IMAGE_ENTRIES' : '')
    || (invalidImageEntries.length > 0 ? 'INVALID_IMAGE_ENTRIES' : '');

  return {
    ok: !zipError,
    imageAssetsComplete,
    bytes: buffer.length,
    contentType: headers['content-type'] || '',
    contentLengthHeader,
    contentLengthMatches,
    zipSignature,
    zipError,
    entryCount: names.length,
    productCount: products.length,
    imageEntryCount: imageEntries.length,
    metadataImageCount: imageReferences.length,
    metadataImagesWithUrl: referencesWithUrl.length,
    metadataImagesWithoutUrl: referencesWithoutUrl.length,
    metadataImagesWithAssetPath: referencesWithUrl.length - referencesWithoutAssetPath.length,
    metadataImagesWithoutAssetPath: referencesWithoutAssetPath.length,
    uniqueReferencedAssetPathCount: uniqueReferencedAssetPaths.length,
    emptyImageEntryCount: emptyImageEntries.length,
    invalidImageEntryCount: invalidImageEntries.length,
    downloadedImageBytes: imageValidation.reduce((total, image) => total + image.bytes, 0),
    hasProductsJson,
    hasImagesFolder,
    missingAssetPaths,
    missingAssetSamples,
    imageEntrySamples,
  };
};

const login = async () => {
  const context = await request.newContext({
    baseURL: targetBaseUrl,
    timeout: requestTimeoutMs,
  });

  try {
    const response = await context.post('/api/users/login', {
      data: { email, password },
    });
    console.log('[LOGIN STATUS]', response.status());
    if (response.status() !== 200) throw new Error(`LOGIN_FAILED_${response.status()}`);

    const body = await response.json();
    const token = body.accessToken || body.token;
    if (!token) throw new Error('LOGIN_TOKEN_MISSING');
    console.log('[LOGIN RESULT] PASS');
    return token;
  } finally {
    await context.dispose();
  }
};

const enqueue = async (token) => {
  const context = await request.newContext({
    baseURL: targetBaseUrl,
    timeout: requestTimeoutMs,
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });

  try {
    const startedAt = Date.now();
    const response = await context.get(`/api/products/admin/export-bundle?${exportQuery}`);
    const body = await response.json().catch(() => ({}));
    console.log('[ENQUEUE STATUS]', response.status());
    console.log('[ENQUEUE ELAPSED MS]', Date.now() - startedAt);

    if (response.status() !== 202) {
      console.log('[ENQUEUE BODY]', JSON.stringify(body).slice(0, 1000));
      throw new Error(`ASYNC_ENQUEUE_FAILED_${response.status()}`);
    }
    if (!body.jobId) throw new Error('ASYNC_JOB_ID_MISSING');
    console.log('[JOB ID]', body.jobId);
    console.log('[ENQUEUE RESULT] PASS');
    return body.jobId;
  } finally {
    await context.dispose();
  }
};

const waitForReady = async (token, jobId) => {
  const context = await request.newContext({
    baseURL: targetBaseUrl,
    timeout: requestTimeoutMs,
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });

  const startedAt = Date.now();
  let previousStatus = '';

  try {
    while (Date.now() - startedAt < maxWaitMs) {
      const response = await context.get(`/api/products/admin/export-jobs/${jobId}`);
      const body = await response.json().catch(() => ({}));
      if (response.status() !== 200) throw new Error(`JOB_STATUS_FAILED_${response.status()}`);

      const job = body.job || body;
      if (job.status !== previousStatus) {
        previousStatus = job.status;
        console.log('[JOB STATUS]', job.status);
        console.log('[JOB ATTEMPTS]', job.attempts);
        console.log('[JOB ELAPSED MS]', Date.now() - startedAt);
      }

      if (job.status === 'ready') return job;
      if (job.status === 'failed' || job.status === 'cancelled') {
        throw new Error(`ASYNC_JOB_${job.status.toUpperCase()}_${job.errorMessage || 'UNKNOWN'}`);
      }

      await sleep(5000);
    }

    throw new Error('ASYNC_JOB_TIMEOUT');
  } finally {
    await context.dispose();
  }
};

const cancelJob = async (token, jobId) => {
  const context = await request.newContext({
    baseURL: targetBaseUrl,
    timeout: requestTimeoutMs,
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });

  try {
    const response = await context.post(`/api/products/admin/export-jobs/${jobId}/cancel`);
    console.log('[CANCEL STATUS]', response.status());
    if (response.status() === 200) {
      const body = await response.json().catch(() => ({}));
      console.log('[CANCEL RESULT]', JSON.stringify(body));
    } else {
      console.log('[CANCEL RESULT] SKIPPED', await response.text().catch(() => ''));
    }
  } finally {
    await context.dispose();
  }
};

const zipOutputPath = process.env.EXPORT_ZIP_OUTPUT_PATH || '';

const downloadAndValidate = async (token, job) => {
  const context = await request.newContext({
    baseURL: targetBaseUrl,
    timeout: maxWaitMs,
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });

  try {
    const downloadUrl = job.downloadUrl || `/api/products/admin/export-jobs/${job.jobId}/download`;
    const response = await context.get(downloadUrl);
    const headers = response.headers();
    console.log('[DOWNLOAD STATUS]', response.status());
    console.log('[DOWNLOAD CONTENT-TYPE]', headers['content-type'] || '');
    console.log('[DOWNLOAD CONTENT-LENGTH]', headers['content-length'] || '');

    if (response.status() !== 200) {
      throw new Error(`ASYNC_DOWNLOAD_FAILED_${response.status()}`);
    }

    const zipBuffer = await response.body();
    if (zipOutputPath) {
      await fs.promises.writeFile(zipOutputPath, zipBuffer);
      console.log('[ZIP OUTPUT]', zipOutputPath);
    }

    const result = validateZip(zipBuffer, headers);
    console.log('[ZIP RESULT]', JSON.stringify(result, null, 2));
    if (!result.ok) throw new Error(`ASYNC_ZIP_INVALID_${result.zipError}`);
  } finally {
    await context.dispose();
  }
};

(async () => {
  console.log('[TARGET URL]', targetBaseUrl);
  console.log('[BACKEND URL CONFIGURED]', backendBaseUrl);
  console.log('[QUERY]', exportQuery);
  console.log('[POLL LOGGING] status changes only');

  let token = null;
  let jobId = null;

  try {
    token = await login();
    jobId = await enqueue(token);
    const job = await waitForReady(token, jobId);
    console.log('[JOB READY] PASS');
    await downloadAndValidate(token, { ...job, jobId });
    console.log('[FINAL RESULT] PASS');
  } catch (error) {
    if (token && jobId && error.message === 'ASYNC_JOB_TIMEOUT') {
      try {
        await cancelJob(token, jobId);
      } catch (cancelError) {
        console.log('[CANCEL RESULT] FAIL', safeErrorMessage(cancelError));
      }
    }
    console.log('[FINAL RESULT] FAIL');
    console.log('[ERROR]', safeErrorMessage(error));
  }
})();
'@ | ForEach-Object {
        $env:EXPORT_TARGET_BASE_URL = $baseUrl
        $env:EXPORT_BACKEND_BASE_URL = $BackendBaseUrl
        $env:EXPORT_LIMIT = $Limit
        $env:EXPORT_MAX_WAIT_MINUTES = $MaxWaitMinutes
        $env:EXPORT_REQUEST_TIMEOUT_SECONDS = $RequestTimeoutSeconds
        $env:EXPORT_ZIP_OUTPUT_PATH = $ZipOutputPath
        $_
    } | node -
}
finally {
    Remove-Item Env:EXPORT_TEST_EMAIL -ErrorAction SilentlyContinue
    Remove-Item Env:EXPORT_TEST_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:NODE_PATH -ErrorAction SilentlyContinue
    Remove-Item Env:EXPORT_TARGET_BASE_URL -ErrorAction SilentlyContinue
    Remove-Item Env:EXPORT_BACKEND_BASE_URL -ErrorAction SilentlyContinue
    Remove-Item Env:EXPORT_LIMIT -ErrorAction SilentlyContinue
    Remove-Item Env:EXPORT_MAX_WAIT_MINUTES -ErrorAction SilentlyContinue
    Remove-Item Env:EXPORT_REQUEST_TIMEOUT_SECONDS -ErrorAction SilentlyContinue
    Remove-Item Env:EXPORT_ZIP_OUTPUT_PATH -ErrorAction SilentlyContinue

    try {
        Stop-Transcript | Out-Null
    } catch {
    }

    Write-Host ""
    Write-Host "Report đã lưu tại: $reportPath" -ForegroundColor Green
    if ($ZipOutputPath) {
        Write-Host "ZIP đã lưu tại: $ZipOutputPath" -ForegroundColor Green
    }
    Write-Host "PowerShell vẫn đang mở; không chạy exit." -ForegroundColor Green
}
