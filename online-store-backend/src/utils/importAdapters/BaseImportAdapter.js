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
      // Vietnamese → English
      'tên sản phẩm': 'name',
      'thương hiệu': 'brand',
      'giá': 'price',
      'giá gốc': 'originalPrice',
      'danh mục': 'category',
      'nhà cung cấp': 'supplier',
      'số lượng': 'countInStock',
      'mô tả': 'description',
      'tính năng': 'features',
      'thông số': 'specs',
    };

    const normalized = {};
    for (const [key, value] of Object.entries(product)) {
      const normalizedKey = fieldMapping[key.toLowerCase()] || key;
      normalized[normalizedKey] = value;
    }
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
