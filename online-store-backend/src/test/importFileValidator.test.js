const chai = require('chai');
const expect = chai.expect;
const fs = require('fs');
const os = require('os');
const path = require('path');
const { validateImportFile } = require('../utils/fileUtils');
const { validateImageUpload } = require('../middleware/uploadValidationMiddleware');
const JSONAdapter = require('../utils/importAdapters/JSONAdapter');
const CSVAdapter = require('../utils/importAdapters/CSVAdapter');
const {
  buildUpsertProductUpdate,
  serializeProductForExport,
  convertProductsToCSV,
  writeExportZipFile,
  getExportProductBatchFilter,
} = require('../controllers/productImportController');
const {
  getProductImagePublicId,
  uploadProductImage,
  assignInitialHighlights,
  getInitialStock,
} = require('../seeds/productSeedPipeline');

describe('Product export serialization', () => {
  it('advances export batches with an exclusive _id boundary', () => {
    const exportFilter = { isDeleted: false, category: { $in: ['category-id'] } };
    const lastId = 'product-id-250';

    expect(getExportProductBatchFilter(exportFilter)).to.equal(exportFilter);
    expect(getExportProductBatchFilter(exportFilter, lastId)).to.deep.equal({
      ...exportFilter,
      _id: { $gt: lastId },
    });
  });

  const product = {
    _id: { toString: () => 'product-id' },
    category: {
      _id: { toString: () => 'category-id' },
      name: 'Keyboard',
    },
    name: 'Keyboard Pro',
    brand: 'Brand',
    image: 'https://example.invalid/main.jpg',
    images: ['https://example.invalid/main.jpg', 'https://example.invalid/gallery.jpg'],
    imagePublicId: 'products/main',
    imagePublicIds: ['products/main', 'products/gallery'],
    customField: 'preserved',
    deal: { discount: 0 },
    user: 'internal-user-id',
    reviews: ['internal-review-id'],
    isDeleted: false,
    storefrontReady: true,
    storefrontReadinessCheckedAt: '2026-04-01T00:00:00.000Z',
  };

  it('preserves all product fields and all image data', () => {
    const exported = serializeProductForExport(product);

    expect(exported).to.include({
      productId: 'product-id',
      categoryId: 'category-id',
      category: 'Keyboard',
      customField: 'preserved',
    });
    expect(exported.images.map(image => image.url)).to.deep.equal(product.images);
    expect(exported.imagePublicIds).to.deep.equal(product.imagePublicIds);
    expect(exported).to.include({
      user: 'internal-user-id',
      isDeleted: false,
      storefrontReady: true,
      storefrontReadinessCheckedAt: '2026-04-01T00:00:00.000Z',
    });
    expect(exported.reviews).to.deep.equal(['internal-review-id']);
  });

  it('includes the main image when the gallery only contains attached images', () => {
    const exported = serializeProductForExport({
      ...product,
      images: ['https://example.invalid/gallery.jpg'],
      imagePublicIds: ['products/gallery'],
    });

    expect(exported.images.map(image => image.url)).to.deep.equal([
      'https://example.invalid/main.jpg',
      'https://example.invalid/gallery.jpg',
    ]);
    expect(exported.imagePublicIds).to.deep.equal(['products/main', 'products/gallery']);
  });

  it('writes a completed JSON ZIP file', async () => {
    const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'online-store-export-test-'));
    const filePath = path.join(directory, 'products-export.zip');

    try {
      await writeExportZipFile(filePath, { products: [{ productId: 'product-id' }] }, 'json');
      const archive = await fs.promises.readFile(filePath);

      expect(archive.subarray(0, 2).toString()).to.equal('PK');
      expect(archive.length).to.be.greaterThan(0);
    } finally {
      await fs.promises.rm(directory, { recursive: true, force: true });
    }
  });

  it('keeps the ZIP valid when a remote image cannot be downloaded', async () => {
    const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'online-store-export-test-'));
    const filePath = path.join(directory, 'products-export.zip');
    const originalFetch = global.fetch;
    global.fetch = async () => {
      throw new Error('remote image unavailable');
    };

    try {
      await writeExportZipFile(filePath, {
        products: [{
          productId: 'product-id',
          images: [{
            url: 'https://missing-image.invalid/missing.jpg',
            position: 0,
            type: 'main',
          }],
        }],
      }, 'json');
      const archive = await fs.promises.readFile(filePath);

      expect(archive.subarray(0, 2).toString()).to.equal('PK');
      expect(archive.length).to.be.greaterThan(0);
    } finally {
      global.fetch = originalFetch;
      await fs.promises.rm(directory, { recursive: true, force: true });
    }
  });

  it('retries a transient remote image failure before adding the asset', async () => {
    const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'online-store-export-test-'));
    const filePath = path.join(directory, 'products-export.zip');
    const originalFetch = global.fetch;
    let fetchAttempts = 0;
    global.fetch = async () => {
      fetchAttempts += 1;
      if (fetchAttempts === 1) throw new Error('temporary remote image failure');
      return new Response(Buffer.from([0xff, 0xd8, 0xff, 0xd9]), {
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
      });
    };

    try {
      await writeExportZipFile(filePath, {
        products: [{
          productId: 'product-id',
          images: [{
            url: 'https://example.invalid/retry.jpg',
            position: 0,
            type: 'main',
          }],
        }],
      }, 'json');

      expect(fetchAttempts).to.equal(2);
      const archive = await fs.promises.readFile(filePath);
      expect(archive.length).to.be.greaterThan(0);
    } finally {
      global.fetch = originalFetch;
      await fs.promises.rm(directory, { recursive: true, force: true });
    }
  });

  it('retries a transient HTTP image failure before adding the asset', async () => {
    const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'online-store-export-test-'));
    const filePath = path.join(directory, 'products-export.zip');
    const originalFetch = global.fetch;
    let fetchAttempts = 0;
    global.fetch = async () => {
      fetchAttempts += 1;
      if (fetchAttempts === 1) {
        return new Response('temporarily unavailable', { status: 503 });
      }
      return new Response(Buffer.from([0xff, 0xd8, 0xff, 0xd9]), {
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
      });
    };

    try {
      await writeExportZipFile(filePath, {
        products: [{
          productId: 'product-id',
          images: [{
            url: 'https://example.invalid/http-retry.jpg',
            position: 0,
            type: 'main',
          }],
        }],
      }, 'json');

      expect(fetchAttempts).to.equal(2);
    } finally {
      global.fetch = originalFetch;
      await fs.promises.rm(directory, { recursive: true, force: true });
    }
  });

  it('includes dynamic fields and gallery images in CSV output', () => {
    const csv = convertProductsToCSV([serializeProductForExport(product)]);

    expect(csv).to.include('images');
    expect(csv).to.include('imagePublicIds');
    expect(csv).to.include('customField');
    expect(csv).to.include('https://example.invalid/main.jpg|https://example.invalid/gallery.jpg');
    expect(csv).to.include('products/main|products/gallery');
  });
});

describe('Import file validation', () => {
  const createFile = (content, originalname, mimetype) => ({
    buffer: Buffer.from(content, 'utf8'),
    originalname,
    mimetype,
  });

  it('accepts JSON content with matching metadata', () => {
    const result = validateImportFile(
      createFile('[{"name":"Laptop"}]', 'products.json', 'application/json'),
      'json'
    );

    expect(result.format).to.equal('json');
  });

  it('rejects a CSV payload disguised as JSON', () => {
    expect(() => validateImportFile(
      createFile('name,price\nLaptop,1000', 'products.json', 'application/json'),
      'json'
    )).to.throw('IMPORT_FILE_CONTENT_INVALID');
  });

  it('rejects a JSON payload disguised as CSV', () => {
    expect(() => validateImportFile(
      createFile('[{"name":"Laptop"}]', 'products.csv', 'text/csv'),
      'csv'
    )).to.throw('IMPORT_FILE_CONTENT_INVALID');
  });

  it('rejects mismatched extension and MIME type', () => {
    expect(() => validateImportFile(
      createFile('[{"name":"Laptop"}]', 'products.csv', 'application/json'),
      'json'
    )).to.throw('IMPORT_FILE_TYPE_MISMATCH');
  });

  it('rejects binary content', () => {
    expect(() => validateImportFile({
      buffer: Buffer.from([0x00, 0xff, 0xd8, 0xff]),
      originalname: 'products.json',
      mimetype: 'application/json',
    }, 'json')).to.throw('IMPORT_FILE_CONTENT_INVALID');
  });
});

describe('Dynamic spec key import', () => {
  it('keeps unknown spec columns for automatic registration during import', async () => {
    const products = await new CSVAdapter().parse([
      'name,brand,price,category,specs_battery_life_hours',
      'Laptop,Brand,1000,Keyboard,80 hours',
    ].join('\n'));

    expect(products[0].specs).to.deep.equal({ battery_life_hours: '80 hours' });
  });
});

describe('Seed initial stock configuration', () => {
  const originalInitialStock = process.env.SEED_INITIAL_STOCK;

  afterEach(() => {
    if (originalInitialStock === undefined) {
      delete process.env.SEED_INITIAL_STOCK;
      return;
    }
    process.env.SEED_INITIAL_STOCK = originalInitialStock;
  });

  it('reads a non-negative integer from SEED_INITIAL_STOCK', () => {
    process.env.SEED_INITIAL_STOCK = '25';

    expect(getInitialStock()).to.equal(25);
  });

  it('rejects an invalid SEED_INITIAL_STOCK value', () => {
    process.env.SEED_INITIAL_STOCK = '-1';

    expect(getInitialStock).to.throw('SEED_INITIAL_STOCK phải là số nguyên không âm');
  });

  it('preserves existing stock during seed upsert', () => {
    const product = { productId: 'product-id', name: 'Keyboard', countInStock: 25 };

    expect(buildUpsertProductUpdate(product, true)).to.deep.equal({ name: 'Keyboard' });
    expect(buildUpsertProductUpdate(product, false)).to.deep.equal({ name: 'Keyboard', countInStock: 25 });
  });
});

describe('Crawler product field mapping', () => {
  it('uses configured initial stock for crawler products marked in stock', async () => {
    const rawProduct = {
      Brand: 'Razer',
      ID: 'source-id-stock-config',
      Name: 'Configured stock product',
      SKU: 'SKU-STOCK-CONFIG',
      Price_VND: 100000,
      Regular_Price: 120000,
      InStock: 'In Stock',
      Categories: 'Mouse',
      Attributes: '{}',
      Description: 'Source description',
      MainImage: 'https://example.invalid/main.jpg',
      GalleryImages: [],
      URL: 'https://example.invalid/stock-config',
    };

    const [normalized] = await new JSONAdapter({ initialStock: 25 }).parse(JSON.stringify([rawProduct]));

    expect(normalized.countInStock).to.equal(25);
  });

  it('keeps crawler products marked out of stock at zero', async () => {
    const rawProduct = {
      Brand: 'Razer',
      ID: 'source-id-out-of-stock',
      Name: 'Out of stock product',
      SKU: 'SKU-OUT-OF-STOCK',
      Price_VND: 100000,
      Regular_Price: 120000,
      InStock: 'Out of Stock',
      Categories: 'Mouse',
      Attributes: '{}',
      Description: 'Source description',
      MainImage: 'https://example.invalid/main.jpg',
      GalleryImages: [],
      URL: 'https://example.invalid/out-of-stock',
    };

    const [normalized] = await new JSONAdapter({ initialStock: 25 }).parse(JSON.stringify([rawProduct]));

    expect(normalized.countInStock).to.equal(0);
  });

  it('maps the exact crawler schema without inventing category data', async () => {
    const rawProduct = {
      Brand: 'Razer',
      ID: 'source-id-001',
      Name: 'Product name',
      SKU: 'SKU-001',
      Price_VND: 100000,
      Regular_Price: 120000,
      InStock: 'In Stock',
      Categories: 'Headphone',
      Attributes: '{"Color":"Black"}',
      Description: 'Source description',
      MainImage: 'https://example.invalid/main.jpg',
      GalleryImages: ['https://example.invalid/1.jpg'],
      URL: 'https://example.invalid/product',
    };

    const [normalized] = await new JSONAdapter().parse(JSON.stringify([rawProduct]));

    expect(normalized).to.include({
      brand: 'Razer',
      name: 'Product name',
      sku: 'SKU-001',
      sourceProductId: 'source-id-001',
      sourceUrl: 'https://example.invalid/product',
      price: 100000,
      originalPrice: 120000,
      countInStock: 1,
      category: 'Headphone',
      specs: '{"Color":"Black"}',
      description: 'Source description',
      image: 'https://example.invalid/main.jpg',
      baseCurrencyCode: 'VND',
    });
    expect(normalized.images).to.deep.equal(['https://example.invalid/1.jpg']);
    expect(normalized.ID).to.equal('source-id-001');
    expect(normalized.URL).to.equal('https://example.invalid/product');
  });
});

describe('Product seed image backup', () => {
  it('creates a stable Cloudinary public ID from product identity', () => {
    const firstId = getProductImagePublicId({ sku: 'SKU-001' }, 'main');
    const secondId = getProductImagePublicId({ sku: 'SKU-001' }, 'main');
    const galleryId = getProductImagePublicId({ sku: 'SKU-001' }, 'gallery', 2);

    expect(firstId).to.equal(secondId);
    expect(firstId).to.match(/^[a-f0-9]{24}\/main$/);
    expect(galleryId).to.match(/^[a-f0-9]{24}\/gallery-2$/);
  });

  it('does not re-upload an image that is already on Cloudinary', async () => {
    const result = await uploadProductImage(
      'https://res.cloudinary.com/demo/image/upload/laptop-store/products/product/main.jpg',
      'ignored-public-id'
    );

    expect(result).to.deep.equal({
      url: 'https://res.cloudinary.com/demo/image/upload/laptop-store/products/product/main.jpg',
      publicId: 'laptop-store/products/product/main',
    });
  });
});

describe('Initial product highlights', () => {
  it('assigns random featured and hot deal products when fields are missing', () => {
    const products = Array.from({ length: 10 }, (_, index) => ({ name: `Product ${index}` }));
    const seededProducts = assignInitialHighlights(products);

    expect(seededProducts.filter(product => product.featured === true)).to.have.lengthOf(1);
    expect(seededProducts.filter(product => product.deal?.discount > 0)).to.have.lengthOf(1);
    expect(products.every(product => product.featured === undefined && product.deal === undefined)).to.equal(true);
  });

  it('preserves explicit featured and deal values', () => {
    const products = [
      { name: 'Featured product', featured: true, deal: { discount: 25 } },
      { name: 'Regular product', featured: false, deal: {} },
    ];

    expect(assignInitialHighlights(products)).to.deep.equal(products);
  });
});

describe('Image upload validation', () => {
  const validateImage = (file) => {
    const result = { nextCalled: false, status: null, body: null };
    const res = {
      status: (status) => {
        result.status = status;
        return res;
      },
      json: (body) => {
        result.body = body;
        return res;
      },
    };

    validateImageUpload({ file }, res, () => {
      result.nextCalled = true;
    });

    return result;
  };

  it('accepts a JPEG with matching content, extension, and MIME type', () => {
    const result = validateImage({
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
      originalname: 'product.jpg',
      mimetype: 'image/jpeg',
    });

    expect(result.nextCalled).to.equal(true);
  });

  it('rejects a JPEG payload disguised with a PNG extension and MIME type', () => {
    const result = validateImage({
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
      originalname: 'product.png',
      mimetype: 'image/png',
    });

    expect(result).to.deep.include({ nextCalled: false, status: 400 });
    expect(result.body.code).to.equal('IMAGE_FILE_INVALID');
  });

  it('rejects an image whose MIME type does not match its content', () => {
    const result = validateImage({
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
      originalname: 'product.jpg',
      mimetype: 'image/png',
    });

    expect(result).to.deep.include({ nextCalled: false, status: 400 });
    expect(result.body.code).to.equal('IMAGE_FILE_INVALID');
  });
});
