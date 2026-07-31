/**
 * Import Adapter Manager
 * Centralized management của tất cả import adapters
 * 
 * Usage:
 * const manager = new ImportAdapterManager();
 * manager.register(new JSONAdapter());
 * manager.register(new CSVAdapter());
 * 
 * const adapter = manager.getAdapter('csv');
 * const products = await adapter.parse(csvData);
 */

const JSONAdapter = require('./JSONAdapter');
const CSVAdapter = require('./CSVAdapter');

class ImportAdapterManager {
  constructor() {
    this.adapters = new Map();
    this.initDefaultAdapters();
  }

  /**
   * Initialize default adapters
   */
  initDefaultAdapters() {
    this.register(new JSONAdapter());
    this.register(new CSVAdapter());
  }

  /**
   * Register new adapter
   * @param {BaseImportAdapter} adapter
   */
  register(adapter) {
    if (!adapter.supports || !adapter.parse || !adapter.validate) {
      throw new Error('Adapter phải implement: supports(), parse(), validate()');
    }

    const key = adapter.name.toLowerCase();
    this.adapters.set(key, adapter);

    // Register by supported formats too
    adapter.supportedFormats.forEach(format => {
      this.adapters.set(format.toLowerCase(), adapter);
    });

    console.log(`[AdapterManager] Registered: ${adapter.name}`);
  }

  /**
   * Get adapter by name hoặc format
   * @param {String} nameOrFormat - Adapter name hoặc format (json, csv, etc.)
   * @returns {BaseImportAdapter|null}
   */
  getAdapter(nameOrFormat) {
    const key = nameOrFormat.toLowerCase();
    return this.adapters.get(key) || null;
  }

  /**
   * Check xem format có được support không
   * @param {String} format
   * @returns {Boolean}
   */
  supports(format) {
    return this.adapters.has(format.toLowerCase());
  }

  /**
   * Get tất cả supported formats
   * @returns {Array}
   */
  getSupportedFormats() {
    const formats = new Set();
    this.adapters.forEach(adapter => {
      adapter.supportedFormats.forEach(format => {
        formats.add(format.toLowerCase());
      });
    });
    return Array.from(formats).sort();
  }

  /**
   * Get list tất cả adapters
   * @returns {Array}
   */
  listAdapters() {
    const listed = new Set();
    const adapters = [];
    
    this.adapters.forEach((adapter, key) => {
      const adapterKey = adapter.name.toLowerCase();
      if (!listed.has(adapterKey)) {
        adapters.push(adapter.getInfo());
        listed.add(adapterKey);
      }
    });

    return adapters;
  }

  /**
   * Parse data using auto-detected adapter
   * @param {String|Object} data - Raw data
   * @param {String} format - Format hint (json, csv, etc.)
   * @returns {Promise<Array>} Parsed products
   */
  async parse(data, format) {
    const adapter = this.getAdapter(format);
    if (!adapter) {
      throw new Error(`Format không được hỗ trợ: ${format}. Supported: ${this.getSupportedFormats().join(', ')}`);
    }

    return adapter.parse(data);
  }

  /**
   * Validate data using adapter
   * @param {Array} products
   * @param {String} format
   * @returns {Promise<Object>}
   */
  async validate(products, format) {
    const adapter = this.getAdapter(format);
    if (!adapter) {
      throw new Error(`Format không được hỗ trợ: ${format}`);
    }

    return adapter.validate(products);
  }

  /**
   * Get template cho format
   * @param {String} format
   * @returns {String} Template
   */
  getTemplate(format) {
    const adapter = this.getAdapter(format);
    if (!adapter) {
      throw new Error(`Format không được hỗ trợ: ${format}`);
    }

    // Return template nếu adapter có method này
    if (adapter.getTemplate) {
      return adapter.getTemplate();
    }

    return `Template không có sẵn cho format: ${format}`;
  }
}

// Export singleton instance
module.exports = ImportAdapterManager;
