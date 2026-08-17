const crypto = require('crypto');
const {
  deleteMultipleFromCloudinary,
  extractPublicIdFromUrl,
  getCloudinaryResource,
  isCloudinaryUrl,
  uploadToCloudinary,
} = require('../../services/cloudinaryService');

const ALLOWED_HOSTS = new Set(['tikicdn.com']);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15000;
const MAX_ATTEMPTS = 3;
const CONCURRENCY = 4;

const isAllowedTikiHost = (hostname) => (
  ALLOWED_HOSTS.has(hostname) || hostname.endsWith('.tikicdn.com')
);

const getImageUrl = (value) => {
  try {
    const url = new URL(String(value));
    if (url.protocol !== 'https:' || !isAllowedTikiHost(url.hostname)) {
      throw new Error('TIKI_IMAGE_URL_NOT_ALLOWED');
    }
    return url.toString();
  } catch (error) {
    if (error.message === 'TIKI_IMAGE_URL_NOT_ALLOWED') throw error;
    throw new Error('TIKI_IMAGE_URL_INVALID');
  }
};

const readResponseBuffer = async (response) => {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
    throw new Error('TIKI_IMAGE_TOO_LARGE');
  }

  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of response.body) {
    totalBytes += chunk.length;
    if (totalBytes > MAX_IMAGE_BYTES) throw new Error('TIKI_IMAGE_TOO_LARGE');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};

const fetchImageBuffer = async (value) => {
  const url = getImageUrl(value);
  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        headers: { Accept: 'image/*' },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`TIKI_IMAGE_FETCH_HTTP_${response.status}`);
      const contentType = String(response.headers.get('content-type') || '').toLowerCase();
      if (contentType && !contentType.startsWith('image/')) throw new Error('TIKI_IMAGE_CONTENT_TYPE_INVALID');
      return await readResponseBuffer(response);
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) await new Promise(resolve => setTimeout(resolve, 250 * 2 ** (attempt - 1)));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError;
};

const getPublicId = (sourceId, imageIndex, imageUrl) => {
  const sourceHash = crypto.createHash('sha256').update(String(sourceId)).digest('hex').slice(0, 24);
  const imageHash = crypto.createHash('sha256').update(imageUrl).digest('hex').slice(0, 16);
  return `tiki-${sourceHash}-${imageIndex}-${imageHash}`;
};

const findExistingAsset = async (publicId) => {
  try {
    const resource = await getCloudinaryResource(`laptop-store/tiki/products/${publicId}`);
    if (resource.resource_type !== 'image' || !resource.secure_url) return null;
    return { url: resource.secure_url, publicId: resource.public_id, reused: true };
  } catch (error) {
    return null;
  }
};

const uploadImage = async (imageUrl, sourceId, imageIndex, existingPublicId = null) => {
  if (isCloudinaryUrl(imageUrl)) {
    const publicId = existingPublicId || extractPublicIdFromUrl(imageUrl);
    if (!publicId) throw new Error('CLOUDINARY_IMAGE_PUBLIC_ID_INVALID');
    return { url: imageUrl, publicId, reused: true };
  }

  const normalizedUrl = getImageUrl(imageUrl);
  const publicId = getPublicId(sourceId, imageIndex, normalizedUrl);
  const existing = await findExistingAsset(publicId);
  if (existing) return existing;

  const buffer = await fetchImageBuffer(normalizedUrl);
  const result = await uploadToCloudinary(buffer, 'tiki/products', publicId);
  return { ...result, reused: false };
};

const mapWithConcurrency = async (items, mapper) => {
  const results = new Array(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
  return results;
};

const prepareTikiProductImages = async (products) => {
  const createdPublicIds = [];
  const uploadProducts = products.filter(product => (
    String(product.source || '').toUpperCase() === 'TIKI'
  ));

  try {
    const prepared = await mapWithConcurrency(products, async (product) => {
      if (String(product.source || '').toUpperCase() !== 'TIKI') return product;

      const imageUrls = Array.isArray(product.images) && product.images.length > 0
        ? product.images
        : [product.image];
      const assets = await mapWithConcurrency(imageUrls, (url, index) => (
        uploadImage(
          url,
          product.sourceId,
          index,
          product.imagePublicIds?.[index] || (index === 0 ? product.imagePublicId : null)
        )
      ));
      assets.forEach(asset => {
        if (!asset.reused) createdPublicIds.push(asset.publicId);
      });

      const preparedProduct = {
        ...product,
        image: assets[0].url,
        images: assets.map(asset => asset.url),
        imagePublicId: assets[0].publicId,
        imagePublicIds: assets.map(asset => asset.publicId),
      };
      Object.defineProperty(preparedProduct, '__createdCloudinaryPublicIds', {
        value: assets.filter(asset => !asset.reused).map(asset => asset.publicId),
        enumerable: false,
      });
      return preparedProduct;
    });

    return {
      products: prepared,
      createdPublicIds,
      summary: {
        productsProcessed: uploadProducts.length,
        imagesUploaded: createdPublicIds.length,
        imagesReused: prepared
          .filter(product => String(product.source || '').toUpperCase() === 'TIKI')
          .reduce((count, product) => count + (product.imagePublicIds?.length || 0), 0) - createdPublicIds.length,
      },
    };
  } catch (error) {
    await deleteMultipleFromCloudinary(createdPublicIds);
    throw error;
  }
};

module.exports = {
  getImageUrl,
  prepareTikiProductImages,
};
