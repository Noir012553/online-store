'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const Module = require('module');
const { URL } = require('url');

const backendRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(backendRoot, '..');

const loadPlaywright = () => {
  const globalModulePaths = [
    process.env.NODE_PATH,
    process.env.APPDATA && path.join(process.env.APPDATA, 'npm', 'node_modules'),
    process.env.SystemRoot && path.join(process.env.SystemRoot, 'system32', 'node_modules'),
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'nodejs', 'node_modules'),
    '/usr/local/lib/node_modules',
    '/usr/lib/node_modules',
  ].filter(Boolean);
  process.env.NODE_PATH = [...new Set(globalModulePaths)].join(path.delimiter);
  Module._initPaths();
  try {
    return require('playwright');
  } catch (error) {
    throw new Error(
      `Cannot load global Playwright. Checked NODE_PATH=${process.env.NODE_PATH}. ${error.message}`,
    );
  }
};

let chromium;
let request;

const DEFAULT_URLS = {
  production: {
    frontend: 'https://manln.online',
    backend: 'https://backend.manln.online',
  },
  local: {
    frontend: 'http://127.0.0.1:3000',
    backend: 'http://127.0.0.1:5000',
  },
};

const IMAGE_SIGNATURES = {
  jpg: buffer => buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
  jpeg: buffer => buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
  png: buffer => buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  gif: buffer => ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii')),
  webp: buffer => buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && buffer.subarray(8, 12).toString('ascii') === 'WEBP',
  avif: buffer => buffer.subarray(4, 8).toString('ascii') === 'ftyp'
    && ['avif', 'avis'].includes(buffer.subarray(8, 12).toString('ascii')),
  svg: buffer => {
    const text = buffer.subarray(0, 1024).toString('utf8').trimStart().toLowerCase();
    return text.includes('<svg') || (text.startsWith('<?xml') && text.includes('<svg'));
  },
};

class ExportFailure extends Error {
  constructor(message, report) {
    super(message);
    this.name = 'ExportFailure';
    this.report = report;
  }
}

const parseArgs = argv => {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) throw new Error(`Unexpected argument: ${item}`);
    const key = item.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
};

const integerArg = (args, name, fallback, min, max) => {
  const value = args[name] === undefined ? fallback : Number(args[name]);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`--${name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)} must be between ${min} and ${max}`);
  }
  return value;
};

const numberArg = (args, name, fallback, min) => {
  const value = args[name] === undefined ? fallback : Number(args[name]);
  if (!Number.isFinite(value) || value <= min) throw new Error(`--${name} must be greater than ${min}`);
  return value;
};

const safeError = error => String(error?.message || error)
  .split('\nCall log:')[0]
  .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
  .replace(/\beyJ[a-zA-Z0-9._-]+\b/g, '[REDACTED]');

const redactUrl = value => {
  const parsed = new URL(value);
  parsed.username = '';
  parsed.password = '';
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString();
};

const sameOrigin = (left, right) => {
  const leftUrl = new URL(left);
  const rightUrl = new URL(right);
  return leftUrl.protocol === rightUrl.protocol && leftUrl.host === rightUrl.host;
};

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

const readJson = async response => {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 2000) };
  }
};

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
    entries.set(name, {
      name,
      compressedSize,
      uncompressedSize: buffer.readUInt32LE(offset + 24),
      compressionMethod,
      localHeaderOffset,
    });
    offset += 46 + fileNameLength + extraLength + commentLength;
  }
  return entries;
};

const readZipEntry = (buffer, entry) => {
  const offset = entry.localHeaderOffset;
  if (buffer.readUInt32LE(offset) !== 0x04034b50) {
    throw new Error(`ZIP_LOCAL_HEADER_INVALID_${entry.name}`);
  }
  const fileNameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + fileNameLength + extraLength;
  const compressedData = buffer.subarray(dataStart, dataStart + entry.compressedSize);
  if (entry.compressionMethod === 0) return compressedData;
  if (entry.compressionMethod === 8) return zlib.inflateRawSync(compressedData);
  throw new Error(`ZIP_COMPRESSION_UNSUPPORTED_${entry.name}`);
};

const imageSignatureIsValid = (name, buffer) => {
  const extension = path.extname(name).slice(1).toLowerCase();
  return IMAGE_SIGNATURES[extension] ? IMAGE_SIGNATURES[extension](buffer) : false;
};

const validateZip = (zipPath, headers, contentFormat) => {
  const buffer = fs.readFileSync(zipPath);
  const entries = readZipEntries(buffer);
  const names = [...entries.keys()];
  const imageNames = names.filter(name => name.startsWith('assets/images/'));
  const contentLength = headers['content-length'];
  const contentLengthMatches = contentLength
    ? Number(contentLength) === buffer.length
    : null;
  const result = {
    ok: false,
    bytes: buffer.length,
    contentFormat,
    contentLengthHeader: contentLength || '',
    contentLengthMatches,
    entryCount: names.length,
    productCount: 0,
    imageEntryCount: imageNames.length,
    emptyImageEntryCount: 0,
    invalidImageEntryCount: 0,
    imageReferences: 0,
    referencesWithAssetPath: 0,
    referencesWithoutAssetPath: 0,
    missingAssetPaths: [],
    zipError: '',
  };

  let products = [];
  if (contentFormat === 'json') {
    if (!entries.has('products.json')) {
      result.zipError = 'PRODUCTS_JSON_MISSING';
    } else {
      try {
        const parsed = JSON.parse(readZipEntry(buffer, entries.get('products.json')).toString('utf8'));
        if (!parsed || !Array.isArray(parsed.products)) throw new Error('PRODUCTS_JSON_INVALID');
        products = parsed.products;
      } catch (error) {
        result.zipError = safeError(error);
      }
    }
  } else if (!entries.has('products.csv')) {
    result.zipError = 'PRODUCTS_CSV_MISSING';
  } else {
    const rows = readZipEntry(buffer, entries.get('products.csv')).toString('utf8').split(/\r?\n/).filter(Boolean);
    if (!rows[0]?.trim()) result.zipError = 'PRODUCTS_CSV_INVALID';
    result.productCount = Math.max(0, rows.length - 1);
  }

  result.productCount = contentFormat === 'json' ? products.length : result.productCount;
  const referencedAssets = new Set();
  for (const product of products) {
    if (Array.isArray(product.imageAssetPaths)) {
      product.imageAssetPaths.filter(Boolean).forEach(assetPath => referencedAssets.add(assetPath));
    }
    if (!Array.isArray(product.images)) continue;
    for (const image of product.images) {
      if (!image?.url) continue;
      result.imageReferences += 1;
      if (image.assetPath) {
        result.referencesWithAssetPath += 1;
        referencedAssets.add(image.assetPath);
      } else {
        result.referencesWithoutAssetPath += 1;
      }
    }
  }

  for (const name of imageNames) {
    const image = readZipEntry(buffer, entries.get(name));
    if (!image.length) result.emptyImageEntryCount += 1;
    else if (!imageSignatureIsValid(name, image)) result.invalidImageEntryCount += 1;
  }
  result.missingAssetPaths = [...referencedAssets].filter(assetPath => !entries.has(assetPath)).sort();
  if (result.contentLengthMatches === false) result.zipError ||= 'CONTENT_LENGTH_MISMATCH';
  if (result.referencesWithoutAssetPath) result.zipError ||= 'IMAGE_REFERENCES_WITHOUT_ASSET_PATH';
  if (result.missingAssetPaths.length) result.zipError ||= 'MISSING_ASSET_PATHS';
  if (result.emptyImageEntryCount) result.zipError ||= 'EMPTY_IMAGE_ENTRIES';
  if (result.invalidImageEntryCount) result.zipError ||= 'INVALID_IMAGE_ENTRIES';
  result.ok = !result.zipError && result.contentLengthMatches !== false;
  return result;
};

const scanTunnelLog = logPath => {
  if (!logPath) return null;
  if (!fs.existsSync(logPath)) return { path: logPath, error: 'TUNNEL_LOG_NOT_FOUND' };
  const markers = [
    'timeout: no recent network activity',
    'failed to accept quic stream',
    'connection terminated',
    'context canceled',
    'application error 0x0',
    'unable to reach the origin service',
  ];
  const counts = Object.fromEntries(markers.map(marker => [marker, 0]));
  for (const line of fs.readFileSync(logPath, 'utf8').split(/\r?\n/)) {
    const lower = line.toLowerCase();
    for (const marker of markers) if (lower.includes(marker)) counts[marker] += 1;
  }
  return { path: logPath, markers: Object.fromEntries(Object.entries(counts).filter(([, count]) => count)), totalMatches: Object.values(counts).reduce((sum, count) => sum + count, 0) };
};

const cancelJob = async (api, headers, jobId, report) => {
  try {
    const response = await api.post(`/api/products/admin/export-jobs/${jobId}/cancel`, { headers });
    report.events.push({ event: 'cancel', status: response.status() });
    console.log(`[cancel] HTTP ${response.status()}`);
  } catch (error) {
    report.events.push({ event: 'cancel_transport_error', error: safeError(error) });
    console.log(`[cancel] ${safeError(error)}`);
  }
};

const downloadZip = async (targetUrl, headers, outputPath, timeoutMs, baseUrl) => {
  const browser = await chromium.launch({ headless: true });
  let context;
  let page;
  let latestResponse;
  try {
    context = await browser.newContext({
      acceptDownloads: true,
      extraHTTPHeaders: sameOrigin(baseUrl, targetUrl) ? headers : {},
    });
    page = await context.newPage();
    page.on('response', response => {
      if (response.request().method() === 'GET') latestResponse = response;
    });
    const downloadPromise = page.waitForEvent('download', { timeout: timeoutMs });
    try {
      await page.goto(targetUrl, { waitUntil: 'commit', timeout: timeoutMs });
    } catch (error) {
      if (!String(error.message || error).includes('Download is starting')) throw error;
    }
    const download = await downloadPromise;
    await download.saveAs(outputPath);
  } finally {
    if (page) page.removeAllListeners('response');
    if (context) await context.close();
    await browser.close();
  }
  if (!latestResponse) throw new Error('DOWNLOAD_RESPONSE_NOT_OBSERVED');
  if (latestResponse.status() !== 200) throw new Error(`DOWNLOAD_FAILED_${latestResponse.status()}`);
  return latestResponse.headers();
};

const writeReport = (reportPath, report) => {
  if (!reportPath) return;
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`[report] ${reportPath}`);
};

const run = async args => {
  ({ chromium, request } = loadPlaywright());
  const environment = args.environment || 'production';
  const target = args.target || 'backend';
  if (!DEFAULT_URLS[environment] || !['frontend', 'backend'].includes(target)) {
    throw new Error('Use --environment production|local and --target frontend|backend');
  }
  const frontendUrl = args.frontendBaseUrl || process.env.EXPORT_FRONTEND_BASE_URL || DEFAULT_URLS[environment].frontend;
  const backendUrl = args.backendBaseUrl || process.env.EXPORT_BACKEND_BASE_URL || DEFAULT_URLS[environment].backend;
  const baseUrl = (args.baseUrl || (target === 'frontend' ? frontendUrl : backendUrl)).replace(/\/+$/, '');
  const email = process.env[args.emailEnv || 'EXPORT_TEST_EMAIL'];
  const password = process.env[args.passwordEnv || 'EXPORT_TEST_PASSWORD'];
  if (!email || !password) throw new Error('Set EXPORT_TEST_EMAIL and EXPORT_TEST_PASSWORD');

  const limit = integerArg(args, 'limit', 100, 1, 10000);
  const maxWaitMinutes = numberArg(args, 'maxWaitMinutes', 30, 0);
  const requestTimeoutMs = numberArg(args, 'requestTimeoutSeconds', 120, 0) * 1000;
  const pollIntervalMs = numberArg(args, 'pollIntervalSeconds', 5, 0) * 1000;
  const format = args.format || 'json';
  if (!['json', 'csv'].includes(format)) throw new Error('--format must be json or csv');
  const deadline = Date.now() + maxWaitMinutes * 60 * 1000;
  const report = {
    environment,
    target,
    baseUrl,
    backendUrl,
    limit,
    format,
    events: [],
    result: null,
    tunnel: null,
  };
  let api;
  let headers;
  let jobId;
  let jobStatus;

  try {
    api = await request.newContext({ baseURL: baseUrl, timeout: requestTimeoutMs });
    const loginStarted = Date.now();
    const loginResponse = await api.post('/api/users/login', { data: { email, password } });
    const loginBody = await readJson(loginResponse);
    report.events.push({ event: 'login', status: loginResponse.status(), elapsedMs: Date.now() - loginStarted });
    console.log(`[login] HTTP ${loginResponse.status()}`);
    if (loginResponse.status() !== 200) throw new Error(`LOGIN_FAILED_${loginResponse.status()}: ${JSON.stringify(loginBody).slice(0, 500)}`);
    const token = loginBody.accessToken || loginBody.token;
    if (!token) throw new Error('LOGIN_TOKEN_MISSING');
    headers = { Authorization: `Bearer ${token}` };

    const params = { format, locales: args.locale || 'vi', limit: String(limit), async: 'true' };
    if (args.category && args.category !== 'all') params.category = args.category;
    if (args.brand && args.brand !== 'all') params.brand = args.brand;
    const enqueueResponse = await api.get('/api/products/admin/export-bundle', { params, headers });
    const enqueueBody = await readJson(enqueueResponse);
    report.events.push({ event: 'enqueue', status: enqueueResponse.status() });
    console.log(`[enqueue] HTTP ${enqueueResponse.status()}`);
    if (enqueueResponse.status() !== 202) throw new Error(`ENQUEUE_FAILED_${enqueueResponse.status()}: ${JSON.stringify(enqueueBody).slice(0, 500)}`);
    jobId = enqueueBody.jobId;
    if (!jobId) throw new Error('ASYNC_JOB_ID_MISSING');
    console.log(`[job] ${jobId}`);

    let previousStatus;
    let job;
    while (Date.now() < deadline) {
      try {
        const statusResponse = await api.get(`/api/products/admin/export-jobs/${jobId}`, { headers });
        const statusBody = await readJson(statusResponse);
        if (statusResponse.status() !== 200) throw new Error(`JOB_STATUS_FAILED_${statusResponse.status()}`);
        job = statusBody.job || statusBody;
        jobStatus = job.status;
        const event = { event: 'poll', status: statusResponse.status(), jobStatus, attempts: job.attempts };
        report.events.push(event);
        if (jobStatus !== previousStatus) {
          previousStatus = jobStatus;
          console.log(`[poll] status=${jobStatus} attempts=${job.attempts}`);
        }
        if (jobStatus === 'ready') break;
        if (['failed', 'cancelled'].includes(jobStatus)) throw new Error(`ASYNC_JOB_${jobStatus.toUpperCase()}: ${job.errorMessage || 'UNKNOWN'}`);
      } catch (error) {
        if (error.message.startsWith('ASYNC_JOB_') || error.message.startsWith('JOB_STATUS_FAILED_')) throw error;
        report.events.push({ event: 'poll_transport_error', error: safeError(error) });
        console.log(`[poll] ${safeError(error)}`);
      }
      await sleep(pollIntervalMs);
    }
    if (jobStatus !== 'ready') throw new Error('ASYNC_JOB_TIMEOUT');

    const rawDownloadUrl = job.downloadUrl || `/api/products/admin/export-jobs/${jobId}/download`;
    const downloadUrl = new URL(rawDownloadUrl, `${baseUrl}/`).toString();
    report.downloadUrl = redactUrl(downloadUrl);
    report.downloadOriginMatchesTarget = sameOrigin(baseUrl, downloadUrl);
    console.log(`[download] ${report.downloadUrl}`);
    if (!report.downloadOriginMatchesTarget) console.log('[download] external origin allowed for configured storage');

    const zipOutput = args.zipOutput
      ? path.resolve(args.zipOutput)
      : path.join(os.tmpdir(), `products-export-${jobId}.zip`);
    fs.mkdirSync(path.dirname(zipOutput), { recursive: true });
    const downloadHeaders = await downloadZip(
      downloadUrl,
      headers,
      zipOutput,
      Math.max(requestTimeoutMs, maxWaitMinutes * 60 * 1000),
      baseUrl,
    );
    const zip = validateZip(zipOutput, downloadHeaders, format);
    report.result = { ok: zip.ok, jobId, zipPath: args.zipOutput ? zipOutput : undefined, zip };
    console.log(`[validate] valid=${zip.ok} products=${zip.productCount} images=${zip.imageEntryCount}`);
    if (!zip.ok) throw new Error(`ZIP_INVALID_${zip.zipError}`);
    report.tunnel = scanTunnelLog(args.tunnelLog ? path.resolve(args.tunnelLog) : null);
    return report;
  } catch (error) {
    if (api && headers && jobId && ['queued', 'processing'].includes(jobStatus)) {
      await cancelJob(api, headers, jobId, report);
    }
    report.result = { ok: false, jobId, error: safeError(error) };
    report.tunnel = scanTunnelLog(args.tunnelLog ? path.resolve(args.tunnelLog) : null);
    throw new ExportFailure(safeError(error), report);
  } finally {
    if (api) await api.dispose();
  }
};

(async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node scripts/test-export-dynamic.js --environment local --target backend --limit 10 --report report.json');
    console.log('Options: --base-url --frontend-base-url --backend-base-url --format json|csv --max-wait-minutes --request-timeout-seconds --poll-interval-seconds --zip-output --tunnel-log');
    return;
  }
  try {
    const report = await run(args);
    writeReport(args.report ? path.resolve(args.report) : null, report);
    console.log('[FINAL RESULT] PASS');
  } catch (error) {
    writeReport(args.report ? path.resolve(args.report) : null, error.report || { ok: false, error: safeError(error) });
    console.error(`[FINAL RESULT] FAIL\n[ERROR] ${safeError(error)}`);
    process.exitCode = 1;
  }
})();
