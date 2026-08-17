const chai = require('chai');
const { validateProduct, validateProductArray } = require('../utils/productImportValidator');

const expect = chai.expect;

const baseProduct = {
  name: 'External Product',
  brand: 'Example',
  price: 100,
  category: 'Office Laptop',
  supplier: 'Example Supplier',
  baseCurrencyCode: 'VND',
};

describe('Product import source identity validation', () => {
  it('keeps a normalized identity from any external source', () => {
    const result = validateProduct({
      ...baseProduct,
      source: 'supplier_feed',
      sourceId: 123,
      sourceParentId: 99,
      sku: 'SKU-123',
    });

    expect(result.isValid).to.equal(true);
    expect(result.cleaned).to.include({
      source: 'SUPPLIER_FEED',
      sourceId: '123',
      sourceParentId: '99',
      sku: 'SKU-123',
    });
  });

  it('rejects an invalid source identifier', () => {
    const result = validateProduct({
      ...baseProduct,
      source: 'supplier feed',
      sourceId: 123,
    });

    expect(result.isValid).to.equal(false);
    expect(result.errors.some(error => error.includes('source must be an uppercase identifier'))).to.equal(true);
  });

  it('keeps Cloudinary image metadata in cleaned data', () => {
    const result = validateProduct({
      ...baseProduct,
      source: 'TIKI',
      sourceId: '123',
      image: 'https://res.cloudinary.com/demo/image/upload/laptop-store/tiki/products/image.jpg',
      imagePublicId: 'laptop-store/tiki/products/image',
      imagePublicIds: ['laptop-store/tiki/products/image', 'laptop-store/tiki/products/image-2'],
    });

    expect(result.isValid).to.equal(true);
    expect(result.cleaned.imagePublicId).to.equal('laptop-store/tiki/products/image');
    expect(result.cleaned.imagePublicIds).to.have.length(2);
  });

  it('rejects an incomplete source identity', () => {
    const result = validateProduct({ ...baseProduct, source: 'TIKI' });

    expect(result.isValid).to.equal(false);
    expect(result.errors.some(error => error.includes('sourceId is required'))).to.equal(true);
  });

  it('rejects duplicate source identities in one import', () => {
    const result = validateProductArray([
      { ...baseProduct, source: 'TIKI', sourceId: '123' },
      { ...baseProduct, source: 'TIKI', sourceId: '123' },
    ]);

    expect(result.isValid).to.equal(false);
    expect(result.validProducts).to.have.length(1);
    expect(result.invalidProducts[0].errors[0]).to.include('DUPLICATE_SOURCE_ID');
  });
});
