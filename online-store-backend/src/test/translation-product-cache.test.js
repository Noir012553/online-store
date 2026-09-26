const chai = require('chai');
const expect = chai.expect;
const sinon = require('sinon');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const ProductCatalogTranslationCache = require('../models/ProductCatalogTranslationCache');
const LiveTranslationCache = require('../models/LiveTranslationCache');
const TranslationQualityLog = require('../models/TranslationQualityLog');
const TranslationBatchRequest = require('../models/TranslationBatchRequest');
const LanguageService = require('../services/languageService');
const cloudflareAiService = require('../services/cloudflareAiService');
const translationValidator = require('../utils/translationValidator');
const translationValidationConfig = require('../config/translationValidation');
const translationReporter = require('../utils/translationReporter');
const libretranslateProductService = require('../services/libretranslateProductService');
const retranslateSeeder = require('../seeds/retranslateSeeder');
const productCatalogRetranslationService = require('../services/productCatalogRetranslationService');
const ProductTranslationSeederService = require('../services/productTranslationSeederService');
const distributedLockService = require('../services/distributedLockService');
const { SUPPORTED_LANGUAGES, getDefaultLanguage } = require('../config/languageInventory');
const {
  getProductCatalogTranslations,
  getProductTranslations,
  translateText,
  saveProductTranslation,
  exportProductTranslationCache,
  importProductTranslationCache,
  retranslateProduct,
} = require('../controllers/translationController');

const createResponse = () => ({
  set: sinon.stub(),
  status: sinon.stub().returnsThis(),
  json: sinon.stub(),
});

describe('Product translation cache controller', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('selects retryable translations from both product cache layers', async () => {
    const liveQuery = {
      sort: sandbox.stub().returnsThis(),
      lean: sandbox.stub().resolves([]),
    };
    const catalogQuery = {
      sort: sandbox.stub().returnsThis(),
      lean: sandbox.stub().resolves([]),
    };
    const liveFind = sandbox.stub(LiveTranslationCache, 'find').returns(liveQuery);
    const catalogFind = sandbox.stub(ProductCatalogTranslationCache, 'find').returns(catalogQuery);

    await retranslateSeeder.retranslate({ dryRun: true, verbose: false });

    const liveFilter = liveFind.firstCall.args[0];
    const catalogFilter = catalogFind.firstCall.args[0];
    expect(liveFilter.provider.$in).to.include.members(
      LiveTranslationCache.schema.path('provider').enumValues,
    );
    expect(liveFilter.$or).to.deep.include({
      qualityScore: { $lt: translationValidationConfig.QUALITY_THRESHOLD_FOR_APPROVAL },
    });
    expect(liveFilter.$or).to.deep.include({ validationErrors: { $exists: true, $ne: [] } });
    expect(liveFilter.$or.find(({ status }) => status)?.status.$in).to.include.members(
      LiveTranslationCache.schema.path('status').enumValues
        .filter(status => status.startsWith('failed_') || status.endsWith('_retry')),
    );
    expect(catalogFilter.$or).to.deep.include({
      qualityScore: { $lt: translationValidationConfig.QUALITY_THRESHOLD_FOR_APPROVAL },
    });
    expect(catalogFilter.$or.find(({ status }) => status)?.status.$in).to.include.members(
      ProductCatalogTranslationCache.schema.path('status').enumValues
        .filter(status => status.startsWith('failed_') || status.endsWith('_retry')),
    );
  });

  it('retranslates matching catalog records through the product retranslation service', async () => {
    const qualityStatuses = ProductCatalogTranslationCache.schema.path('qualityStatus').enumValues;
    const needsRetranslate = qualityStatuses.find(status => /retranslat|reject/i.test(status));
    const approved = qualityStatuses.find(status => status === 'approved');
    const candidate = {
      _id: new mongoose.Types.ObjectId(),
      entityId: new mongoose.Types.ObjectId().toString(),
      targetLang: targetLanguage.code,
      name: `product-${new mongoose.Types.ObjectId()}`,
      qualityStatus: needsRetranslate,
      validationErrors: [],
    };
    sandbox.stub(LiveTranslationCache, 'find').returns({
      sort: sandbox.stub().returnsThis(),
      lean: sandbox.stub().resolves([]),
    });
    sandbox.stub(ProductCatalogTranslationCache, 'find').returns({
      sort: sandbox.stub().returnsThis(),
      lean: sandbox.stub().resolves([candidate]),
    });
    const retranslateProduct = sandbox.stub(productCatalogRetranslationService, 'retranslateProduct').resolves({
      translation: { ...candidate, qualityStatus: approved, validationErrors: [] },
      skippedManualFields: [],
    });
    sandbox.stub(translationReporter, 'printRetranslateReport');
    sandbox.stub(translationReporter, 'generateRetranslateReport').resolves({});
    sandbox.stub(translationReporter, 'saveReport');

    const result = await retranslateSeeder.retranslate({ verbose: false });

    expect(retranslateProduct.calledOnceWith(candidate.entityId, candidate.targetLang)).to.be.true;
    expect(result.stats.totalToRetranslate).to.equal(1);
    expect(result.stats.fixedCount).to.equal(1);
  });

  it('stores LibreTranslate as the final provider when Cloudflare is overloaded during retranslation', async () => {
    const targetLanguage = SUPPORTED_LANGUAGES.find(({ code }) => code !== getDefaultLanguage().code);
    const translation = {
      _id: new mongoose.Types.ObjectId(),
      hashKey: 'retranslate-hash',
      originalText: 'Laptop source',
      translatedText: 'Old translation',
      sourceLang: getDefaultLanguage().code,
      targetLang: targetLanguage.code,
      entityId: new mongoose.Types.ObjectId().toString(),
      entityType: 'product_name',
      qualityScore: 10,
      validationErrors: ['needs_retranslate'],
    };
    sandbox.stub(LiveTranslationCache, 'find').returns({
      sort: sandbox.stub().returnsThis(),
      lean: sandbox.stub().resolves([translation]),
    });
    sandbox.stub(ProductCatalogTranslationCache, 'find').returns({
      sort: sandbox.stub().returnsThis(),
      lean: sandbox.stub().resolves([]),
    });
    sandbox.stub(libretranslateProductService, 'translateWithFailover').resolves({
      translatedText: 'Laptop traduit',
      provider: 'libretranslate',
      providersUsed: ['libretranslate'],
      failoverReason: 'cloudflare_overload',
    });
    sandbox.stub(translationValidator, 'validateTranslation').resolves({
      qualityStatus: 'approved',
      qualityScore: 100,
      validationErrors: [],
    });
    sandbox.stub(LiveTranslationCache, 'findOneAndUpdate').resolves({ _id: new mongoose.Types.ObjectId() });
    sandbox.stub(LiveTranslationCache, 'updateOne').resolves({ modifiedCount: 1 });
    sandbox.stub(TranslationQualityLog, 'create').resolves({});
    sandbox.stub(ProductTranslationSeederService, '_syncProductCatalogTranslations').resolves();
    sandbox.stub(translationReporter, 'printRetranslateReport');
    sandbox.stub(translationReporter, 'generateRetranslateReport').resolves({});
    sandbox.stub(translationReporter, 'saveReport');

    const result = await retranslateSeeder.retranslate({ verbose: false, limit: 1 });
    const savedVersion = LiveTranslationCache.findOneAndUpdate.firstCall.args[1].$setOnInsert;

    expect(result.success).to.equal(true);
    expect(result.stats.remainingCount).to.equal(0);
    expect(savedVersion).to.include({
      provider: 'libretranslate',
      providerSource: 'secondary_failover',
      status: 'translated_via_libre',
      failoverReason: 'cloudflare_overload',
    });
    expect(savedVersion.metadata).to.deep.equal({ secondary_provider: true });
  });

  it('stops when Cloudflare quota is exhausted and reports unfinished translations', async () => {
    const targetLanguage = SUPPORTED_LANGUAGES.find(({ code }) => code !== getDefaultLanguage().code);
    const productEntityType = LiveTranslationCache.schema.path('entityType').enumValues
      .find((entityType) => entityType.startsWith('product_'));
    const translations = LiveTranslationCache.schema.path('provider').enumValues.map((provider, index) => ({
      _id: `translation-${index}`,
      hashKey: `hash-${index}`,
      originalText: `product ${index}`,
      sourceLang: getDefaultLanguage().code,
      targetLang: targetLanguage.code,
      entityType: productEntityType,
      provider,
      qualityScore: Math.max(0, translationValidationConfig.QUALITY_THRESHOLD_FOR_APPROVAL - 1),
      validationErrors: [],
    }));
    sandbox.stub(LiveTranslationCache, 'find').returns({
      sort: sandbox.stub().returnsThis(),
      lean: sandbox.stub().resolves(translations),
    });
    sandbox.stub(ProductCatalogTranslationCache, 'find').returns({
      sort: sandbox.stub().returnsThis(),
      lean: sandbox.stub().resolves([]),
    });
    const quotaError = Object.assign(new Error('Provider rate limit exceeded'), {
      response: { status: 429 },
    });
    sandbox.stub(libretranslateProductService, 'translateWithFailover').rejects(quotaError);
    sandbox.stub(translationReporter, 'printRetranslateReport');
    sandbox.stub(translationReporter, 'generateRetranslateReport').resolves({});
    sandbox.stub(translationReporter, 'saveReport');

    const result = await retranslateSeeder.retranslate({ verbose: false });

    expect(result.success).to.equal(false);
    expect(result.stats.quotaExceededCount).to.equal(1);
    expect(result.stats.errorCount).to.equal(1);
    expect(result.stats.remainingCount).to.equal(translations.length);
    expect(libretranslateProductService.translateWithFailover.calledOnce).to.equal(true);
  });

  const targetLanguage = SUPPORTED_LANGUAGES.find(({ code }) => code !== getDefaultLanguage().code);

  translationValidationConfig.PRESERVED_BRANDS.forEach((brand) => {
    it(`does not approve a translation missing configured brand: ${brand}`, async () => {
      sandbox.stub(LiveTranslationCache, 'findOne').resolves(null);
      const original = `${brand} ${targetLanguage.nativeName} product`;
      const translated = `${targetLanguage.name} localized product`;
      const result = await translationValidator.validateTranslation(
        original,
        translated,
        targetLanguage.code,
        'product_name',
      );

      expect(result.qualityScore).to.equal(
        translationValidator.calculateQualityScore(result.validationErrors),
      );
      expect(result.qualityStatus).not.to.equal('approved');
      expect(result.validationErrors).to.include('missing_brand');
    });
  });

  it('ignores configured non-blocking validation errors in product status', async () => {
    sandbox.stub(LiveTranslationCache, 'findOne').resolves(null);
    const brand = translationValidationConfig.PRESERVED_BRANDS[0];
    const original = brand;
    const translated = `${brand}${'x'.repeat(Math.floor(
      original.length * translationValidationConfig.MAX_LENGTH_RATIO,
    ) + 1)}`;
    const lengthError = translationValidator.checkLength(original, translated)?.error;

    expect(translationValidationConfig.NON_BLOCKING_ERRORS).to.include(lengthError);

    const result = await translationValidator.validateTranslation(
      original,
      translated,
      targetLanguage.code,
      'product_name',
    );
    const expectedScore = translationValidator.calculateQualityScore([lengthError]);
    const expectedStatus = expectedScore < translationValidationConfig.QUALITY_THRESHOLD_FOR_RETRANSLATE
      ? 'needs_retranslate'
      : expectedScore < translationValidationConfig.QUALITY_THRESHOLD_FOR_APPROVAL
        ? 'pending'
        : 'approved';

    expect(result.qualityScore).to.equal(expectedScore);
    expect(result.qualityStatus).to.equal(expectedStatus);
    expect(result.validationErrors).not.to.include(lengthError);
  });

  it('reads only successful approved product translations', async () => {
    const productId = new mongoose.Types.ObjectId().toString();
    sandbox.stub(LanguageService, 'isSupportedLanguage').resolves(true);
    const findOne = sandbox.stub(ProductCatalogTranslationCache, 'findOne').returns({
      lean: sandbox.stub().resolves({
        name: 'Laptop',
        description: 'Translated description',
        brand: 'Brand',
        specs: {},
      }),
    });
    const res = createResponse();

    await getProductCatalogTranslations({
      params: { id: productId },
      query: { lang: 'en' },
      lang: 'en',
    }, res);

    expect(findOne.calledOnceWith({
      entityId: productId,
      targetLang: 'en',
      status: 'success',
      qualityStatus: 'approved',
    })).to.be.true;
    expect(res.json.firstCall.args[0].data.name).to.equal('Laptop');
  });

  it('returns source product data for the default language', async () => {
    const productId = new mongoose.Types.ObjectId().toString();
    sandbox.stub(Product, 'findById').returns({
      select: sandbox.stub().returns({
        lean: sandbox.stub().resolves({
          name: 'Laptop source',
          description: 'Source description',
          brand: 'Source brand',
          specs: { RAM: '16GB' },
          technicalDescription: 'Technical source',
          descriptionImages: [{ url: 'https://example.invalid/source.jpg', alt: 'Source image' }],
          promotions: [{ type: 'Gift', title: 'Source gift' }],
        }),
      }),
    });
    const res = createResponse();

    await getProductTranslations({
      params: { id: productId },
      query: { lang: getDefaultLanguage().code },
      lang: getDefaultLanguage().code,
    }, res);

    expect(res.json.lastCall.args[0].data).to.deep.equal({
      name: 'Laptop source',
      description: 'Source description',
      brand: 'Source brand',
      specs: { ram: '16GB' },
      specLabels: { ram: 'RAM' },
      technicalDescription: 'Technical source',
      descriptionImages: [{ url: 'https://example.invalid/source.jpg', alt: 'Source image' }],
      promotions: [{ type: 'Gift', title: 'Source gift' }],
    });
  });

  it('does not reuse a non-approved cache record for public translation', async () => {
    sandbox.stub(LanguageService, 'isSupportedLanguage').resolves(true);
    const findOne = sandbox.stub(LiveTranslationCache, 'findOne').returns({
      lean: sandbox.stub().resolves({
        translatedText: 'Stale translation',
        status: 'success',
        qualityStatus: 'pending',
      }),
    });
    const translate = sandbox.stub(cloudflareAiService, 'translate').resolves('Fresh translation');
    sandbox.stub(LiveTranslationCache, 'findOneAndUpdate').returns({
      lean: sandbox.stub().resolves({}),
    });
    const sourceLang = getDefaultLanguage().code;
    const targetLang = SUPPORTED_LANGUAGES.find(({ code }) => code !== sourceLang).code;
    const res = createResponse();

    await translateText({
      body: { text: 'Laptop', sourceLang, targetLang },
      lang: sourceLang,
    }, res);

    expect(findOne.calledOnceWith(sinon.match({
      status: 'success',
      qualityStatus: 'approved',
    }))).to.be.true;
    expect(translate.calledOnce).to.be.true;
    expect(res.json.firstCall.args[0].data.translatedText).to.equal('Fresh translation');
  });

  it('uses only successful approved legacy translations as a fallback', async () => {
    const productId = new mongoose.Types.ObjectId().toString();
    sandbox.stub(LanguageService, 'isSupportedLanguage').resolves(true);
    sandbox.stub(ProductCatalogTranslationCache, 'findOne').returns({ lean: sandbox.stub().resolves(null) });
    const find = sandbox.stub(LiveTranslationCache, 'find').returns({
      lean: sandbox.stub().resolves([{ entityType: 'product_name', translatedText: 'Legacy laptop' }]),
    });
    const res = createResponse();

    await getProductCatalogTranslations({
      params: { id: productId },
      query: { lang: 'en' },
      lang: 'en',
    }, res);

    expect(find.calledOnceWith({
      entityId: productId,
      targetLang: 'en',
      status: 'success',
      qualityStatus: 'approved',
    })).to.be.true;
    expect(res.json.firstCall.args[0].data.name).to.equal('Legacy laptop');
  });

  it('saves manual product fields while preserving prior manual fields', async () => {
    const productId = new mongoose.Types.ObjectId().toString();
    sandbox.stub(Product, 'findById').returns({
      lean: sandbox.stub().resolves({ name: 'Laptop source' }),
    });
    sandbox.stub(ProductCatalogTranslationCache, 'findOne').returns({
      lean: sandbox.stub().resolves({ name: 'Existing laptop', manualFields: ['description'] }),
    });
    const findOneAndUpdate = sandbox.stub(ProductCatalogTranslationCache, 'findOneAndUpdate').returns({
      lean: sandbox.stub().resolves({
        entityId: productId,
        targetLang: 'en',
        name: 'Manual laptop',
        manualFields: ['description', 'name'],
      }),
    });
    sandbox.stub(Product, 'find').returns({
      select: sandbox.stub().returnsThis(),
      lean: sandbox.stub().resolves([{ _id: new mongoose.Types.ObjectId(productId), name: 'Laptop source' }]),
    });
    sandbox.stub(ProductCatalogTranslationCache, 'find').returns({
      select: sandbox.stub().returnsThis(),
      maxTimeMS: sandbox.stub().returnsThis(),
      lean: sandbox.stub().resolves([]),
    });
    sandbox.stub(Product, 'bulkWrite').resolves({ matchedCount: 1, modifiedCount: 1 });
    const res = createResponse();

    await saveProductTranslation({
      params: { id: productId },
      query: { lang: 'en' },
      body: { name: 'Manual laptop' },
      lang: 'en',
    }, res);

    expect(findOneAndUpdate.calledOnce).to.be.true;
    expect(findOneAndUpdate.firstCall.args[1].$set).to.include({
      name: 'Manual laptop',
      status: 'success',
      qualityStatus: 'approved',
    });
    expect(findOneAndUpdate.firstCall.args[1].$set.manualFields).to.have.members(['description', 'name']);
    expect(res.json.firstCall.args[0].data.name).to.equal('Manual laptop');
  });

  it('rejects manual translations that alter structured source identifiers', async () => {
    const productId = new mongoose.Types.ObjectId().toString();
    sandbox.stub(Product, 'findById').returns({
      lean: sandbox.stub().resolves({
        name: 'Laptop source',
        descriptionImages: [{ url: 'https://example.invalid/source.jpg', alt: 'Ảnh nguồn' }],
        promotions: [{ type: 'Gift', title: 'Tặng chuột', giftQuantity: 1, giftValueVND: 360000 }],
      }),
    });
    sandbox.stub(ProductCatalogTranslationCache, 'findOne').returns({ lean: sandbox.stub().resolves(null) });
    const res = createResponse();

    await saveProductTranslation({
      params: { id: productId },
      query: { lang: 'en' },
      body: {
        descriptionImages: [{ url: 'https://example.invalid/replaced.jpg', alt: 'Translated image' }],
        promotions: [{ type: 'Discount', title: 'Translated gift', giftQuantity: 1, giftValueVND: 360000 }],
      },
      lang: 'en',
    }, res);

    expect(res.status.calledWith(400)).to.be.true;
  });

  it('keeps source nested values when no text is available to retranslate', async () => {
    const productId = new mongoose.Types.ObjectId().toString();
    sandbox.stub(Product, 'findById').returns({
      lean: sandbox.stub().resolves({
        name: 'Laptop source',
        description: 'Source description',
        brand: 'Source brand',
        specs: {},
        descriptionImages: [{ url: 'https://example.invalid/source.jpg', alt: '' }],
        promotions: [{ type: 'Gift', title: '' }],
      }),
    });
    sandbox.stub(ProductCatalogTranslationCache, 'findOne').returns({
      lean: sandbox.stub().resolves({
        name: 'Existing laptop',
        descriptionImages: [{ url: 'https://example.invalid/source.jpg', alt: 'Old alt' }],
        promotions: [{ type: 'Gift', title: 'Old title' }],
        manualFields: [],
      }),
    });
    sandbox.stub(libretranslateProductService, 'translateWithFailover').callsFake(async (source) => ({
      translatedText: `en:${source}`,
      provider: 'libretranslate',
      providersUsed: ['libretranslate'],
      failoverReason: 'cloudflare_overload',
    }));
    sandbox.stub(translationValidator, 'validateTranslation').resolves({
      validationErrors: [],
      qualityScore: 100,
      qualityStatus: 'approved',
    });
    const findOneAndUpdate = sandbox.stub(ProductCatalogTranslationCache, 'findOneAndUpdate').returns({
      lean: sandbox.stub().resolves({ qualityStatus: 'approved', validationErrors: [] }),
    });
    sandbox.stub(Product, 'find').returns({
      select: sandbox.stub().returnsThis(),
      lean: sandbox.stub().resolves([{ _id: new mongoose.Types.ObjectId(productId), name: 'Laptop source' }]),
    });
    sandbox.stub(ProductCatalogTranslationCache, 'find').returns({
      select: sandbox.stub().returnsThis(),
      maxTimeMS: sandbox.stub().returnsThis(),
      lean: sandbox.stub().resolves([]),
    });
    sandbox.stub(Product, 'bulkWrite').resolves({ matchedCount: 1, modifiedCount: 1 });
    const res = createResponse();

    await retranslateProduct({
      params: { id: productId },
      body: { lang: 'en' },
      lang: 'en',
    }, res);

    const update = findOneAndUpdate.firstCall.args[1].$set;
    expect(update.descriptionImages).to.deep.equal([{ url: 'https://example.invalid/source.jpg', alt: '' }]);
    expect(update.promotions).to.deep.equal([{ type: 'Gift', title: '' }]);
    expect(update.provider).to.equal('libretranslate');
    expect(update.providersUsed).to.deep.equal(['libretranslate']);
    expect(update.providerSource).to.equal('secondary_failover');
    expect(update.failoverReason).to.equal('cloudflare_overload');
  });

  it('keeps manual fields unchanged while retranslating remaining fields in bounded parallel', async () => {
    const productId = new mongoose.Types.ObjectId().toString();
    sandbox.stub(Product, 'findById').returns({
      lean: sandbox.stub().resolves({
        name: 'Laptop source',
        description: 'Source description',
        technicalDescription: 'Technical source',
        brand: 'Source brand',
        specs: { RAM: '16GB' },
      }),
    });
    sandbox.stub(ProductCatalogTranslationCache, 'findOne').returns({
      lean: sandbox.stub().resolves({
        name: 'Manual laptop',
        manualFields: ['name'],
      }),
    });
    let activeTranslations = 0;
    let maximumActiveTranslations = 0;
    const translate = sandbox.stub(libretranslateProductService, 'translateWithFailover').callsFake(async (source) => {
      activeTranslations++;
      maximumActiveTranslations = Math.max(maximumActiveTranslations, activeTranslations);
      await new Promise((resolve) => setTimeout(resolve, 10));
      activeTranslations--;
      return { translatedText: `en:${source}`, provider: 'cloudflare' };
    });
    sandbox.stub(translationValidator, 'validateTranslation').resolves({
      validationErrors: [],
      qualityScore: 100,
      qualityStatus: 'approved',
    });
    const findOneAndUpdate = sandbox.stub(ProductCatalogTranslationCache, 'findOneAndUpdate').returns({
      lean: sandbox.stub().resolves({
        qualityStatus: 'approved',
        manualFields: ['name'],
        updatedAt: null,
        lastTranslatedAt: null,
        validationErrors: [],
      }),
    });
    sandbox.stub(Product, 'find').returns({
      select: sandbox.stub().returnsThis(),
      lean: sandbox.stub().resolves([{
        _id: new mongoose.Types.ObjectId(productId),
        name: 'Laptop source',
        description: 'Source description',
        technicalDescription: 'Technical source',
        brand: 'Source brand',
        specs: { RAM: '16GB' },
      }]),
    });
    sandbox.stub(ProductCatalogTranslationCache, 'find').returns({
      select: sandbox.stub().returnsThis(),
      maxTimeMS: sandbox.stub().returnsThis(),
      lean: sandbox.stub().resolves([]),
    });
    sandbox.stub(Product, 'bulkWrite').resolves({ matchedCount: 1, modifiedCount: 1 });
    const res = createResponse();

    await retranslateProduct({
      params: { id: productId },
      body: { lang: 'en' },
      lang: 'en',
    }, res);

    expect(translate.callCount).to.equal(3);
    expect(maximumActiveTranslations).to.equal(2);
    expect(findOneAndUpdate.firstCall.args[1].$set).to.include({
      name: 'Manual laptop',
      description: 'en:Source description',
      technicalDescription: 'en:Technical source',
      brand: 'Source brand',
    });
    expect(findOneAndUpdate.firstCall.args[1].$set.specs).to.deep.equal({ RAM: 'en:16GB' });
    expect(res.json.firstCall.args[0].data.skippedManualFields).to.deep.equal(['name']);
  });

  it('dịch text scraper có cấu trúc song song có giới hạn và giữ nguyên URL, giá trị nghiệp vụ', async () => {
    const productId = new mongoose.Types.ObjectId();
    sandbox.stub(distributedLockService, 'initialize').resolves();
    sandbox.stub(distributedLockService, 'isLocked').resolves(false);
    sandbox.stub(distributedLockService, 'acquireLock').resolves('lock-id');
    sandbox.stub(distributedLockService, 'releaseLock').resolves();
    sandbox.stub(LiveTranslationCache, 'findOne').returns({ lean: sandbox.stub().resolves(null) });
    const saveTranslation = sandbox.stub(LiveTranslationCache, 'bulkWrite').resolves({});
    const originalEnv = {
      LIBRETRANSLATE_ENABLED: process.env.LIBRETRANSLATE_ENABLED,
      PRODUCT_TRANSLATION_FIELD_CONCURRENCY: process.env.PRODUCT_TRANSLATION_FIELD_CONCURRENCY,
    };
    process.env.LIBRETRANSLATE_ENABLED = 'false';
    process.env.PRODUCT_TRANSLATION_FIELD_CONCURRENCY = '2';
    let activeTranslations = 0;
    let maximumActiveTranslations = 0;
    sandbox.stub(cloudflareAiService, 'translate').callsFake(async (text) => {
      activeTranslations++;
      maximumActiveTranslations = Math.max(maximumActiveTranslations, activeTranslations);
      await new Promise((resolve) => setTimeout(resolve, 10));
      activeTranslations--;
      return `en:${text}`;
    });
    sandbox.stub(translationValidator, 'validateTranslation').resolves({
      validationErrors: [],
      qualityScore: 100,
      qualityStatus: 'approved',
    });

    let result;
    try {
      result = await ProductTranslationSeederService._translateProduct({
        _id: productId,
        name: 'Laptop',
        description: 'Mô tả',
        specs: { RAM: '16GB' },
        technicalDescription: 'Thông số kỹ thuật',
        descriptionImages: [{ url: 'https://example.invalid/spec.jpg', alt: 'Ảnh thông số' }],
        promotions: [{
          type: 'Gift',
          title: 'Tặng chuột',
          giftQuantity: 1,
          giftProductName: 'Chuột không dây',
          giftProductUrl: 'https://example.invalid/mouse',
          giftValueVND: 360000,
          scope: 'Toàn quốc',
          discountText: 'Giảm 10%',
        }],
      }, 'en', 'vi', 0);
    } finally {
      if (originalEnv.LIBRETRANSLATE_ENABLED === undefined) delete process.env.LIBRETRANSLATE_ENABLED;
      else process.env.LIBRETRANSLATE_ENABLED = originalEnv.LIBRETRANSLATE_ENABLED;
      if (originalEnv.PRODUCT_TRANSLATION_FIELD_CONCURRENCY === undefined) delete process.env.PRODUCT_TRANSLATION_FIELD_CONCURRENCY;
      else process.env.PRODUCT_TRANSLATION_FIELD_CONCURRENCY = originalEnv.PRODUCT_TRANSLATION_FIELD_CONCURRENCY;
    }

    const records = saveTranslation.firstCall.args[0].map((operation) => operation.updateOne.update.$set);
    expect(result.success).to.equal(9);
    expect(result.rateLimitErr).to.equal(0);
    expect(result.failoverErr).to.equal(0);
    expect(result.otherErr).to.equal(0);
    expect(maximumActiveTranslations).to.equal(2);
    expect(records.some(({ entityType, fieldKey, originalText }) => (
      entityType === 'product_technical_description'
      && fieldKey === 'technicalDescription'
      && originalText === 'Thông số kỹ thuật'
    ))).to.equal(true);
    expect(records.some(({ entityType, fieldKey, originalText }) => (
      entityType === 'product_description_image_alt'
      && fieldKey === 'descriptionImages.0.alt'
      && originalText === 'Ảnh thông số'
    ))).to.equal(true);
    const promotionRecords = records.filter(({ entityType }) => entityType === 'product_promotion');
    expect(promotionRecords).to.have.lengthOf(4);
    expect(promotionRecords.some(({ fieldKey, originalText }) => (
      fieldKey === 'promotions.0.title' && originalText === 'Tặng chuột'
    ))).to.equal(true);
    expect(promotionRecords.some(({ fieldKey, originalText }) => (
      fieldKey === 'promotions.0.giftProductName' && originalText === 'Chuột không dây'
    ))).to.equal(true);
    expect(promotionRecords.some(({ fieldKey, originalText }) => (
      fieldKey === 'promotions.0.scope' && originalText === 'Toàn quốc'
    ))).to.equal(true);
    expect(promotionRecords.some(({ fieldKey, originalText }) => (
      fieldKey === 'promotions.0.discountText' && originalText === 'Giảm 10%'
    ))).to.equal(true);
  });

  it('does not share product translation cache records for identical source text', async () => {
    sandbox.stub(distributedLockService, 'initialize').resolves();
    sandbox.stub(distributedLockService, 'isLocked').resolves(false);
    sandbox.stub(distributedLockService, 'acquireLock').resolves('lock-id');
    sandbox.stub(distributedLockService, 'releaseLock').resolves();
    sandbox.stub(LiveTranslationCache, 'findOne').returns({ lean: sandbox.stub().resolves(null) });
    const saveTranslation = sandbox.stub(LiveTranslationCache, 'bulkWrite').resolves({});
    sandbox.stub(cloudflareAiService, 'translate').callsFake(async (text) => `en:${text}`);
    sandbox.stub(translationValidator, 'validateTranslation').resolves({
      validationErrors: [],
      qualityScore: 100,
      qualityStatus: 'approved',
    });

    const sourceProduct = { name: 'Same product name' };
    await ProductTranslationSeederService._translateProduct({
      ...sourceProduct,
      _id: new mongoose.Types.ObjectId(),
    }, 'en', 'vi', 0);
    await ProductTranslationSeederService._translateProduct({
      ...sourceProduct,
      _id: new mongoose.Types.ObjectId(),
    }, 'en', 'vi', 1);

    const records = saveTranslation.getCalls()
      .flatMap((call) => call.args[0].map((operation) => operation.updateOne.update.$set));
    expect(records).to.have.lengthOf(2);
    expect(records[0].hashKey).to.not.equal(records[1].hashKey);
    expect(records[0].entityId).to.not.equal(records[1].entityId);
  });

  it('exports only the requested fields for valid product and language filters', async () => {
    const productId = new mongoose.Types.ObjectId().toString();
    const find = sandbox.stub(ProductCatalogTranslationCache, 'find').returns({
      lean: sandbox.stub().resolves([{
        entityId: productId,
        targetLang: 'en',
        name: 'Laptop',
        description: 'Translated description',
        brand: 'Translated brand',
        manualFields: ['name'],
      }]),
    });
    const res = createResponse();

    await exportProductTranslationCache({
      query: { productIds: productId, languages: 'en', fields: 'name,description,brand' },
      lang: 'en',
    }, res);

    expect(find.calledOnceWith({ entityId: { $in: [productId] }, targetLang: { $in: ['en'] } })).to.be.true;
    expect(res.json.calledOnce).to.be.true;
    expect(res.json.firstCall.args[0].data.records).to.deep.equal([{
      productId,
      targetLang: 'en',
      translations: { name: 'Laptop', description: 'Translated description', brand: 'Translated brand' },
      manualFields: ['name'],
      updatedAt: null,
    }]);
  });

  it('rejects imports without a valid idempotency key before changing the cache', async () => {
    const productId = new mongoose.Types.ObjectId().toString();
    const res = createResponse();

    await importProductTranslationCache({
      body: {
        records: [{ productId, targetLang: 'en', translations: { name: 'Laptop' } }],
        idempotencyKey: 'short',
      },
      lang: 'en',
      user: { id: 'admin' },
    }, res);

    expect(res.status.calledWith(400)).to.be.true;
  });

  it('removes the idempotency request when importing the cache fails', async () => {
    const productId = new mongoose.Types.ObjectId().toString();
    const deleteOne = sandbox.stub().resolves();
    sandbox.stub(TranslationBatchRequest, 'create').resolves({ _id: 'batch-request', deleteOne });
    sandbox.stub(Product, 'find').returns({
      select: sandbox.stub().returns({
        lean: sandbox.stub().resolves([{ _id: new mongoose.Types.ObjectId(productId), name: 'Laptop source' }]),
      }),
    });
    sandbox.stub(ProductCatalogTranslationCache, 'find').returns({
      select: sandbox.stub().returnsThis(),
      maxTimeMS: sandbox.stub().returnsThis(),
      lean: sandbox.stub().resolves([]),
    });
    sandbox.stub(Product, 'bulkWrite').resolves({ matchedCount: 1, modifiedCount: 1 });
    sandbox.stub(ProductCatalogTranslationCache, 'bulkWrite').rejects(new Error('Database unavailable'));
    const res = createResponse();

    await importProductTranslationCache({
      body: {
        records: [{ productId, targetLang: 'en', translations: { name: 'Laptop' } }],
        idempotencyKey: 'translation-import-0002',
      },
      lang: 'en',
      user: { id: 'admin' },
    }, res);

    expect(deleteOne.calledOnce).to.be.true;
    expect(res.status.calledWith(500)).to.be.true;
  });

  it('rejects imported translations that alter structured source identifiers', async () => {
    const productId = new mongoose.Types.ObjectId().toString();
    const deleteOne = sandbox.stub().resolves();
    sandbox.stub(TranslationBatchRequest, 'create').resolves({ _id: 'batch-request', deleteOne });
    sandbox.stub(Product, 'find').returns({
      select: sandbox.stub().returns({
        lean: sandbox.stub().resolves([{
          _id: new mongoose.Types.ObjectId(productId),
          name: 'Laptop source',
          brand: 'Source brand',
          descriptionImages: [{ url: 'https://example.invalid/source.jpg', alt: 'Ảnh nguồn' }],
          promotions: [{ type: 'Gift', title: 'Tặng chuột', giftQuantity: 1 }],
        }]),
      }),
    });
    sandbox.stub(ProductCatalogTranslationCache, 'find').returns({ lean: sandbox.stub().resolves([]) });
    const res = createResponse();

    await importProductTranslationCache({
      body: {
        records: [{
          productId,
          targetLang: 'en',
          translations: {
            descriptionImages: [{ url: 'https://example.invalid/source.jpg', alt: 'Translated alt' }],
            promotions: [{ type: 'Gift', title: 'Translated gift', giftQuantity: 2 }],
          },
        }],
        idempotencyKey: 'translation-import-structured-0001',
      },
      lang: 'en',
      user: { id: 'admin' },
    }, res);

    expect(deleteOne.calledOnce).to.be.true;
    expect(res.status.calledWith(400)).to.be.true;
  });

  it('does not overwrite manual translation fields during import by default', async () => {
    const productId = new mongoose.Types.ObjectId().toString();
    const deleteOne = sandbox.stub().resolves();
    sandbox.stub(TranslationBatchRequest, 'create').resolves({ _id: 'batch-request', deleteOne });
    sandbox.stub(Product, 'find').returns({
      select: sandbox.stub().returns({
        lean: sandbox.stub().resolves([{
          _id: new mongoose.Types.ObjectId(productId),
          name: 'Laptop source',
          brand: 'Source brand',
        }]),
      }),
    });
    sandbox.stub(ProductCatalogTranslationCache, 'find').returns({
      select: sandbox.stub().returnsThis(),
      maxTimeMS: sandbox.stub().returnsThis(),
      lean: sandbox.stub().resolves([{
        entityId: productId,
        targetLang: 'en',
        name: 'Manual laptop',
        manualFields: ['name'],
      }]),
    });
    sandbox.stub(Product, 'bulkWrite').resolves({ matchedCount: 1, modifiedCount: 1 });
    const bulkWrite = sandbox.stub(ProductCatalogTranslationCache, 'bulkWrite').resolves({ modifiedCount: 1, upsertedCount: 0 });
    sandbox.stub(TranslationBatchRequest, 'updateOne').resolves();
    const res = createResponse();

    await importProductTranslationCache({
      body: {
        records: [{
          productId,
          targetLang: 'en',
          translations: { name: 'Machine laptop', brand: 'Translated brand' },
        }],
        idempotencyKey: 'translation-import-0003',
      },
      lang: 'en',
      user: { id: 'admin' },
    }, res);

    const update = bulkWrite.firstCall.args[0][0].updateOne.update.$set;
    expect(update.name).to.equal('Manual laptop');
    expect(update.brand).to.equal('Translated brand');
    expect(res.json.firstCall.args[0].data.skippedManualFields).to.equal(1);
  });

  it('preserves specification keys containing dots', () => {
    const entityId = new mongoose.Types.ObjectId().toString();
    const specKey = [
      new mongoose.Types.ObjectId().toString(),
      new mongoose.Types.ObjectId().toString(),
    ].join('.');
    const specValue = new mongoose.Types.ObjectId().toString();
    const cacheEntry = new ProductCatalogTranslationCache({
      entityId,
      targetLang: getDefaultLanguage().code,
      name: `Product ${entityId}`,
      specs: { [specKey]: specValue },
    });

    expect(cacheEntry.toObject().specs).to.deep.equal({ [specKey]: specValue });
  });

  it('imports a record using the product name when the selected fields omit name', async () => {
    const productId = new mongoose.Types.ObjectId().toString();
    const deleteOne = sandbox.stub().resolves();
    const create = sandbox.stub(TranslationBatchRequest, 'create').resolves({ _id: 'batch-request', deleteOne });
    sandbox.stub(Product, 'find').returns({
      select: sandbox.stub().returns({
        lean: sandbox.stub().resolves([{ _id: new mongoose.Types.ObjectId(productId), name: 'Laptop source' }]),
      }),
    });
    sandbox.stub(ProductCatalogTranslationCache, 'find').returns({
      select: sandbox.stub().returnsThis(),
      maxTimeMS: sandbox.stub().returnsThis(),
      lean: sandbox.stub().resolves([]),
    });
    sandbox.stub(Product, 'bulkWrite').resolves({ matchedCount: 1, modifiedCount: 1 });
    const bulkWrite = sandbox.stub(ProductCatalogTranslationCache, 'bulkWrite').resolves({ modifiedCount: 0, upsertedCount: 1 });
    sandbox.stub(TranslationBatchRequest, 'updateOne').resolves();
    const res = createResponse();

    await importProductTranslationCache({
      body: {
        records: [{
          productId,
          targetLang: 'en',
          translations: { description: 'Translated description' },
        }],
        idempotencyKey: 'translation-import-0001',
      },
      lang: 'en',
      user: { id: 'admin' },
    }, res);

    expect(create.calledOnce).to.be.true;
    expect(bulkWrite.calledOnce).to.be.true;
    expect(bulkWrite.firstCall.args[0][0].updateOne.update.$set).to.include({
      name: 'Laptop source',
      description: 'Translated description',
      status: 'success',
      qualityStatus: 'approved',
    });
    expect(res.json.firstCall.args[0].data).to.deep.equal({ totalProcessed: 1, importedCount: 1 });
  });
});
