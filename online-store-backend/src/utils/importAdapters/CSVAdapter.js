/**
 * CSV Import Adapter
 * Parse products từ CSV format
 * 
 * CSV format:
 * name,brand,price,baseCurrencyCode,category,specs_connection,specs_weight,...
 * "Product Name","Brand",100000,"VND","Category","Wireless","54g",...
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
      const records = this.parseCSVRecords(csvText);
      if (records.length < 2) {
        const error = new Error('IMPORT_CSV_CONTENT_INVALID');
        error.code = 'IMPORT_CSV_CONTENT_INVALID';
        throw error;
      }

      const headers = records[0].map((header) => header.replace(/^\uFEFF/, ''));
      if (headers.length === 0 || headers.some((header) => !header)) {
        const error = new Error('IMPORT_CSV_HEADER_INVALID');
        error.code = 'IMPORT_CSV_HEADER_INVALID';
        throw error;
      }
      if (new Set(headers.map(header => header.toLowerCase())).size !== headers.length) {
        const error = new Error('IMPORT_CSV_HEADER_DUPLICATE');
        error.code = 'IMPORT_CSV_HEADER_DUPLICATE';
        throw error;
      }

      const products = [];
      for (let i = 1; i < records.length; i++) {
        const values = records[i];
        if (values.length !== headers.length) {
          const error = new Error(`IMPORT_CSV_ROW_INVALID:${i + 1}`);
          error.code = 'IMPORT_CSV_ROW_INVALID';
          throw error;
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

  parseCSVRecords(csvText) {
    const records = [];
    let record = [];
    let field = '';
    let inQuotes = false;

    for (let index = 0; index < csvText.length; index += 1) {
      const char = csvText[index];
      const nextChar = csvText[index + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === this.delimiter && !inQuotes) {
        record.push(field.trim());
        field = '';
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && nextChar === '\n') index += 1;
        record.push(field.trim());
        if (record.some(value => value !== '')) records.push(record);
        record = [];
        field = '';
      } else {
        field += char;
      }
    }

    if (inQuotes) {
      const error = new Error('IMPORT_CSV_QUOTE_INVALID');
      error.code = 'IMPORT_CSV_QUOTE_INVALID';
      throw error;
    }

    if (field !== '' || record.length > 0) {
      record.push(field.trim());
      if (record.some(value => value !== '')) records.push(record);
    }

    return records;
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
    return `productId,name,brand,price,baseCurrencyCode,originalPrice,category,countInStock,image,specs_connection,specs_weight,specs_battery,specs_mouseType,description,deal_discount,deal_endTime
,"Razer Viper V3 Pro Gaming Mouse","Razer",4990000,"VND",5990000,"Mouse",50,"https://example.com/img.jpg","Wireless","54g","Rechargeable Battery","Gaming","Professional gaming mouse",15,"2026-12-31"
,"Keychron K3 Pro Mechanical Keyboard","Keychron",3990000,"VND",4990000,"Keyboard",30,"https://example.com/img2.jpg","Wireless","445g","168 hours","Mechanical","Wireless mechanical keyboard",20,"2026-12-25"`;
  }
}

module.exports = CSVAdapter;
