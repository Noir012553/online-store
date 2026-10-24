const chai = require('chai');
const expect = chai.expect;
const { getProductTranslationSourceHash } = require('../utils/productTranslationFingerprint');
const { analyzeTranslationReadiness } = require('../utils/storefrontReadinessReport');

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
  translationReady: true,
  translationReadinessCheckedAt: new Date(),
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
    const report = analyzeTranslationReadiness([product], makeTranslations(product), requiredLanguages);

    expect(report.translationReadyCount).to.equal(1);
    expect(report.translationNotReadyCount).to.equal(0);
    expect(report.storedTranslationReadyCount).to.equal(1);
    expect(report.translationReadinessMismatchCount).to.equal(0);
    expect(report.translationCounts).to.have.length(2);
    expect(product.translationReady).to.equal(true);
  });

  it('accepts a valid translation when another cache row for the locale is invalid', () => {
    const product = makeProduct();
    const translations = makeTranslations(product);
    translations.push({ ...translations[0], qualityStatus: 'pending' });
    const report = analyzeTranslationReadiness([product], translations, requiredLanguages);

    expect(report.translationReadyCount).to.equal(1);
    expect(report.reasonCounts.quality_not_approved).to.equal(undefined);
  });

  it('classifies missing and stale language records separately', () => {
    const product = makeProduct();
    const translations = makeTranslations(product).filter(({ targetLang }) => targetLang !== 'en');
    translations[0].sourceHash = 'old-hash';
    const report = analyzeTranslationReadiness([product], translations, requiredLanguages);

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
    const report = analyzeTranslationReadiness([product], translations, requiredLanguages);

    expect(report.reasonCounts.quality_not_approved).to.equal(1);
    expect(report.reasonCounts.validation_errors).to.equal(1);
    expect(report.reasonCounts.missing_required_translation_fields).to.equal(1);
    expect(report.reasonCounts.missing_description).to.equal(1);
    expect(report.reasonCounts.missing_specs).to.equal(1);
    expect(report.products[0].locales[0].missingSpecKeys).to.deep.equal(['ram']);
  });

  it('groups blocking validation errors by locale and unique product', () => {
    const product = makeProduct();
    const translations = makeTranslations(product);
    translations[0].validationErrors = ['empty', 'too_short', 'empty'];
    translations[1].validationErrors = ['empty'];
    const report = analyzeTranslationReadiness([product], translations, requiredLanguages);

    expect(report.validationErrorCounts).to.deep.equal([
      { targetLang: 'en', error: 'empty', records: 1, uniqueProducts: 1 },
      { targetLang: 'en', error: 'too_short', records: 1, uniqueProducts: 1 },
      { targetLang: 'fr', error: 'empty', records: 1, uniqueProducts: 1 },
    ]);
  });

  it('reports optional image-alt warnings without blocking readiness', () => {
    const product = makeProduct();
    const translations = makeTranslations(product).map((translation) => ({
      ...translation,
      optionalFieldWarnings: [{
        fieldKey: 'descriptionImages.0.alt',
        validationErrors: ['mixed_language'],
      }],
    }));
    const report = analyzeTranslationReadiness([product], translations, requiredLanguages);

    expect(report.translationReadyCount).to.equal(1);
    expect(report.reasonCounts).to.deep.equal({});
    expect(report.optionalWarningCounts['descriptionImages.0.alt:mixed_language']).to.equal(2);
    expect(report.products[0].locales[0].optionalFieldWarnings).to.deep.equal(translations[0].optionalFieldWarnings);
  });

  it('keeps unclassified catalog errors blocking alongside optional warnings', () => {
    const product = makeProduct();
    const translations = makeTranslations(product);
    translations[0].validationErrors = ['legacy_validation_error'];
    translations[0].optionalFieldWarnings = [{
      fieldKey: 'descriptionImages.0.alt',
      validationErrors: ['wrong_language'],
    }];
    const report = analyzeTranslationReadiness([product], translations, requiredLanguages);

    expect(report.translationReadyCount).to.equal(0);
    expect(report.reasonCounts.validation_errors).to.equal(1);
    expect(report.optionalWarningCounts['descriptionImages.0.alt:wrong_language']).to.equal(1);
  });

  it('does not require source or translated description when source description is absent', () => {
    const product = makeProduct({ description: '' });
    const translations = makeTranslations(product).map((translation) => ({ ...translation, description: '' }));
    const report = analyzeTranslationReadiness([product], translations, requiredLanguages);

    expect(report.reasonCounts.source_missing_required_fields).to.equal(undefined);
    expect(report.products[0].missingSourceFields).to.deep.equal([]);
    expect(report.products[0].translationReady).to.equal(true);
  });

  it('reports source fields missing and detects stored readiness mismatches', () => {
    const product = makeProduct({ name: '' });
    const translations = makeTranslations(product);
    const report = analyzeTranslationReadiness([product], translations, requiredLanguages);

    expect(report.reasonCounts.source_missing_required_fields).to.equal(1);
    expect(report.translationReadinessMismatchCount).to.equal(1);
    expect(report.products[0].missingSourceFields).to.deep.equal(['name']);
  });
});
