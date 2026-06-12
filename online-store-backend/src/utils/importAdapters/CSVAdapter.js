/**
 * CSV Import Adapter
 * Parse products từ CSV format
 * 
 * CSV format:
 * name,brand,price,category,supplier,specs_connection,specs_weight,...
 * "Product Name","Brand",100000,"Category","Supplier","Wireless","54g",...
 */

const BaseImportAdapter = require('./BaseImportAdapter');
const { validateProductArray } = require('../productImportValidator');

class CSVAdapter extends BaseImportAdapter {
  constructor(config = {}) {
    super(config);
    this.name = 'CSVAdapter';
    this.supportedFormats = ['csv', 'text'];
    this.description = 'Import sản phẩm từ CSV format';
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
        throw new Error('CSV phải có header + ít nhất 1 dòng data');
      }

      // Parse header
      const headers = this.parseCSVLine(lines[0]);

      // Parse rows
      const products = [];
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue; // Skip empty lines

        const values = this.parseCSVLine(line);
        if (values.length !== headers.length) {
          console.warn(`CSV row ${i + 1}: số cột không khớp header, bỏ qua`);
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
          // Handle features_* (multiple features)
          else if (header.startsWith('features')) {
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
        throw new Error('Không tìm thấy products trong CSV');
      }

      return products;
    } catch (err) {
      throw new Error(`CSV parse error: ${err.message}`);
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
    return `name,brand,price,originalPrice,category,supplier,countInStock,image,specs_connection,specs_weight,specs_battery,specs_mouseType,description,features,deal_discount,deal_endTime
"Chuột Razer Viper V3 Pro","Razer",4990000,5990000,"Chuột","Razer Supplier",50,"https://example.com/img.jpg","Wireless","54g","Pin sạc","Gaming","Chuột gaming cao cấp","RGB Lighting|Lightweight|7 Buttons",15,"2026-12-31"
"Bàn phím Keychron K3 Pro","Keychron",3990000,4990000,"Bàn phím","Keychron Store",30,"https://example.com/img2.jpg","Wireless","445g","168 giờ","Mechanical","Bàn phím cơ không dây","Hot-swap|Backlighting|Compact Design",20,"2026-12-25"`;
  }
}

module.exports = CSVAdapter;
