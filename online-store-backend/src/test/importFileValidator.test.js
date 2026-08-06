const chai = require('chai');
const expect = chai.expect;
const { validateImportFile } = require('../utils/fileUtils');
const { validateImageUpload } = require('../middleware/uploadValidationMiddleware');

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

describe('Image upload validation', () => {
  const validateImage = (file) => {
    const result = { nextCalled: false, status: null, body: null };
    const res = {
      status: (status) => {
        result.status = status;
        return res;
      },
      json: (body) => {
        result.body = body;
        return res;
      },
    };

    validateImageUpload({ file }, res, () => {
      result.nextCalled = true;
    });

    return result;
  };

  it('accepts a JPEG with matching content, extension, and MIME type', () => {
    const result = validateImage({
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
      originalname: 'product.jpg',
      mimetype: 'image/jpeg',
    });

    expect(result.nextCalled).to.equal(true);
  });

  it('rejects a JPEG payload disguised with a PNG extension and MIME type', () => {
    const result = validateImage({
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
      originalname: 'product.png',
      mimetype: 'image/png',
    });

    expect(result).to.deep.include({ nextCalled: false, status: 400 });
    expect(result.body.code).to.equal('IMAGE_FILE_INVALID');
  });

  it('rejects an image whose MIME type does not match its content', () => {
    const result = validateImage({
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
      originalname: 'product.jpg',
      mimetype: 'image/png',
    });

    expect(result).to.deep.include({ nextCalled: false, status: 400 });
    expect(result.body.code).to.equal('IMAGE_FILE_INVALID');
  });
});
