const fs = require('fs');
const path = require('path');
const ImportAdapterManager = require('../utils/importAdapters/ImportAdapterManager');
const {
  getProductDataDirectory,
  runScraper,
  uploadProductImages,
} = require('../seeds/productSeedPipeline');

const getArgument = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
};

const getRecentJsonFiles = (directory, startedAt) => fs.readdirSync(directory, { withFileTypes: true })
  .filter(entry => entry.isFile() && path.extname(entry.name).toLowerCase() === '.json')
  .map(entry => path.join(directory, entry.name))
  .filter(filePath => fs.statSync(filePath).mtimeMs >= startedAt)
  .sort();

const toManifestAsset = ({ asset, role, position, sourcePath }) => ({
  role,
  position,
  sourcePath: sourcePath || asset?.sourceUrl || null,
  url: asset?.publicUrl || asset?.url || null,
  storageProvider: asset?.storageProvider || null,
  storageAccount: asset?.storageAccount || null,
  bucket: asset?.bucket || null,
  storageKey: asset?.storageKey || null,
  asset,
});

const buildImageManifest = (product, uploadedProduct) => ({
  productId: product.productId || null,
  sku: product.sku || null,
  url: product.sourceUrl || null,
  name: product.name,
  image: toManifestAsset({
    role: 'main',
    position: 0,
    sourcePath: product.image,
    asset: uploadedProduct.imageAsset,
  }),
  gallery: (uploadedProduct.imageAssets || []).map((asset, index) => toManifestAsset({
    role: 'gallery',
    position: index,
    sourcePath: asset?.sourceUrl || null,
    asset,
  })),
  description: (uploadedProduct.descriptionImages || []).map((entry, index) => toManifestAsset({
    role: 'description',
    position: index,
    sourcePath: entry?.sourceUrl || entry?.url || null,
    asset: entry,
  })),
  status: 'uploaded',
});

const normalizeGallery = (value) => {
  if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean);
  if (typeof value !== 'string') return [];
  return value.replaceAll('||', '|').split('|').map(item => item.trim()).filter(Boolean);
};

const uploadFileImages = async (filePath, manager) => {
  const products = (await manager.parse(fs.readFileSync(filePath, 'utf8'), 'json')).map(product => ({
    ...product,
    images: normalizeGallery(product.images),
  }));
  const uploadedProducts = [];
  const failures = [];

  for (const product of products) {
    try {
      const uploadedProduct = await uploadProductImages(product);
      uploadedProducts.push(buildImageManifest(product, uploadedProduct));
    } catch (error) {
      failures.push({
        sku: product.sku || null,
        url: product.sourceUrl || null,
        name: product.name,
        sourcePath: product.image,
        error: error.message,
      });
      console.error(`[MediaUpload] Failed main image for "${product.name}": ${error.message}`);
    }
  }

  return { uploadedProducts, failures };
};

const main = async () => {
  const scrapeTarget = getArgument('--target') || 'all';
  const outputDirectory = getProductDataDirectory();
  const startedAt = Date.now() - 1000;

  await runScraper(scrapeTarget);
  const files = getRecentJsonFiles(outputDirectory, startedAt);
  if (files.length === 0) {
    throw new Error(`Không tìm thấy JSON sản phẩm mới trong: ${outputDirectory}`);
  }

  const manager = new ImportAdapterManager();
  const allFailures = [];

  for (const filePath of files) {
    const result = await uploadFileImages(filePath, manager);
    allFailures.push(...result.failures);

    const manifestPath = path.join(
      outputDirectory,
      'manifests',
      `${path.basename(filePath, path.extname(filePath))}.r2.json`
    );
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        file: path.basename(filePath),
        uploadedAt: new Date().toISOString(),
        products: result.uploadedProducts,
        failures: result.failures,
      }, null, 2),
      'utf8'
    );
    console.log(`[MediaUpload] ${path.basename(filePath)}: ${result.uploadedProducts.length} uploaded, ${result.failures.length} failed`);
  }

  if (allFailures.length > 0) {
    throw new Error(`${allFailures.length} main product image(s) failed to upload`);
  }
};

main().catch((error) => {
  console.error(`[MediaUpload] ${error.message}`);
  process.exitCode = 1;
});
