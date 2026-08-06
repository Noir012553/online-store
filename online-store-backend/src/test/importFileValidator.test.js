const chai = require('chai');
const expect = chai.expect;
const { validateImportFile } = require('../utils/importFileValidator');

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
