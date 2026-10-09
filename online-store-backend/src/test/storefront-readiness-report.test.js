const chai = require('chai');
const expect = chai.expect;
const { getProductTranslationSourceHash } = require('../utils/productTranslationFingerprint');
const { analyzeStorefrontReadiness } = require('../utils/storefrontReadinessReport');

const requiredLanguages = ['en', 'fr'];

const makeProduct = (overrides = {}) => ({
  _id: 'product-1',
  name: 'Laptop',
  brand: 'Brand',
  description: 'Laptop description',
  specs: { RAM: '16GB', CPU: 'Model X' },
  technicalDescription: '',
  descriptionImages: [],
  promotions: [],
  storefrontReady: true,
  storefrontReadinessCheckedAt: new Date(),
  ...overrides,
});

const makeTranslations = (product) => requiredLanguages.map((targetLang) => ({
  entityId: String(product._id),
  targetLang,
  sourceHash: getProductTranslationSourceHash(product),
  status: 'success',
  qualityStatus: 'approved',
  validationErrors: [],
  name: 'Translated laptop',
  brand: 'Brand',
  description: 'Translated description',
  specs: { RAM: '16GB', CPU: 'Model X' },
}));

describe('storefront readiness report', () => {
  it('reports readiness and groups cache counts without modifying products', () => {
    const product = makeProduct();
    const report = analyzeStorefrontReadiness([product], makeTranslations(product), requiredLanguages);

    expect(report.readyCount).to.equal(1);
    expect(report.notReadyCount).to.equal(0);
    expect(report.storedReadyCount).to.equal(1);
    expect(report.readinessMismatchCount).to.equal(0);
    expect(report.translationCounts).to.have.length(2);
    expect(product.storefrontReady).to.equal(true);
  });

  it('accepts a valid translation when another cache row for the locale is invalid', () => {
    const product = makeProduct();
    const translations = makeTranslations(product);
    translations.push({ ...translations[0], qualityStatus: 'pending' });
    const report = analyzeStorefrontReadiness([product], translations, requiredLanguages);

    expect(report.readyCount).to.equal(1);
    expect(report.reasonCounts.quality_not_approved).to.equal(undefined);
  });

  it('classifies missing and stale language records separately', () => {
    const product = makeProduct();
    const translations = makeTranslations(product).filter(({ targetLang }) => targetLang !== 'en');
    translations[0].sourceHash = 'old-hash';
    const report = analyzeStorefrontReadiness([product], translations, requiredLanguages);

    expect(report.products[0].locales[0]).to.deep.equal({
      targetLang: 'en',
      reasons: ['missing_translation'],
      missingSpecKeys: [],
    });
    expect(report.reasonCounts.stale_source_hash).to.equal(1);
    expect(report.reasonCounts.missing_translation).to.equal(1);
  });

  it('reports quality, validation, required fields, description, and missing specs', () => {
    const product = makeProduct();
    const translations = makeTranslations(product);
    translations[0].qualityStatus = 'pending';
    translations[0].validationErrors = ['issue'];
    translations[0].brand = '';
    translations[0].description = '';
    delete translations[0].specs.RAM;
    const report = analyzeStorefrontReadiness([product], translations, requiredLanguages);

    expect(report.reasonCounts.quality_not_approved).to.equal(1);
    expect(report.reasonCounts.validation_errors).to.equal(1);
    expect(report.reasonCounts.missing_required_translation_fields).to.equal(1);
    expect(report.reasonCounts.missing_description).to.equal(1);
    expect(report.reasonCounts.missing_specs).to.equal(1);
    expect(report.products[0].locales[0].missingSpecKeys).to.deep.equal(['ram']);
  });

  it('reports source fields missing and detects stored readiness mismatches', () => {
    const product = makeProduct({ name: '' });
    const translations = makeTranslations(product);
    const report = analyzeStorefrontReadiness([product], translations, requiredLanguages);

    expect(report.reasonCounts.source_missing_required_fields).to.equal(1);
    expect(report.readinessMismatchCount).to.equal(1);
    expect(report.products[0].missingSourceFields).to.deep.equal(['name']);
  });
});
