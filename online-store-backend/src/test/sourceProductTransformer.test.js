const chai = require('chai');
const sinon = require('sinon');
const { transformTikiProducts, preflightTikiImport } = require('../sources/tiki/productTransformer');
const { filterSellerProducts } = require('../sources/tiki/filterProductsBySeller');
const { getImageUrl } = require('../sources/tiki/imageUploadService');
const defaultTikiConfig = require('../sources/tiki/importConfig');
const { crawlProducts } = require('../sources/tiki/crawlProducts');

const expect = chai.expect;

const config = {
  stockPolicy: { mode: 'staging', simulatedStockQty: 50 },
};

const references = {
  categories: [{ name: 'Office Laptop', isDeleted: false }],
  suppliers: [{ name: 'Tiki Trading', isDeleted: false }],
};

describe('Tiki product transformer', () => {
  it('flattens variants and preserves source identity', () => {
    const result = transformTikiProducts([{
      id: 100,
      master_id: 90,
      type: 'configurable',
      name: 'Laptop Demo',
      brand: { name: 'Example' },
      categories: [{ name: 'Office Laptop' }],
      current_seller: { name: 'Tiki Trading', product_id: 1000 },
      description: '<p>Safe</p><script>alert(1)</script>',
      thumbnail_url: 'https://example.com/parent.jpg',
      inventory_status: 'available',
      configurable_products: [{
        id: 101,
        price: 1200,
        option1_name: 'Màu',
        option1: 'Đen',
        thumbnail_url: 'https://example.com/variant.jpg',
        images: [{ large_url: 'https://example.com/variant-large.jpg' }],
        stock_item: { qty: 0 },
      }],
    }], { ...references, config });

    expect(result.rejected).to.have.length(0);
    expect(result.ready).to.have.length(1);
    expect(result.ready[0]).to.include({
      source: 'TIKI',
      sourceId: '101',
      sourceParentId: '90',
      sku: 'TIKI-SYNTHETIC-101',
      countInStock: 0,
    });
    expect(result.ready[0].name).to.equal('Laptop Demo - Màu: Đen');
    expect(result.ready[0].images).to.include('https://example.com/variant-large.jpg');
    expect(result.ready[0].description).to.not.include('<script>');
    expect(result.report.variant_count).to.equal(1);
  });

  it('accepts an existing Audio category without a source mapping', () => {
    const result = transformTikiProducts([{
      id: 300,
      name: 'Tai nghe có dây Logitech H390',
      brand: { name: 'Logitech' },
      categories: [{ name: 'Audio' }],
      current_seller: { name: 'Tiki Trading', sku: 'H390-001', price: 500000 },
      price: 500000,
      original_price: 600000,
      thumbnail_url: 'https://example.com/headphones.jpg',
      inventory_status: 'available',
    }], {
      categories: [{ name: 'Audio', isDeleted: false }],
      suppliers: references.suppliers,
      config: defaultTikiConfig,
    });

    expect(result.rejected).to.have.length(0);
    expect(result.ready).to.have.length(1);
    expect(result.ready[0].category).to.equal('Audio');
  });

  it('resolves database-configured source category names and store_name sellers', () => {
    const result = transformTikiProducts([{
      id: 302,
      name: 'Laptop văn phòng Lenovo',
      brand: { name: 'Lenovo' },
      categories: [{ name: 'Laptop Truyền Thống' }],
      current_seller: { store_name: 'Tiki Trading', sku: 'LENOVO-001', price: 12000000 },
      price: 12000000,
      original_price: 13000000,
      thumbnail_url: 'https://example.com/lenovo.jpg',
      inventory_status: 'available',
    }], {
      categories: [{
        name: 'Office Laptop',
        sourceNames: ['Laptop Truyền Thống'],
        isDeleted: false,
      }],
      suppliers: references.suppliers,
      config: defaultTikiConfig,
    });

    expect(result.rejected).to.have.length(0);
    expect(result.ready).to.have.length(1);
    expect(result.ready[0].category).to.equal('Office Laptop');
    expect(result.ready[0].supplier).to.equal('Tiki Trading');
  });

  it('resolves crawl metadata and a configured supplier alias', () => {
    const result = transformTikiProducts([{
      id: 305,
      name: 'Chuột gaming demo',
      brand: { name: 'Logitech' },
      price: 89000,
      original_price: 89000,
      thumbnail_url: 'https://example.com/mouse.jpg',
      inventory_status: 'available',
      current_seller: { name: 'Unknown seller' },
      crawlCategory: { name: 'Mouse' },
      crawlSupplier: { name: 'Tiki' },
    }], {
      categories: [{ name: 'Mouse', isDeleted: false }],
      suppliers: [{
        name: 'Tiki Trading',
        sourceNames: ['Tiki'],
        isDeleted: false,
      }],
      config: defaultTikiConfig,
    });

    expect(result.rejected).to.have.length(0);
    expect(result.ready[0]).to.include({ category: 'Mouse', supplier: 'Tiki Trading' });
  });

  it('rejects a source category without database configuration', () => {
    const result = transformTikiProducts([{
      id: 303,
      name: 'Laptop văn phòng Acer',
      brand: { name: 'Acer' },
      categories: [{ name: 'Laptop Truyền Thống' }],
      current_seller: { store_name: 'Tiki Trading', sku: 'ACER-001', price: 10000000 },
      price: 10000000,
      original_price: 11000000,
      thumbnail_url: 'https://example.com/acer.jpg',
      inventory_status: 'available',
    }], {
      categories: [{ name: 'Office Laptop', isDeleted: false }],
      suppliers: references.suppliers,
      config: defaultTikiConfig,
    });

    expect(result.ready).to.have.length(0);
    expect(result.rejected[0].reasons).to.deep.include({
      code: 'CATEGORY_NOT_FOUND',
      field: 'category',
      value: 'Laptop Truyền Thống',
      message: 'CATEGORY_NOT_FOUND',
    });
  });

  it('resolves a category from breadcrumbs when the source category is broad', () => {
    const result = transformTikiProducts([{
      id: 304,
      name: 'Chuột gaming demo',
      brand: { name: 'Zealot' },
      categories: { name: 'Thiết Bị Số - Phụ Kiện Số' },
      breadcrumbs: [
        { name: 'Phụ kiện máy tính và Laptop' },
        { name: 'Chuột Văn Phòng Có Dây' },
      ],
      price: 89000,
      original_price: 89000,
      thumbnail_url: 'https://example.com/mouse.jpg',
      inventory_status: 'available',
    }], {
      categories: [{
        name: 'Mouse',
        sourceNames: ['Chuột Văn Phòng Có Dây'],
        isDeleted: false,
      }],
      suppliers: references.suppliers,
      config: defaultTikiConfig,
    });

    expect(result.ready).to.have.length(0);
    expect(result.rejected[0].reasons.map(reason => reason.code)).to.deep.equal(['SUPPLIER_NOT_FOUND']);
    expect(result.report.rejection_breakdown).to.not.have.property('CATEGORY_NOT_FOUND');
  });

  it('does not map the mixed Tiki laptop category to Office Laptop', () => {
    const result = transformTikiProducts([{
      id: 301,
      name: 'Màn hình Gaming Xiaomi G24i',
      brand: { name: 'Xiaomi' },
      categories: [{ name: 'Laptop - Máy Vi Tính - Linh kiện' }],
      current_seller: { name: 'Tiki Trading', sku: 'G24I-001', price: 2800000 },
      price: 2800000,
      original_price: 3000000,
      thumbnail_url: 'https://example.com/monitor.jpg',
      inventory_status: 'available',
    }], {
      categories: [{ name: 'Office Laptop', isDeleted: false }],
      suppliers: references.suppliers,
      config: defaultTikiConfig,
    });

    expect(result.ready).to.have.length(0);
    expect(result.rejected[0].reasons).to.deep.include({
      code: 'CATEGORY_NOT_FOUND',
      field: 'category',
      value: 'Laptop - Máy Vi Tính - Linh kiện',
      message: 'CATEGORY_NOT_FOUND',
    });
  });

  it('rejects invalid core data with stable error codes', () => {
    const result = transformTikiProducts([{
      id: 200,
      name: 'Invalid Product',
      brand: { name: 'Example' },
      categories: [{ name: 'Unknown' }],
      current_seller: { name: 'Unknown Seller' },
      price: 0,
      thumbnail_url: 'http://example.com/product.jpg',
      inventory_status: 'unknown',
    }], { ...references, config });

    expect(result.ready).to.have.length(0);
    expect(result.rejected[0].reasons.map(reason => reason.code)).to.include.members([
      'CATEGORY_NOT_FOUND',
      'SUPPLIER_NOT_FOUND',
      'INVALID_PRICE',
      'INVALID_IMAGE_URL',
      'INVALID_STOCK',
    ]);
  });
});

describe('Tiki crawler', () => {
  it('collects the minimum valid product count for every supplied category', async () => {
    const categories = [
      { name: 'Keyboard', key: 'keyboard', sourceNames: ['Bàn phím'], isDeleted: false },
      { name: 'Mouse', key: 'mouse', sourceNames: ['Chuột máy tính'], isDeleted: false },
    ];
    const defaultSupplier = { name: 'Tiki Trading', isDeleted: false };
    const listRequest = sinon.stub(require('axios'), 'get').callsFake(async (url, request) => {
      expect(url).to.equal('https://tiki.vn/api/v2/products');
      const category = request.params.q === 'Bàn phím' ? 'Keyboard' : 'Mouse';
      return {
        data: {
          data: Array.from({ length: 50 }, (_, index) => ({
            id: `${category}-${index + 1}`,
            name: `${category} ${index + 1}`,
            brand: { name: 'Demo Brand' },
            price: 100000,
            original_price: 100000,
            thumbnail_url: 'https://salt.tikicdn.com/ts/product/demo.jpg',
            inventory_status: 'available',
          })),
        },
      };
    });

    try {
      const result = await crawlProducts({
        categories,
        defaultSupplier,
        minPerCategory: 50,
        maxPages: 1,
        pageSize: 50,
        delayMilliseconds: 0,
        skipDetails: true,
      });

      expect(result.report.success).to.equal(true);
      expect(result.report.categoryCount).to.equal(2);
      expect(result.report.totalCrawledCount).to.equal(100);
      expect(result.report.categorySummary.map(report => report.crawledCount)).to.deep.equal([50, 50]);
      expect(listRequest).to.have.property('callCount', 2);
    } finally {
      listRequest.restore();
    }
  });

  it('reports an invalid listing response instead of hiding the source failure', async () => {
    const listRequest = sinon.stub(require('axios'), 'get').resolves({ data: '<html></html>' });

    try {
      const result = await crawlProducts({
        categories: [{ name: 'Mouse', key: 'mouse', sourceNames: [], isDeleted: false }],
        defaultSupplier: { name: 'Tiki Trading', isDeleted: false },
        minPerCategory: 1,
        maxPages: 1,
        pageSize: 1,
        maxRetries: 1,
        delayMilliseconds: 0,
        requestTimeout: 100,
        skipDetails: true,
      });

      expect(result.products).to.have.length(0);
      expect(result.report.categorySummary[0]).to.include({
        listingErrorCount: 1,
        emptyPageCount: 0,
      });
      expect(result.report.categorySummary[0].listingErrors[0]).to.include({
        reason: 'CRAWL_LISTING_RESPONSE_INVALID',
        searchTerm: 'Mouse',
        page: 1,
      });
      expect(result.report.shortfalls[0].reason).to.equal('CRAWL_LISTING_RESPONSE_INVALID');
    } finally {
      listRequest.restore();
    }
  });
});

describe('Tiki seller filtering', () => {
  const input = [{
    id: 1,
    current_seller: { name: 'Seller A' },
    configurable_products: [
      { id: 2, current_seller: { name: 'Seller B' } },
      { id: 3, current_seller: { name: 'Seller A' } },
    ],
  }];

  it('keeps all sellers when no seller filter is provided', () => {
    const result = filterSellerProducts(input);

    expect(result.items).to.have.length(1);
    expect(result.items[0].configurable_products).to.have.length(2);
    expect(result.report.seller).to.equal(null);
  });

  it('filters to the explicitly requested seller', () => {
    const result = filterSellerProducts(input, 'Seller B');

    expect(result.items).to.have.length(1);
    expect(result.items[0].configurable_products.map(variant => variant.id)).to.deep.equal([2]);
    expect(result.report.seller).to.equal('Seller B');
  });
});

describe('Tiki image upload validation', () => {
  it('accepts HTTPS Tiki CDN URLs', () => {
    expect(getImageUrl('https://salt.tikicdn.com/ts/product/image.jpg')).to.equal('https://salt.tikicdn.com/ts/product/image.jpg');
  });

  it('rejects non-Tiki or non-HTTPS URLs', () => {
    expect(() => getImageUrl('http://salt.tikicdn.com/image.jpg')).to.throw('TIKI_IMAGE_URL_NOT_ALLOWED');
    expect(() => getImageUrl('https://example.com/image.jpg')).to.throw('TIKI_IMAGE_URL_NOT_ALLOWED');
  });
});

describe('Tiki import preflight', () => {
  it('reports missing readiness requirements', () => {
    const result = preflightTikiImport({
      categories: [],
      suppliers: [],
      currency: { code: 'VND', isActive: false },

    });

    expect(result.success).to.equal(false);
    expect(result.errors.map(error => error.code)).to.include.members([
      'CURRENCY_NOT_READY',
      'ADMIN_NOT_READY',
      'SOURCE_IDENTITY_INDEX_NOT_READY',
    ]);
  });

  it('accepts a seller configured as a supplier alias', () => {
    const result = preflightTikiImport({
      categories: [{ name: 'Office Laptop', isDeleted: false }],
      suppliers: [{ name: 'Tiki Trading', sourceNames: ['Tiki'], isDeleted: false }],
      sourceSupplierNames: ['Tiki'],
      currency: { code: 'VND', isActive: true },
      adminUserId: 'admin-id',
      sourceIdentityIndexReady: true,
    });

    expect(result.success).to.equal(true);
  });

  it('rejects a seller missing from the database', () => {
    const result = preflightTikiImport({
      categories: [{ name: 'Office Laptop', isDeleted: false }],
      suppliers: [],
      sourceSupplierNames: ['Tiki Trading'],
      currency: { code: 'VND', isActive: true },
      adminUserId: 'admin-id',

      sourceIdentityIndexReady: true,
    });

    expect(result.success).to.equal(false);
    expect(result.errors).to.deep.include({ code: 'SUPPLIER_NOT_FOUND', value: 'tiki trading' });
  });
});
