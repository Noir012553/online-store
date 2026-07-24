/**
 * JSON Import Adapter
 * Parse products từ JSON format
 */

const BaseImportAdapter = require('./BaseImportAdapter');
const { validateProductArray } = require('../productImportValidator');

class JSONAdapter extends BaseImportAdapter {
  constructor(config = {}) {
    super(config);
    this.name = 'JSONAdapter';
    this.supportedFormats = ['json'];
    this.description = 'Import products from JSON format';
  }

  /**
   * Parse JSON string hoặc object
   * @param {String|Object|Array} data - Raw JSON data
   * @returns {Promise<Array>} Parsed products array
   */
  async parse(data) {
    try {
      let parsed;

      if (typeof data === 'string') {
        parsed = JSON.parse(data);
      } else if (typeof data === 'object') {
        parsed = data;
      } else {
        const error = new Error('IMPORT_JSON_CONTENT_INVALID');
        error.code = 'IMPORT_JSON_CONTENT_INVALID';
        throw error;
      }

      const products = Array.isArray(parsed) ? parsed : parsed.products;

      if (!Array.isArray(products)) {
        const error = new Error('IMPORT_JSON_CONTENT_INVALID');
        error.code = 'IMPORT_JSON_CONTENT_INVALID';
        throw error;
      }

      return products;
    } catch (error) {
      if (error.code) throw error;

      const parseError = new Error('IMPORT_JSON_PARSE_FAILED');
      parseError.code = 'IMPORT_JSON_PARSE_FAILED';
      throw parseError;
    }
  }

  /**
   * Validate JSON products
   * @param {Array} products
   * @returns {Promise<Object>}
   */
  async validate(products) {
    return validateProductArray(products);
  }

  /**
   * Get JSON template for import
   * Returns a sample JSON structure that users can use as reference
   * @returns {String} JSON template as string
   */
  getTemplate() {
    const template = [
      {
        name: "Razer Viper V3 Pro Gaming Mouse",
        brand: "Razer",
        price: 4990000,
        baseCurrencyCode: "VND",
        originalPrice: 5990000,
        category: "Mouse",
        supplier: "Digital Store",
        countInStock: 50,
        image: "https://example.com/img.jpg",
        images: ["https://example.com/img1.jpg", "https://example.com/img2.jpg"],
        description: "Professional gaming mouse with high precision",
        specs: {
          connection: "Wireless",
          weight: "54g",
          maxDPI: 30000,
          pollRate: 8000,
          buttons: 8
        },
        features: ["RGB Lighting", "Lightweight", "7 Buttons"],
        featured: true,
        deal: {
          discount: 15,
          endTime: "2026-12-31"
        }
      },
      {
        name: "Keychron K3 Pro Mechanical Keyboard",
        brand: "Keychron",
        price: 3990000,
        baseCurrencyCode: "VND",
        originalPrice: 4990000,
        category: "Keyboard",
        supplier: "TechCorp",
        countInStock: 30,
        image: "https://example.com/img2.jpg",
        description: "Wireless mechanical keyboard compact size",
        specs: {
          connection: "Wireless",
          weight: "445g",
          battery: "168 hours"
        },
        features: ["Hot-swap", "Backlighting", "Compact"],
        featured: false,
        deal: {
          discount: 20,
          endTime: "2026-12-25"
        }
      }
    ];

    return JSON.stringify(template, null, 2);
  }
}

module.exports = JSONAdapter;
