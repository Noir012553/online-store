/**
 * Base Import Adapter
 * Abstract base class cho tất cả import adapters
 * 
 * Architecture:
 * - Mỗi format (JSON, CSV, Excel, API) có riêng adapter
 * - Tất cả adapters implement cùng interface
 * - Dễ add module import mới mà không ảnh hưởng existing code
 */

class BaseImportAdapter {
  /**
   * Constructor
   * @param {Object} config - Configuration cho adapter
   */
  constructor(config = {}) {
    this.config = config;
    this.name = 'BaseAdapter';
    this.supportedFormats = [];
  }

  /**
   * Check xem adapter có hỗ trợ format này không
   * @param {String} format - Format type (json, csv, excel, etc.)
   * @returns {Boolean}
   */
  supports(format) {
    return this.supportedFormats.includes(format.toLowerCase());
  }

  /**
   * Parse raw data thành standardized format
   * MUST override trong subclass
   * @param {Any} data - Raw input data
   * @returns {Promise<Array>} Mảng products
   */
  async parse(data) {
    throw new Error(`${this.name}.parse() must be implemented`);
  }

  /**
   * Validate parsed data
   * MUST override trong subclass
   * @param {Array} products - Parsed products
   * @returns {Promise<Object>} { isValid, errors, warnings }
   */
  async validate(products) {
    throw new Error(`${this.name}.validate() must be implemented`);
  }

  /**
   * Normalize field names
   * Helper method cho subclasses
   * @param {Object} product - Single product object
   * @returns {Object} Normalized product
   */
  normalizeFieldNames(product) {
    const fieldMapping = {
      'tên sản phẩm': 'name',
      'thương hiệu': 'brand',
      'giá': 'price',
      'giá gốc': 'originalPrice',
      'danh mục': 'category',
      'số lượng': 'countInStock',
      'mô tả': 'description',
      'thông số': 'specs',
      'product name': 'name',
      'brand': 'brand',
      'price': 'price',
      'original price': 'originalPrice',
      'category': 'category',
      'quantity in stock': 'countInStock',
      'description': 'description',
      'specifications': 'specs',
      'productbrand': 'brand',
      'productid': 'sourceProductId',
      'productname': 'name',
      'productsku': 'sku',
      'productpricevnd': 'price',
      'productregularpricevnd': 'originalPrice',
      'productstockstatus': 'stockStatus',
      'productcategory': 'category',
      'productspecifications': 'specs',
      'producttechnicaldescription': 'technicalDescription',
      'productdescription': 'description',
      'productdescriptionimages': 'descriptionImages',
      'productpromotions': 'promotions',
      'productmainimage': 'image',
      'productgalleryimages': 'images',
      'producturl': 'sourceUrl',
    };
    const isCrawlerProduct = Object.hasOwn(product, 'Price_VND')
      || Object.hasOwn(product, 'ProductPriceVND');
    const normalized = {};

    for (const [key, value] of Object.entries(product)) {
      const normalizedKey = fieldMapping[key.toLowerCase()] || key;
      normalized[normalizedKey] = value;
    }

    if (!isCrawlerProduct) return normalized;

    const isNewCrawlerProduct = Object.hasOwn(product, 'ProductPriceVND');
    const getCrawlerValue = (newKey, legacyKey) => (
      isNewCrawlerProduct ? product[newKey] : product[legacyKey]
    );
    const parseCrawlerArray = (value) => {
      if (Array.isArray(value)) return value;
      if (typeof value !== 'string' || !value.trim()) return value;
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : value;
      } catch {
        return value;
      }
    };

    normalized.name = getCrawlerValue('ProductName', 'Name');
    normalized.brand = getCrawlerValue('ProductBrand', 'Brand');
    normalized.sku = getCrawlerValue('ProductSKU', 'SKU');
    normalized.sourceProductId = getCrawlerValue('ProductID', 'ID');
    normalized.sourceUrl = getCrawlerValue('ProductURL', 'URL');
    normalized.price = getCrawlerValue('ProductPriceVND', 'Price_VND');
    normalized.originalPrice = getCrawlerValue('ProductRegularPriceVND', 'Regular_Price');
    normalized.category = getCrawlerValue('ProductCategory', 'Categories');
    normalized.specs = getCrawlerValue('ProductSpecifications', 'Attributes');
    normalized.technicalDescription = getCrawlerValue('ProductTechnicalDescription', 'Description');
    normalized.description = isNewCrawlerProduct
      ? product.ProductDescription
      : product.Description;
    normalized.descriptionImages = isNewCrawlerProduct
      ? (Array.isArray(product.ProductDescriptionImages)
        ? product.ProductDescriptionImages.map(image => ({
          url: image?.ProductDescriptionImageURL || image?.url,
          alt: image?.ProductDescriptionImageAlt || image?.alt || '',
        }))
        : product.ProductDescriptionImages)
      : undefined;
    normalized.promotions = isNewCrawlerProduct
      ? (Array.isArray(product.ProductPromotions)
        ? product.ProductPromotions.map(promotion => ({
          type: promotion?.ProductPromotionType || promotion?.type,
          title: promotion?.ProductPromotionTitle || promotion?.title,
          giftQuantity: promotion?.ProductPromotionGiftQuantity ?? promotion?.giftQuantity,
          giftProductName: promotion?.ProductPromotionGiftProductName || promotion?.giftProductName,
          giftProductUrl: promotion?.ProductPromotionGiftProductURL || promotion?.giftProductUrl,
          giftValueVND: promotion?.ProductPromotionGiftValueVND ?? promotion?.giftValueVND,
          scope: promotion?.ProductPromotionScope || promotion?.scope,
          discountText: promotion?.ProductPromotionDiscountText || promotion?.discountText,
        }))
        : product.ProductPromotions)
      : undefined;
    normalized.image = getCrawlerValue('ProductMainImage', 'MainImage');
    normalized.images = parseCrawlerArray(getCrawlerValue('ProductGalleryImages', 'GalleryImages'));
    const stockStatus = getCrawlerValue('ProductStockStatus', 'InStock');
    const isInStock = /^(in stock|còn hàng|true|1)$/i.test(String(stockStatus).trim());
    const configuredInitialStock = this.config.initialStock;
    const initialStock = Number.isInteger(configuredInitialStock) && configuredInitialStock >= 0
      ? configuredInitialStock
      : 1;
    normalized.countInStock = isInStock ? initialStock : 0;
    normalized.baseCurrencyCode = 'VND';

    return normalized;
  }

  /**
   * Get adapter info
   * @returns {Object}
   */
  getInfo() {
    return {
      name: this.name,
      supportedFormats: this.supportedFormats,
      description: this.description || 'No description',
    };
  }
}

module.exports = BaseImportAdapter;
