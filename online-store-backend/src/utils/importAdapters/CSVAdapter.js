/**
 * CSV Import Adapter
 * Parse products từ CSV format
 * 
 * CSV format:
 * name,brand,price,baseCurrencyCode,category,supplier,specs_connection,specs_weight,...
 * "Product Name","Brand",100000,"VND","Category","Supplier","Wireless","54g",...
 */

const BaseImportAdapter = require('./BaseImportAdapter');
const { validateProductArray } = require('../productImportValidator');

class CSVAdapter extends BaseImportAdapter {
  constructor(config = {}) {
    super(config);
    this.name = 'CSVAdapter';
    this.supportedFormats = ['csv', 'text'];
    this.description = 'Import products from CSV format';
    this.delimiter = config.delimiter || ',';
  }

  /**
   * Parse CSV string thành products array
   * @param {String} csvText - Raw CSV content
   * @returns {Promise<Array>} Parsed products
   */
  async parse(csvText) {
    try {
      const lines = csvText.trim().split('\n');
      if (lines.length < 2) {
        const error = new Error('IMPORT_CSV_CONTENT_INVALID');
        error.code = 'IMPORT_CSV_CONTENT_INVALID';
        throw error;
      }

      // Parse header
      const headers = this.parseCSVLine(lines[0]).map((header) => header.replace(/^\uFEFF/, ''));

      // Parse rows
      const products = [];
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue; // Skip empty lines

        const values = this.parseCSVLine(line);
        if (values.length !== headers.length) {
          console.warn(`CSV row ${i + 1}: column count mismatch with header, skipping`);
          continue;
        }

        const product = {};
        for (let j = 0; j < headers.length; j++) {
          const header = headers[j];
          const value = values[j];

          // Handle specs_* fields
          if (header.startsWith('specs_')) {
            const specKey = header.substring(6); // Remove "specs_" prefix
            if (!product.specs) product.specs = {};
            product.specs[specKey] = value;
          }
          // Handle deal_* fields (deal_discount, deal_endTime)
          else if (header.startsWith('deal_')) {
            const dealKey = header.substring(5); // Remove "deal_" prefix
            if (!product.deal) product.deal = {};
            product.deal[dealKey] = value;
          }
          // Handle the product feature identifiers
          else if (header === 'features') {
            // "Feature1|Feature2|Feature3"
            product.features = value.split('|').map(f => f.trim()).filter(f => f);
          }
          // Handle regular fields
          else {
            product[header] = value;
          }
        }

        // Normalize field names (Vietnamese → English)
        const normalized = this.normalizeFieldNames(product);
        products.push(normalized);
      }

      if (products.length === 0) {
        const error = new Error('IMPORT_CSV_CONTENT_INVALID');
        error.code = 'IMPORT_CSV_CONTENT_INVALID';
        throw error;
      }

      return products;
    } catch (error) {
      if (error.code) throw error;

      const parseError = new Error('IMPORT_CSV_PARSE_FAILED');
      parseError.code = 'IMPORT_CSV_PARSE_FAILED';
      throw parseError;
    }
  }

  /**
   * Parse single CSV line xử lý quoted fields
   * @param {String} line - CSV line
   * @returns {Array} Parsed values
   * 
   * Example:
   * Input:  "Name","Price with, comma",1000
   * Output: ["Name", "Price with, comma", "1000"]
   */
  parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote ""
          current += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
      } else if (char === this.delimiter && !inQuotes) {
        // End of field
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    // Add last field
    if (current || line.endsWith(this.delimiter)) {
      result.push(current.trim());
    }

    return result;
  }

  /**
   * Validate CSV products
   * @param {Array} products
   * @returns {Promise<Object>}
   */
  async validate(products) {
    return validateProductArray(products);
  }

  /**
   * Get CSV template
   * @returns {String} CSV template
   */
  getTemplate() {
    return `productId,name,brand,price,baseCurrencyCode,originalPrice,category,supplier,countInStock,image,specs_connection,specs_weight,specs_battery,specs_mouseType,description,features,deal_discount,deal_endTime
,"Razer Viper V3 Pro Gaming Mouse","Razer",4990000,"VND",5990000,"Mouse","Razer Supplier",50,"https://example.com/img.jpg","Wireless","54g","Rechargeable Battery","Gaming","Professional gaming mouse","RGB Lighting|Lightweight|7 Buttons",15,"2026-12-31"
,"Keychron K3 Pro Mechanical Keyboard","Keychron",3990000,"VND",4990000,"Keyboard","Keychron Store",30,"https://example.com/img2.jpg","Wireless","445g","168 hours","Mechanical","Wireless mechanical keyboard","Hot-swap|Backlighting|Compact Design",20,"2026-12-25"`;
  }
}

module.exports = CSVAdapter;
