/**
 * Cloudinary Service - Quản lý upload & delete file lên Cloudinary
 * 
 * Tại sao Cloudinary thay vì local storage?
 * - Multi-instance: Không cần lo sync file giữa các server
 * - CDN: Ảnh được cache & deliver gần user
 * - Backup: Tự động backup, không sợ mất file
 * - Transformation: Có thể resize, crop, optimize ảnh on-the-fly
 */

const cloudinary = require('cloudinary').v2;
const { MAX_IMAGE_ASSET_BYTES } = require('../utils/fileUtils');
const { fetchSafeRemoteImage } = require('../utils/safeRemoteUrl');

const CLOUDINARY_ROTATION_COOLDOWN_MS = 60 * 1000;
const CLOUDINARY_QUOTA_CACHE_TTL_MS = 30 * 1000;
const DEFAULT_CLOUDINARY_QUOTA_THRESHOLD_PERCENT = 80;
let cloudinaryConfigQueue = Promise.resolve();
let accountCursor = 0;
const accountCooldowns = new Map();
const accountQuotaCache = new Map();

const getCloudinaryAccounts = () => {
  const accounts = [];
  const primary = {
    id: '1',
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  };
  if (Object.values(primary).slice(1).every(Boolean)) accounts.push(primary);

  for (let index = 2; index <= 100; index += 1) {
    const suffix = `_${index}`;
    const values = {
      id: String(index),
      cloudName: process.env[`CLOUDINARY_CLOUD_NAME${suffix}`],
      apiKey: process.env[`CLOUDINARY_API_KEY${suffix}`],
      apiSecret: process.env[`CLOUDINARY_API_SECRET${suffix}`],
    };
    if (!Object.values(values).some(Boolean)) break;
    if (Object.values(values).slice(1).every(Boolean)) accounts.push(values);
  }

  return accounts;
};

const getCloudinaryAccount = (accountId = '1') => (
  getCloudinaryAccounts().find(account => account.id === String(accountId)) || null
);

const configureCloudinaryAccount = (account) => {
  cloudinary.config({
    cloud_name: account.cloudName,
    api_key: account.apiKey,
    api_secret: account.apiSecret,
  });
};

const withConfiguredCloudinary = async (account, operation) => {
  const previous = cloudinaryConfigQueue;
  let release;
  cloudinaryConfigQueue = new Promise(resolve => { release = resolve; });
  await previous;

  try {
    configureCloudinaryAccount(account);
    return await operation();
  } finally {
    release();
  }
};

const normalizeCloudinaryError = (error, context = 'Cloudinary operation failed') => {
  if (error instanceof Error) return error;

  const message = error?.message || error?.error?.message || (
    error == null ? 'Unknown Cloudinary error' : String(error)
  );
  const normalized = new Error(`${context}: ${message}`);
  if (error && typeof error === 'object') Object.assign(normalized, error);
  return normalized;
};

const isCloudinaryRateLimitError = (error) => {
  const status = Number(error?.http_code ?? error?.statusCode ?? error?.status);
  return [420, 429].includes(status)
    || /(rate limit|too many requests|quota exceeded|resource limit|usage limit|credits exhausted|exceeded your plan)/i.test(String(error?.message || ''));
};

const getCloudinaryAccountEnvPrefix = (accountId) => (
  String(accountId) === '1' ? 'CLOUDINARY_*' : `CLOUDINARY_*_${accountId}`
);

const getCloudinaryQuotaThresholdPercent = () => {
  const configured = Number(process.env.CLOUDINARY_QUOTA_THRESHOLD_PERCENT);
  if (!Number.isFinite(configured) || configured <= 0 || configured >= 100) {
    return DEFAULT_CLOUDINARY_QUOTA_THRESHOLD_PERCENT;
  }
  return configured;
};

const getCloudinaryQuotaCacheKey = account => account.id;

const logCloudinaryQuotaRotation = (account, quota) => {
  console.warn('[CLOUDINARY_QUOTA_ROTATION]', {
    accountId: account.id,
    usedCredits: quota.usedCredits,
    limitCredits: quota.limitCredits,
    usedPercent: Number(quota.usedPercent.toFixed(2)),
    thresholdPercent: quota.thresholdPercent,
  });
};

const createCloudinaryQuotaError = (account, quota) => {
  const error = new Error(
    `Cloudinary account ${account.id} reached the upload safety threshold: ${quota.usedPercent.toFixed(2)}% of ${quota.limitCredits} credits used`,
  );
  error.code = 'CLOUDINARY_QUOTA_NEAR_LIMIT';
  error.cloudinaryAccountId = account.id;
  error.cloudinaryQuota = quota;
  return error;
};

const markCloudinaryAccountRateLimited = (accountId) => {
  accountCooldowns.set(String(accountId), Date.now() + CLOUDINARY_ROTATION_COOLDOWN_MS);
};

const selectCloudinaryAccount = (excludedIds = new Set()) => {
  const accounts = getCloudinaryAccounts();
  const now = Date.now();
  for (let offset = 0; offset < accounts.length; offset += 1) {
    const index = (accountCursor + offset) % accounts.length;
    const account = accounts[index];
    if (excludedIds.has(account.id)) continue;
    if ((accountCooldowns.get(account.id) || 0) > now) continue;
    accountCursor = (index + 1) % accounts.length;
    return account;
  }

  return null;
};

const runCloudinaryOperation = async (operation, accountId = null) => {
  const accounts = getCloudinaryAccounts();
  const attemptedIds = new Set();
  let lastRateLimitError = null;

  while (attemptedIds.size < accounts.length) {
    const account = accountId
      ? getCloudinaryAccount(accountId)
      : selectCloudinaryAccount(attemptedIds);
    if (!account || attemptedIds.has(account.id)) break;
    attemptedIds.add(account.id);

    try {
      return await withConfiguredCloudinary(account, () => operation(account));
    } catch (error) {
      const normalizedError = normalizeCloudinaryError(
        error,
        `Cloudinary account ${account.id} operation failed`,
      );
      if (/disabled customer/i.test(normalizedError.message)) {
        throw new Error(
          `Cloudinary account ${account.id} is disabled ("disabled customer"). Check ${getCloudinaryAccountEnvPrefix(account.id)} credentials or re-enable the account; clear stopped before MongoDB deletion.`,
          { cause: normalizedError },
        );
      }
      if (!isCloudinaryRateLimitError(normalizedError) || accountId) throw normalizedError;
      markCloudinaryAccountRateLimited(account.id);
      lastRateLimitError = normalizedError;
      if (process.env.NODE_ENV === 'development') {
        console.warn('[CLOUDINARY_ACCOUNT_ROTATION]', { accountId: account.id, message: normalizedError.message });
      }
    }
  }

  throw lastRateLimitError || new Error('No Cloudinary account is available');
};

const runCloudinaryUploadOperation = async (operation, accountId = null) => {
  const accounts = getCloudinaryAccounts();
  const attemptedIds = new Set();
  let lastRotationError = null;

  while (attemptedIds.size < accounts.length) {
    const account = accountId
      ? getCloudinaryAccount(accountId)
      : selectCloudinaryAccount(attemptedIds);
    if (!account || attemptedIds.has(account.id)) break;
    attemptedIds.add(account.id);

    try {
      await assertCloudinaryUploadCapacity(account);
      const result = await withConfiguredCloudinary(account, () => operation(account));
      accountQuotaCache.delete(account.id);
      return result;
    } catch (error) {
      const normalizedError = normalizeCloudinaryError(
        error,
        `Cloudinary account ${account.id} upload operation failed`,
      );
      if (/disabled customer/i.test(normalizedError.message)) {
        throw new Error(
          `Cloudinary account ${account.id} is disabled ("disabled customer"). Check ${getCloudinaryAccountEnvPrefix(account.id)} credentials or re-enable the account.`,
          { cause: normalizedError },
        );
      }
      const shouldRotate = normalizedError.code === 'CLOUDINARY_QUOTA_NEAR_LIMIT'
        || isCloudinaryRateLimitError(normalizedError);
      if (!shouldRotate || accountId) throw normalizedError;

      accountCooldowns.set(account.id, Date.now() + CLOUDINARY_ROTATION_COOLDOWN_MS);
      accountQuotaCache.delete(account.id);
      lastRotationError = normalizedError;
    }
  }

  throw lastRotationError || new Error('No Cloudinary account with upload capacity is available');
};

const invalidateCloudinaryQuota = (accountId) => {
  if (accountId) accountQuotaCache.delete(String(accountId));
};

const resetCloudinaryRuntimeState = () => {
  accountCursor = 0;
  accountCooldowns.clear();
  accountQuotaCache.clear();
};

const getCloudinaryAccountIdForUrl = (url) => {
  try {
    const hostname = new URL(url).hostname;
    const cloudName = hostname === 'res.cloudinary.com'
      ? new URL(url).pathname.split('/').filter(Boolean)[0]
      : null;
    return getCloudinaryAccounts().find(account => account.cloudName === cloudName)?.id || null;
  } catch {
    return null;
  }
};

const getCloudinaryQuota = async (account, { force = false } = {}) => {
  const cacheKey = getCloudinaryQuotaCacheKey(account);
  const cached = accountQuotaCache.get(cacheKey);
  if (!force && cached && cached.expiresAt > Date.now()) return cached.value;

  let usage;
  try {
    usage = await withConfiguredCloudinary(account, () => cloudinary.api.usage());
  } catch (error) {
    throw normalizeCloudinaryError(
      error,
      `Cloudinary account ${account.id} usage check failed`,
    );
  }

  const usedCredits = Number(usage?.credits?.usage);
  const limitCredits = Number(usage?.credits?.limit);
  if (!Number.isFinite(usedCredits) || !Number.isFinite(limitCredits) || limitCredits <= 0) {
    throw new Error(`Cloudinary account ${account.id} returned invalid credits usage metadata`);
  }

  const quota = {
    usedCredits,
    limitCredits,
    usedPercent: (usedCredits / limitCredits) * 100,
    thresholdPercent: getCloudinaryQuotaThresholdPercent(),
  };
  accountQuotaCache.set(cacheKey, {
    value: quota,
    expiresAt: Date.now() + CLOUDINARY_QUOTA_CACHE_TTL_MS,
  });
  return quota;
};

const assertCloudinaryUploadCapacity = async (account) => {
  const quota = await getCloudinaryQuota(account);
  if (quota.usedPercent >= quota.thresholdPercent) {
    accountCooldowns.set(account.id, Date.now() + CLOUDINARY_ROTATION_COOLDOWN_MS);
    logCloudinaryQuotaRotation(account, quota);
    throw createCloudinaryQuotaError(account, quota);
  }
  return quota;
};

const getCloudinaryUploadAccount = async (excludedAccountIds = []) => {
  const excluded = new Set(excludedAccountIds.map(String));
  const accounts = getCloudinaryAccounts();
  const now = Date.now();

  for (let offset = 0; offset < accounts.length; offset += 1) {
    const index = (accountCursor + offset) % accounts.length;
    const account = accounts[index];
    if (excluded.has(account.id) || (accountCooldowns.get(account.id) || 0) > now) continue;

    let quota;
    try {
      quota = await getCloudinaryQuota(account);
    } catch (error) {
      const normalizedError = normalizeCloudinaryError(
        error,
        `Cloudinary account ${account.id} usage check failed`,
      );
      if (!isCloudinaryRateLimitError(normalizedError)) throw normalizedError;
      accountCooldowns.set(account.id, Date.now() + CLOUDINARY_ROTATION_COOLDOWN_MS);
      excluded.add(account.id);
      continue;
    }

    if (quota.usedPercent >= quota.thresholdPercent) {
      accountCooldowns.set(account.id, Date.now() + CLOUDINARY_ROTATION_COOLDOWN_MS);
      excluded.add(account.id);
      logCloudinaryQuotaRotation(account, quota);
      continue;
    }

    accountCursor = (index + 1) % accounts.length;
    return { ...account, quota };
  }

  return null;
};

const signCloudinaryUploadParams = (params, accountId) => {
  const account = getCloudinaryAccount(accountId);
  if (!account?.apiSecret) throw new Error('Cloudinary account is not configured');
  return cloudinary.utils.api_sign_request(params, account.apiSecret);
};

const ALLOWED_IMAGE_FORMATS = ['jpeg', 'jpg', 'png', 'webp', 'gif'];
const MAX_IMAGE_BYTES = MAX_IMAGE_ASSET_BYTES;

const isSupportedImageBuffer = (fileBuffer) => {
  if (!Buffer.isBuffer(fileBuffer) || fileBuffer.length < 12 || fileBuffer.length > MAX_IMAGE_BYTES) return false;

  const isJpeg = fileBuffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  const isPng = fileBuffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isGif = fileBuffer.subarray(0, 6).toString('ascii') === 'GIF87a'
    || fileBuffer.subarray(0, 6).toString('ascii') === 'GIF89a';
  const isWebp = fileBuffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && fileBuffer.subarray(8, 12).toString('ascii') === 'WEBP';

  return isJpeg || isPng || isGif || isWebp;
};

const getCloudinaryUploadIdentity = (folder, publicId) => (
  publicId && publicId.startsWith('laptop-store/')
    ? { public_id: publicId }
    : {
      folder: `laptop-store/${folder}`,
      public_id: publicId || undefined,
    }
);

const isValidImageResource = (resource) => {
  const minDimension = 50;
  const maxDimension = 10000;

  return resource.resource_type === 'image'
    && Number.isFinite(resource.width)
    && Number.isFinite(resource.height)
    && resource.width >= minDimension
    && resource.width <= maxDimension
    && resource.height >= minDimension
    && resource.height <= maxDimension
    && Number.isFinite(resource.bytes)
    && resource.bytes > 0
    && resource.bytes <= MAX_IMAGE_BYTES
    && ALLOWED_IMAGE_FORMATS.includes(String(resource.format).toLowerCase());
};

const primaryCloudinaryAccount = getCloudinaryAccount('1');
if (primaryCloudinaryAccount) configureCloudinaryAccount(primaryCloudinaryAccount);

/**
 * Upload file lên Cloudinary từ buffer (Multer)
 * 
 * @param {Buffer} fileBuffer - File content từ req.file.buffer
 * @param {String} folder - Folder trong Cloudinary (admins, users, reviews)
 * @param {String} publicId - Public ID cho file (optional)
 * @returns {Promise<Object>} - { url, publicId, format }
 */
const uploadToCloudinary = async (fileBuffer, folder = 'admins', publicId = null, accountId = null) => {
  if (!isSupportedImageBuffer(fileBuffer)) {
    throw new Error('Unsupported image content');
  }

  return runCloudinaryUploadOperation((account) => new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        ...getCloudinaryUploadIdentity(folder, publicId),
        overwrite: Boolean(publicId),
        invalidate: Boolean(publicId),
        resource_type: 'image',
        quality: 'auto',
        fetch_format: 'auto',
        timeout: 30000,
      },
      async (error, result) => {
        if (error) {
          if (process.env.NODE_ENV === 'development') {
            console.error('[CLOUDINARY_ERROR]', {
              accountId: account.id,
              name: error?.name,
              message: error?.message,
              httpCode: error?.http_code,
              stack: error?.stack,
            });
          }
          reject(error);
          return;
        }

        if (!isValidImageResource(result)) {
          try {
            await cloudinary.uploader.destroy(result.public_id, { resource_type: 'image' });
          } catch (cleanupError) {
            if (process.env.NODE_ENV === 'development') {
              console.error('[CLOUDINARY_INVALID_UPLOAD_CLEANUP_ERROR]', cleanupError);
            }
          }
          reject(new Error('Cloudinary image metadata is invalid'));
          return;
        }

        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          format: result.format,
          width: result.width,
          height: result.height,
          bytes: result.bytes,
          cloudinaryAccountId: account.id,
          cloudName: account.cloudName,
        });
      }
    );

    uploadStream.end(fileBuffer);
  }), accountId);
};

/**
 * Upload file lên Cloudinary từ file path (local or URL)
 * Hữu ích cho migration từ local storage
 * 
 * @param {String} filePath - Path/URL của file
 * @param {String} folder - Folder trong Cloudinary
 * @param {String|null} publicId - Public ID ổn định để ghi đè asset khi cần
 * @returns {Promise<Object>} - { url, publicId, format }
 */
const downloadRemoteImage = async (sourceUrl) => {
  const response = await fetchSafeRemoteImage(sourceUrl, {
    headers: {
      Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'User-Agent': 'Mozilla/5.0 (compatible; LaptopStoreSeeder/1.0)',
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`Remote image request failed with status ${response.status}`);
  }

  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
    throw new Error('Remote image exceeds the 5 MB limit');
  }

  if (!response.body) {
    throw new Error('Remote image response has no body');
  }

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    totalBytes += value.byteLength;
    if (totalBytes > MAX_IMAGE_BYTES) {
      await reader.cancel();
      throw new Error('Remote image exceeds the 5 MB limit');
    }
    chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks, totalBytes);
};

const uploadFileToCloudinary = async (filePath, folder = 'admins', publicId = null) => {
  try {
    if (/^https?:\/\//i.test(String(filePath || '').trim())) {
      const uploadedImage = await uploadToCloudinary(
        await downloadRemoteImage(filePath),
        folder,
        publicId
      );
      return {
        url: uploadedImage.url,
        publicId: uploadedImage.publicId,
        format: uploadedImage.format,
        width: uploadedImage.width,
        height: uploadedImage.height,
        bytes: uploadedImage.bytes,
        cloudinaryAccountId: uploadedImage.cloudinaryAccountId,
        cloudName: uploadedImage.cloudName,
      };
    }

    return runCloudinaryUploadOperation(async (account) => {
      const result = await cloudinary.uploader.upload(filePath, {
        ...getCloudinaryUploadIdentity(folder, publicId),
        overwrite: Boolean(publicId),
        invalidate: Boolean(publicId),
        resource_type: 'image',
        quality: 'auto',
        fetch_format: 'auto',
      });

      if (!isValidImageResource(result)) {
        await cloudinary.uploader.destroy(result.public_id, { resource_type: 'image' });
        throw new Error('Cloudinary image metadata is invalid');
      }

      return {
        url: result.secure_url,
        publicId: result.public_id,
        format: result.format,
        width: result.width,
        height: result.height,
        bytes: result.bytes,
        cloudinaryAccountId: account.id,
        cloudName: account.cloudName,
      };
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[CLOUDINARY_UPLOAD_ERROR]', {
        name: error?.name,
        message: error?.message,
        httpCode: error?.http_code,
        stack: error?.stack,
      });
    }
    throw error;
  }
};

const uploadVideoFileToCloudinary = async (filePath, publicId = null) => (
  runCloudinaryUploadOperation(async (account) => {
    const result = await cloudinary.uploader.upload(filePath, {
      ...getCloudinaryUploadIdentity('about', publicId),
      overwrite: Boolean(publicId),
      invalidate: Boolean(publicId),
      resource_type: 'video',
      unique_filename: false,
    });

    if (result.resource_type !== 'video' || !result.secure_url || !Number.isFinite(result.bytes) || result.bytes <= 0) {
      throw new Error('Cloudinary video metadata is invalid');
    }

    return {
      url: result.secure_url,
      publicId: result.public_id,
      format: result.format,
      width: result.width,
      height: result.height,
      bytes: result.bytes,
      resourceType: result.resource_type,
      cloudinaryAccountId: account.id,
      cloudName: account.cloudName,
    };
  })
);

/**
 * Delete file từ Cloudinary
 * 
 * @param {String} publicId - Public ID của file trong Cloudinary
 * @returns {Promise<Object>} - { result, deleted: true/false }
 */
const deleteFromCloudinary = async (publicId, accountId = null, url = null) => {
  try {
    if (!publicId) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[CLOUDINARY_DELETE] No publicId provided');
      }
      return { deleted: false };
    }

    const resolvedAccountId = accountId || getCloudinaryAccountIdForUrl(url) || '1';
    const result = await runCloudinaryOperation(
      () => cloudinary.uploader.destroy(publicId),
      resolvedAccountId,
    );

    if (result.result === 'ok') {
      return { deleted: true, result };
    } else {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[CLOUDINARY_DELETE_WARNING]', { publicId, accountId: resolvedAccountId, result });
      }
      return { deleted: false, result };
    }
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[CLOUDINARY_DELETE_ERROR]', error);
    }
    throw error;
  }
};

/**
 * Delete multiple files từ Cloudinary
 * 
 * @param {Array<String>} publicIds - Array của public IDs
 * @returns {Promise<Object>} - { deleted: number, failed: number, errors: [] }
 */
const deleteMultipleFromCloudinary = async (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    return { deleted: 0, failed: 0, errors: [] };
  }

  let deleted = 0;
  let failed = 0;
  const errors = [];

  for (const item of items) {
    const metadata = typeof item === 'string' ? { publicId: item } : item;
    const publicId = metadata?.publicId;
    try {
      const result = await deleteFromCloudinary(publicId, metadata?.accountId, metadata?.url);
      if (result.deleted) {
        deleted++;
      } else {
        failed++;
      }
    } catch (error) {
      failed++;
      errors.push({ publicId, error: error.message });
    }
  }

  return { deleted, failed, errors };
};

const deleteCloudinaryResourcesByPrefix = async (prefix = 'laptop-store/') => {
  const accounts = getCloudinaryAccounts();
  if (accounts.length === 0) throw new Error('No Cloudinary account is configured');

  const totals = {
    deleted: 0,
    failed: 0,
    accounts: [],
  };

  for (const account of accounts) {
    const accountResult = {
      accountId: account.id,
      deleted: 0,
      resourceTypes: {},
    };

    for (const resourceType of ['image', 'video', 'raw']) {
      let nextCursor;
      let deleted = 0;

      do {
        let resources;
        try {
          resources = await runCloudinaryOperation(
            () => cloudinary.api.resources({
              resource_type: resourceType,
              type: 'upload',
              prefix,
              max_results: 500,
              ...(nextCursor ? { next_cursor: nextCursor } : {}),
            }),
            account.id,
          );
        } catch (error) {
          throw new Error(
            `Cloudinary account ${account.id} resource listing failed for ${resourceType}: ${normalizeCloudinaryError(error).message}`,
            { cause: error },
          );
        }

        const publicIds = resources.resources.map(resource => resource.public_id);
        for (let index = 0; index < publicIds.length; index += 100) {
          const batch = publicIds.slice(index, index + 100);
          let result;
          try {
            result = await runCloudinaryOperation(
              () => cloudinary.api.delete_resources(batch, {
                resource_type: resourceType,
                type: 'upload',
                invalidate: true,
              }),
              account.id,
            );
          } catch (error) {
            throw new Error(
              `Cloudinary account ${account.id} deletion failed for ${resourceType}: ${normalizeCloudinaryError(error).message}`,
              { cause: error },
            );
          }
          deleted += Object.keys(result.deleted || {}).length;
        }

        nextCursor = resources.next_cursor;
      } while (nextCursor);

      accountResult.resourceTypes[resourceType] = deleted;
      accountResult.deleted += deleted;
      totals.deleted += deleted;
    }

    totals.accounts.push(accountResult);
  }

  return totals;
};

const deleteCloudinaryImagesByPrefix = async (prefix, accountId = '1') => (
  runCloudinaryOperation(async () => {
    let nextCursor;
    let deleted = 0;

    do {
      const resources = await cloudinary.api.resources({
        resource_type: 'image',
        type: 'upload',
        prefix,
        max_results: 500,
        ...(nextCursor ? { next_cursor: nextCursor } : {}),
      });

      const publicIds = resources.resources.map(resource => resource.public_id);
      for (let index = 0; index < publicIds.length; index += 100) {
        const batch = publicIds.slice(index, index + 100);
        const result = await cloudinary.api.delete_resources(batch, {
          resource_type: 'image',
          type: 'upload',
          invalidate: true,
        });
        deleted += Object.keys(result.deleted || {}).length;
      }

      nextCursor = resources.next_cursor;
    } while (nextCursor);

    return { deleted };
  }, accountId)
);

/**
 * Kiểm tra xem URL có phải từ Cloudinary không
 * Dùng để phân biệt URL CDN bên ngoài với URL Cloudinary mới
 * 
 * @param {String} url - Image URL
 * @returns {Boolean}
 */
const isCloudinaryUrl = (url) => {
  if (typeof url !== 'string' || !url.trim()) return false;

  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname === 'cloudinary.com' || hostname.endsWith('.cloudinary.com');
  } catch {
    return false;
  }
};

/**
 * Extract public ID từ Cloudinary URL
 * 
 * @param {String} cloudinaryUrl - URL từ Cloudinary (https://res.cloudinary.com/.../...)
 * @returns {String} - Public ID (folder/filename)
 */
const getCloudinaryResource = async (publicId, accountId = '1', resourceType = 'image') => (
  runCloudinaryOperation(
    () => cloudinary.api.resource(publicId, { resource_type: resourceType }),
    accountId,
  )
);

const validateCloudinaryImage = async ({ publicId, url, accountId = null, allowedFolders = ['admins', 'users', 'reviewers', 'banners'] }) => {
  if (!publicId || !url) {
    throw new Error('Cloudinary image metadata is required');
  }

  const resolvedAccountId = accountId || getCloudinaryAccountIdForUrl(url) || '1';
  const resource = await getCloudinaryResource(publicId, resolvedAccountId);
  const folderPrefix = 'laptop-store/';
  const isAllowedResource = resource.resource_type === 'image'
    && resource.public_id.startsWith(folderPrefix)
    && allowedFolders.some((folder) => resource.public_id.startsWith(`${folderPrefix}${folder}/`));

  if (!isAllowedResource || resource.secure_url !== url) {
    throw new Error('Cloudinary image resource is invalid');
  }

  if (!isValidImageResource(resource)) {
    throw new Error('Cloudinary image metadata is invalid');
  }

  return resource;
};

const extractPublicIdFromUrl = (cloudinaryUrl) => {
  try {
    // URL format: https://res.cloudinary.com/{cloud_name}/image/upload/{public_id}.{format}
    // Extract: folder/filename
    const match = cloudinaryUrl.match(/\/upload\/(.+?)\.\w+$/);
    return match ? match[1] : null;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[CLOUDINARY_EXTRACT_ID]', error);
    }
    return null;
  }
};

module.exports = {
  getCloudinaryUploadAccount,
  invalidateCloudinaryQuota,
  resetCloudinaryRuntimeState,
  signCloudinaryUploadParams,
  getCloudinaryAccountIdForUrl,
  uploadToCloudinary,
  uploadFileToCloudinary,
  uploadVideoFileToCloudinary,
  deleteFromCloudinary,
  deleteMultipleFromCloudinary,
  deleteCloudinaryImagesByPrefix,
  deleteCloudinaryResourcesByPrefix,
  isCloudinaryUrl,
  extractPublicIdFromUrl,
  getCloudinaryResource,
  validateCloudinaryImage,
};
