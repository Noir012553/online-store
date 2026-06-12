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
    this.description = 'Import sản phẩm từ JSON format';
  }

  /**
   * Parse JSON string hoặc object
   * @param {String|Object|Array} data - Raw JSON data
   * @returns {Promise<Array>} Parsed products array
   */
  async parse(data) {
    try {
      let parsed;

      // Handle string input
      if (typeof data === 'string') {
        parsed = JSON.parse(data);
      } else if (typeof data === 'object') {
        parsed = data;
      } else {
        throw new Error('Invalid input: expected JSON string or object');
      }

      // Handle both direct array or { products: [...] } format
      let products = Array.isArray(parsed) ? parsed : parsed.products;

      if (!Array.isArray(products)) {
        throw new Error('Data phải là array hoặc object có field "products"');
      }

      return products;
    } catch (err) {
      throw new Error(`JSON parse error: ${err.message}`);
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
        name: "Chuột Razer Viper V3 Pro",
        brand: "Razer",
        price: 4990000,
        originalPrice: 5990000,
        category: "Chuột",
        supplier: "Digital Store",
        countInStock: 50,
        image: "https://example.com/img.jpg",
        images: ["https://example.com/img1.jpg", "https://example.com/img2.jpg"],
        description: "Chuột gaming cao cấp với tế nhị cực cao",
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
        name: "Bàn phím Keychron K3 Pro",
        brand: "Keychron",
        price: 3990000,
        originalPrice: 4990000,
        category: "Bàn phím",
        supplier: "TechCorp",
        countInStock: 30,
        image: "https://example.com/img2.jpg",
        description: "Bàn phím cơ không dây compact",
        specs: {
          connection: "Wireless",
          weight: "445g",
          battery: "168 giờ"
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
