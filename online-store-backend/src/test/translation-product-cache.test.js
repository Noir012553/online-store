const chai = require('chai');
const expect = chai.expect;
const sinon = require('sinon');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const ProductCatalogTranslationCache = require('../models/ProductCatalogTranslationCache');
const LiveTranslationCache = require('../models/LiveTranslationCache');
const { RetranslationProgress } = require('../models/RetranslationProgress');
const TranslationQualityLog = require('../models/TranslationQualityLog');
const TranslationBatchRequest = require('../models/TranslationBatchRequest');
const LanguageService = require('../services/languageService');
const cloudflareAiService = require('../services/cloudflareAiService');
const translationValidator = require('../utils/translationValidator');
const translationValidationConfig = require('../config/translationValidation');
const translationReporter = require('../utils/translationReporter');
const RateLimitHandler = require('../services/rateLimitHandler');
const productTranslationService = require('../services/productTranslationService');
const retranslateSeeder = require('../seeds/retranslateSeeder');
const productCatalogRetranslationService = require('../services/productCatalogRetranslationService');
const { getProductTranslationSourceHash } = require('../utils/productTranslationFingerprint');
const ProductTranslationSeederService = require('../services/productTranslationSeederService');
const retranslateProgress = require('../utils/retranslateProgress');
const {
  isCatalogProductRetranslatable,
  isLiveProductRetranslatable,
} = require('../utils/productRetranslationSelector');
const {
  getProductFieldWorkKey,
  getWorkKey,
  openProductCheckpoint,
  hasCompleted,
  markCompleted,
  openCheckpoint,
} = retranslateProgress;
const productTranslationLock = require('../utils/productTranslationLock');
const distributedLockService = require('../services/distributedLockService');
const { SUPPORTED_LANGUAGES, getDefaultLanguage } = require('../config/languageInventory');
const {
  getProductCatalogTranslations,
  getProductTranslationStatuses,
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

const stubCatalogRetranslationReads = (sandbox, product) => {
  sandbox.stub(Product, 'findById').returns({ lean: sandbox.stub().resolves(product) });
  sandbox.stub(Product, 'find').returns({
    select: sandbox.stub().returnsThis(),
    lean: sandbox.stub().resolves([product]),
  });
  sandbox.stub(ProductCatalogTranslationCache, 'find').returns({
    select: sandbox.stub().returnsThis(),
    maxTimeMS: sandbox.stub().returnsThis(),
    lean: sandbox.stub().resolves([]),
  });
  sandbox.stub(Product, 'bulkWrite').resolves({ matchedCount: 1, modifiedCount: 1 });
  sandbox.stub(LiveTranslationCache, 'updateMany').resolves({ modifiedCount: 0 });
  sandbox.stub(productTranslationLock, 'acquireProductTranslationLock').resolves(async () => {});
};

describe('Product translation cache controller', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(retranslateProgress, 'acquireDatabaseLock').resolves({ release: async () => {} });
    sandbox.stub(retranslateProgress, 'openProductCheckpoint').returns({
      signature: 'test-product-checkpoint',
      completed: new Map(),
      initialized: false,
    });
    sandbox.stub(retranslateProgress, 'hydrateCheckpoint').resolves();
    sandbox.stub(retranslateProgress, 'markCompletedDurably').resolves();
    sandbox.stub(retranslateProgress, 'clearProductFieldCheckpoint').resolves();
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('updates existing catalog status when approved field data becomes incomplete', async () => {
    const productId = new mongoose.Types.ObjectId().toString();
    const product = {
      _id: new mongoose.Types.ObjectId(productId),
      name: 'Source laptop',
      description: '',
      brand: 'Brand',
      specs: {},
      technicalDescription: '',
      descriptionImages: [],
      promotions: [],
    };
    sandbox.stub(Product, 'find').callsFake(() => ({
      select: () => ({ lean: async () => [product] }),
    }));
    sandbox.stub(LiveTranslationCache, 'find').returns({
      select: sandbox.stub().returnsThis(),
      lean: sandbox.stub().resolves([]),
    });
    const bulkWrite = sandbox.stub(ProductCatalogTranslationCache, 'bulkWrite').resolves({
      matchedCount: 1,
      modifiedCount: 1,
    });
    sandbox.stub(ProductCatalogTranslationCache, 'find').returns({
      select: sandbox.stub().returnsThis(),
      maxTimeMS: sandbox.stub().returnsThis(),
      lean: sandbox.stub().resolves([]),
    });
    sandbox.stub(Product, 'bulkWrite').resolves({ matchedCount: 1, modifiedCount: 1 });

    await ProductTranslationSeederService._syncProductCatalogTranslations('en', [productId]);

    const update = bulkWrite.firstCall.args[0][0].updateOne.update.$set;
    expect(update.qualityStatus).to.equal('pending');
    expect(update.validationErrors).to.include('missing_name');
    expect(update.sourceHash).to.equal(getProductTranslationSourceHash(product));
    expect(update).not.to.have.property('name');
    expect(Product.bulkWrite.calledOnce).to.be.true;
  });

  it('uses the same retranslation eligibility for catalog and legacy records', () => {
    expect(isCatalogProductRetranslatable({ status: 'success', qualityStatus: 'approved', qualityScore: 100, validationErrors: [] })).to.be.false;
    expect(isCatalogProductRetranslatable({ status: 'success', qualityStatus: 'needs_retranslate', validationErrors: [] })).to.be.true;
    expect(isCatalogProductRetranslatable({
      status: 'success',
      qualityStatus: 'approved',
      validationErrors: ['too_long'],
    })).to.be.true;
    expect(isLiveProductRetranslatable({
      provider: 'cloudflare',
      status: 'success',
      qualityStatus: 'approved',
      qualityScore: 100,
      validationErrors: [],
    })).to.be.false;
    expect(isLiveProductRetranslatable({
      provider: 'cloudflare',
      status: 'success',
      qualityStatus: 'rejected',
      validationErrors: [],
    })).to.be.true;
  });

  it('keeps invalid manual product overrides pending', async () => {
    sandbox.stub(LiveTranslationCache, 'findOne').returns({
      lean: sandbox.stub().resolves({
        entityType: 'product_name',
        originalText: 'Source laptop name',
        targetLang: 'en',
      }),
    });
    sandbox.stub(translationValidator, 'validateTranslation').resolves({
      validationErrors: ['too_long'],
      qualityScore: 85,
      qualityStatus: 'pending',
    });
    const findOneAndUpdate = sandbox.stub(LiveTranslationCache, 'findOneAndUpdate').resolves({
      hashKey: 'field-hash',
      entityId: 'product-id',
      targetLang: 'en',
      entityType: 'product_name',
      status: 'success',
      qualityStatus: 'pending',
      validationErrors: ['too_long'],
    });

    await RateLimitHandler.manualOverride('field-hash', 'A very long invalid translation');

    expect(findOneAndUpdate.firstCall.args[1].$set).to.include({
      status: 'success',
      qualityStatus: 'pending',
      qualityScore: 85,
    });
    expect(findOneAndUpdate.firstCall.args[1].$set.validationErrors).to.deep.equal(['too_long']);
  });

  it('reports approved catalog records with validation errors as pending', async () => {
    const productId = new mongoose.Types.ObjectId().toString();
    const product = {
      _id: new mongoose.Types.ObjectId(productId),
      name: 'Laptop source',
      description: 'Source description',
      brand: 'Brand',
      specs: {},
      technicalDescription: '',
      descriptionImages: [],
      promotions: [],
    };
    sandbox.stub(ProductCatalogTranslationCache, 'find').returns({
      lean: sandbox.stub().resolves([{
        entityId: productId,
        targetLang: 'en',
        sourceHash: getProductTranslationSourceHash(product),
        status: 'success',
        qualityStatus: 'approved',
        validationErrors: ['too_long'],
      }]),
    });
    sandbox.stub(Product, 'find').returns({
      select: sandbox.stub().returnsThis(),
      lean: sandbox.stub().resolves([product]),
    });
    sandbox.stub(LiveTranslationCache, 'find').returns({
      lean: sandbox.stub().resolves([]),
    });
    const res = createResponse();

    await getProductTranslationStatuses({
      query: { lang: 'en', productIds: productId },
      lang: 'en',
    }, res);

    expect(res.json.firstCall.args[0].data[0]).to.include({
      productId,
      status: 'pending',
      canRetranslate: true,
    });
    expect(res.json.firstCall.args[0].data[0].validationErrors).to.deep.equal(['too_long']);
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
    expect(liveFilter.$or).to.deep.include({ validationErrors: { $exists: true, $ne: [] } });
    const liveLowScore = liveFilter.$or.find(condition => condition.qualityStatus?.$ne === 'approved');
    expect(liveLowScore.qualityScore).to.deep.equal({
      $lt: translationValidationConfig.QUALITY_THRESHOLD_FOR_APPROVAL,
    });
    expect(liveFilter.$or.find(({ status }) => status)?.status.$in).to.include.members(
      LiveTranslationCache.schema.path('status').enumValues
        .filter(status => status.startsWith('failed_') || status.endsWith('_retry')),
    );
    expect(catalogFilter.$or).to.deep.include({ validationErrors: { $exists: true, $ne: [] } });
    const catalogLowScore = catalogFilter.$or.find(condition => condition.qualityStatus?.$ne === 'approved');
    expect(catalogLowScore.qualityScore).to.deep.equal({
      $lt: translationValidationConfig.QUALITY_THRESHOLD_FOR_APPROVAL,
    });
    expect(catalogFilter.$or.find(({ status }) => status)?.status.$in).to.include.members(
      ProductCatalogTranslationCache.schema.path('status').enumValues
        .filter(status => status.startsWith('failed_') || status.endsWith('_retry')),
    );
  });

  it('keeps completed progress after a limited batch', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'retranslate-limited-'));
    const candidate = {
      _id: new mongoose.Types.ObjectId(),
      entityId: new mongoose.Types.ObjectId().toString(),
      targetLang: targetLanguage.code,
      sourceHash: 'source-v1',
      name: 'Product',
      qualityStatus: 'needs_retranslate',
      validationErrors: ['needs_retranslate'],
    };
    const checkpointOptions = {
      filter: {},
      lang: null,
      entityType: null,
      limit: 1,
      dryRun: false,
      validate: true,

    };
    const checkpoint = openCheckpoint(checkpointOptions, directory);
    sandbox.stub(LiveTranslationCache, 'find').returns({
      sort: sandbox.stub().returnsThis(),
      limit: sandbox.stub().returnsThis(),
      lean: sandbox.stub().resolves([]),
    });
    sandbox.stub(ProductCatalogTranslationCache, 'find').returns({
      sort: sandbox.stub().returnsThis(),
      limit: sandbox.stub().returnsThis(),
      lean: sandbox.stub().resolves([candidate]),
    });
    sandbox.stub(Product, 'find').returns({
      select: sandbox.stub().returnsThis(),
      lean: sandbox.stub().resolves([{ _id: candidate.entityId, name: 'Source product' }]),
    });
    sandbox.stub(productCatalogRetranslationService, 'retranslateProduct').resolves({
      translation: { ...candidate, qualityStatus: 'approved', validationErrors: [] },
      skippedManualFields: [],
    });
    sandbox.stub(RetranslationProgress, 'updateOne').resolves({ acknowledged: true });
    const deleteMany = sandbox.stub(RetranslationProgress, 'deleteMany').resolves({ deletedCount: 1 });
    sandbox.stub(translationReporter, 'printRetranslateReport');
    sandbox.stub(translationReporter, 'generateRetranslateReport').resolves({});
    sandbox.stub(translationReporter, 'saveReport');

    try {
      await retranslateSeeder.retranslate({ ...checkpointOptions, checkpoint, verbose: false });
      expect(deleteMany.called).to.be.false;
      expect(fs.existsSync(checkpoint.filePath)).to.be.true;
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('deduplicates catalog and field-cache candidates into one product-language job', async () => {
    const entityId = new mongoose.Types.ObjectId().toString();
    const product = {
      _id: new mongoose.Types.ObjectId(entityId),
      name: 'Source product',
      description: 'Source description',
      technicalDescription: '',
      specs: {},
      descriptionImages: [],
      promotions: [],
    };
    const catalogCandidate = {
      _id: new mongoose.Types.ObjectId(),
      entityId,
      targetLang: targetLanguage.code,
      sourceHash: 'old-source-hash',
      name: 'Old product translation',
      qualityStatus: 'needs_retranslate',
      validationErrors: ['needs_retranslate'],
    };
    const fieldCandidates = ['product_name', 'product_description'].map((entityType, index) => ({
      _id: new mongoose.Types.ObjectId(),
      hashKey: `field-${index}`,
      originalText: `Field ${index}`,
      translatedText: `Old field translation ${index}`,
      targetLang: targetLanguage.code,
      entityId,
      entityType,
      qualityStatus: 'needs_retranslate',
      validationErrors: ['needs_retranslate'],
    }));
    sandbox.stub(LiveTranslationCache, 'find').returns({
      sort: sandbox.stub().returnsThis(),
      lean: sandbox.stub().resolves(fieldCandidates),
    });
    sandbox.stub(ProductCatalogTranslationCache, 'find').returns({
      sort: sandbox.stub().returnsThis(),
      lean: sandbox.stub().resolves([catalogCandidate]),
    });
    sandbox.stub(Product, 'find').returns({
      select: sandbox.stub().returnsThis(),
      lean: sandbox.stub().resolves([product]),
    });
    let activeJobs = 0;
    let maxActiveJobs = 0;
    const retranslateProduct = sandbox.stub(productCatalogRetranslationService, 'retranslateProduct').callsFake(async () => {
      activeJobs++;
      maxActiveJobs = Math.max(maxActiveJobs, activeJobs);
      await new Promise(resolve => setTimeout(resolve, 10));
      activeJobs--;
      return {
        translation: {
          ...catalogCandidate,
          sourceHash: getProductTranslationSourceHash(product),
          qualityStatus: 'approved',
          validationErrors: [],
        },
        skippedManualFields: [],
      };
    });
    sandbox.stub(translationReporter, 'printRetranslateReport');
    sandbox.stub(translationReporter, 'generateRetranslateReport').resolves({});
    sandbox.stub(translationReporter, 'saveReport');

    const result = await retranslateSeeder.retranslate({ concurrency: 2, verbose: false });

    expect(result.stats.totalToRetranslate).to.equal(1);
    expect(retranslateProduct.calledOnce).to.be.true;
    expect(maxActiveJobs).to.equal(1);
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
    sandbox.stub(Product, 'find').returns({
      select: sandbox.stub().returnsThis(),
      lean: sandbox.stub().resolves([{ _id: candidate.entityId, name: 'Source product' }]),
    });
    const retranslateProduct = sandbox.stub(productCatalogRetranslationService, 'retranslateProduct').resolves({
      translation: { ...candidate, qualityStatus: approved, validationErrors: [] },
      skippedManualFields: [],
    });
    sandbox.stub(translationReporter, 'printRetranslateReport');
    sandbox.stub(translationReporter, 'generateRetranslateReport').resolves({});
    sandbox.stub(translationReporter, 'saveReport');

    const result = await retranslateSeeder.retranslate({ verbose: false });

    expect(retranslateProduct.calledOnceWith(candidate.entityId, candidate.targetLang, {
      checkpoint: null,
      parallelProducts: 1,
    })).to.be.true;
    expect(result.stats.totalToRetranslate).to.equal(1);
    expect(result.stats.fixedCount).to.equal(1);
  });

  it('resumes a catalog translation using the source hash saved by retranslation', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'retranslate-catalog-'));
    const product = {
      _id: new mongoose.Types.ObjectId(),
      name: 'Source product',
      specs: {},
    };
    const candidate = {
      _id: new mongoose.Types.ObjectId(),
      entityId: product._id.toString(),
      targetLang: targetLanguage.code,
      sourceHash: 'source-before',
      name: 'Product',
      qualityStatus: 'needs_retranslate',
      validationErrors: ['needs_retranslate'],
    };
    const checkpointOptions = {
      filter: {},
      lang: null,
      entityType: null,
      limit: 0,
      dryRun: false,
      validate: true,

    };
    const checkpoint = openCheckpoint(checkpointOptions, directory);
    const emptyLiveQuery = {
      sort: sandbox.stub().returnsThis(),
      lean: sandbox.stub().resolves([]),
    };
    const catalogQuery = sourceHash => ({
      sort: sandbox.stub().returnsThis(),
      lean: sandbox.stub().resolves([{ ...candidate, sourceHash }]),
    });
    sandbox.stub(LiveTranslationCache, 'find').returns(emptyLiveQuery);
    sandbox.stub(Product, 'find').returns({
      select: sandbox.stub().returnsThis(),
      lean: sandbox.stub().resolves([product]),
    });
    const catalogFind = sandbox.stub(ProductCatalogTranslationCache, 'find');
    catalogFind.onFirstCall().returns(catalogQuery('source-before'));
    catalogFind.onSecondCall().returns(catalogQuery('source-after'));
    sandbox.stub(productCatalogRetranslationService, 'retranslateProduct').resolves({
      translation: {
        ...candidate,
        sourceHash: getProductTranslationSourceHash(product),
        qualityStatus: 'needs_retranslate',
        validationErrors: ['needs_retranslate'],
      },
      skippedManualFields: [],
    });
    sandbox.stub(RetranslationProgress, 'updateOne').resolves({ acknowledged: true });
    sandbox.stub(translationReporter, 'printRetranslateReport');
    sandbox.stub(translationReporter, 'generateRetranslateReport').resolves({});
    sandbox.stub(translationReporter, 'saveReport');

    try {
      await retranslateSeeder.retranslate({ ...checkpointOptions, checkpoint, verbose: false });
      expect(hasCompleted(checkpoint, getWorkKey({
        ...candidate,
        sourceHash: getProductTranslationSourceHash(product),
        retranslateSource: 'catalog',
      }))).to.equal(true);

      const resumed = await retranslateSeeder.retranslate({ ...checkpointOptions, checkpoint, verbose: false });

      expect(resumed.stats.totalToRetranslate).to.equal(0);
      expect(resumed.stats.matchedCount).to.equal(1);
      expect(resumed.stats.resumedCount).to.equal(1);
      expect(productCatalogRetranslationService.retranslateProduct.calledOnce).to.be.true;
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('resumes completed product fields after a provider failure without repeating requests', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'retranslate-fields-'));
    const productId = new mongoose.Types.ObjectId().toString();
    const product = {
      _id: new mongoose.Types.ObjectId(productId),
      name: 'Source name',
      description: 'Source description',
      technicalDescription: 'Source technical description',
      specs: {},
      descriptionImages: [],
      promotions: [],
    };
    const sourceHash = getProductTranslationSourceHash(product);
    const checkpoint = openCheckpoint({ filter: {}, lang: null, limit: 0 }, directory);
    const nameKey = getProductFieldWorkKey({
      productId,
      targetLang: 'en',
      field: 'name',
      source: product.name,
    });
    markCompleted(checkpoint, nameKey, {
      payload: {
        value: 'Cached name',
        validation: { qualityStatus: 'approved', qualityScore: 100, validationErrors: [] },
        providersUsed: ['cloudflare'],
      },
    });
    const originalConcurrency = process.env.PRODUCT_RETRANSLATION_FIELD_CONCURRENCY;
    process.env.PRODUCT_RETRANSLATION_FIELD_CONCURRENCY = '3';
    let failTechnicalDescription = true;
    let providerCalls = 0;
    const translate = sandbox.stub(productTranslationService, 'translateWithCloudflare').callsFake(async source => {
      providerCalls++;
      if (source === product.technicalDescription && failTechnicalDescription) {
        failTechnicalDescription = false;
        throw new Error('provider rate limit');
      }
      return { translatedText: `Translated ${source}`, provider: 'cloudflare', providersUsed: ['cloudflare'] };
    });
    sandbox.stub(distributedLockService, 'initialize').resolves();
    sandbox.stub(distributedLockService, 'acquireLock').resolves('test-lock');
    sandbox.stub(distributedLockService, 'releaseLock').resolves(true);
    sandbox.stub(Product, 'findById').returns({ lean: sandbox.stub().resolves(product) });
    sandbox.stub(Product, 'find').returns({
      select: sandbox.stub().returnsThis(),
      lean: sandbox.stub().resolves([product]),
    });
    sandbox.stub(Product, 'bulkWrite').resolves({ matchedCount: 1, modifiedCount: 1 });
    sandbox.stub(ProductCatalogTranslationCache, 'findOne').returns({
      lean: sandbox.stub().resolves({ manualFields: [] }),
    });
    const findOneAndUpdate = sandbox.stub(ProductCatalogTranslationCache, 'findOneAndUpdate').returns({
      lean: sandbox.stub().resolves({
        entityId: productId,
        targetLang: 'en',
        name: 'Cached name',
        description: 'Translated Source description',
        technicalDescription: 'Translated Source technical description',
        sourceHash,
        qualityStatus: 'approved',
        qualityScore: 100,
        validationErrors: [],
      }),
    });
    sandbox.stub(ProductCatalogTranslationCache, 'find').returns({
      select: sandbox.stub().returnsThis(),
      maxTimeMS: sandbox.stub().returnsThis(),
      lean: sandbox.stub().resolves([]),
    });
    sandbox.stub(LiveTranslationCache, 'updateMany').resolves({ modifiedCount: 0 });
    sandbox.stub(RetranslationProgress, 'updateOne').resolves({ acknowledged: true });
    sandbox.stub(RetranslationProgress, 'bulkWrite').resolves({ acknowledged: true });
    sandbox.stub(translationValidator, 'validateTranslation').resolves({
      qualityStatus: 'approved',
      qualityScore: 100,
      validationErrors: [],
    });

    try {
      let firstError;
      try {
        await productCatalogRetranslationService.retranslateProduct(productId, 'en', {
          checkpoint,
          parallelProducts: 2,
        });
      } catch (error) {
        firstError = error;
      }
      expect(firstError.message).to.equal('provider rate limit');

      const descriptionKey = getProductFieldWorkKey({
        productId,
        targetLang: 'en',
        field: 'description',
        source: product.description,
      });
      const technicalDescriptionKey = getProductFieldWorkKey({
        productId,
        targetLang: 'en',
        field: 'technicalDescription',
        source: product.technicalDescription,
      });
      expect(hasCompleted(checkpoint, descriptionKey)).to.be.true;
      expect(hasCompleted(checkpoint, technicalDescriptionKey)).to.be.false;

      await productCatalogRetranslationService.retranslateProduct(productId, 'en', {
        checkpoint,
        parallelProducts: 2,
      });

      expect(providerCalls).to.equal(3);
      expect(translate.callCount).to.equal(3);
      expect(findOneAndUpdate.firstCall.args[1].$set.name).to.equal('Cached name');
      expect(hasCompleted(checkpoint, technicalDescriptionKey)).to.be.true;
    } finally {
      if (originalConcurrency === undefined) delete process.env.PRODUCT_RETRANSLATION_FIELD_CONCURRENCY;
      else process.env.PRODUCT_RETRANSLATION_FIELD_CONCURRENCY = originalConcurrency;
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('retranslates only invalid fields and keeps the previous value when the new output fails validation', async () => {
    const productId = new mongoose.Types.ObjectId().toString();
    const product = {
      _id: new mongoose.Types.ObjectId(productId),
      name: 'Source laptop',
      description: 'Source description',
      brand: 'Brand',
      specs: { RAM: '16GB' },
      technicalDescription: '',
      descriptionImages: [],
      promotions: [],
    };
    const sourceHash = getProductTranslationSourceHash(product);
    sandbox.stub(ProductCatalogTranslationCache, 'findOne').returns({
      lean: sandbox.stub().resolves({
        entityId: productId,
        targetLang: 'en',
        sourceHash,
        name: 'Translated laptop',
        description: 'Previous description',
        brand: 'Brand',
        specs: { RAM: '16 GB' },
        manualFields: [],
        qualityStatus: 'needs_retranslate',
        validationErrors: ['too_short'],
      }),
    });
    stubCatalogRetranslationReads(sandbox, product);
    const findOneAndUpdate = sandbox.stub(ProductCatalogTranslationCache, 'findOneAndUpdate').returns({
      lean: sandbox.stub().resolves({}),
    });
    const translate = sandbox.stub(productTranslationService, 'translateWithCloudflare').resolves({
      translatedText: 'Still too short',
      provider: 'cloudflare',
      providersUsed: ['cloudflare'],
    });
    sandbox.stub(translationValidator, 'validateTranslation').callsFake(async (source, translated) => {
      if (translated === 'Previous description' || translated === 'Still too short') {
        return { qualityStatus: 'pending', qualityScore: 30, validationErrors: ['too_short'] };
      }
      return { qualityStatus: 'approved', qualityScore: 100, validationErrors: [] };
    });

    await productCatalogRetranslationService.retranslateProduct(productId, 'en');

    expect(translate.calledOnceWith('Source description', 'vi', 'en')).to.be.true;
    const update = findOneAndUpdate.firstCall.args[1].$set;
    expect(update).to.include({
      name: 'Translated laptop',
      description: 'Previous description',
      qualityStatus: 'pending',
    });
    expect(update.specs).to.deep.equal({ RAM: '16 GB' });
    expect(update.validationErrors).to.deep.equal(['too_short']);
  });

  it('retranslates a field when its checkpoint payload did not pass validation', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'retranslate-invalid-field-'));
    const productId = new mongoose.Types.ObjectId().toString();
    const product = {
      _id: new mongoose.Types.ObjectId(productId),
      name: 'Source laptop',
      description: '',
      brand: 'Brand',
      specs: {},
      technicalDescription: '',
      descriptionImages: [],
      promotions: [],
    };
    const checkpoint = openCheckpoint({ filter: {}, lang: null, limit: 0 }, directory);
    const nameKey = getProductFieldWorkKey({
      productId,
      targetLang: 'en',
      field: 'name',
      source: product.name,
    });
    markCompleted(checkpoint, nameKey, {
      fixed: false,
      validationErrors: ['missing_technical_token'],
      payload: {
        value: 'Wrong cached laptop',
        validation: { qualityStatus: 'pending', validationErrors: ['missing_technical_token'] },
      },
    });
    sandbox.stub(ProductCatalogTranslationCache, 'findOne').returns({ lean: sandbox.stub().resolves({ manualFields: [] }) });
    stubCatalogRetranslationReads(sandbox, product);
    const findOneAndUpdate = sandbox.stub(ProductCatalogTranslationCache, 'findOneAndUpdate').returns({
      lean: sandbox.stub().resolves({}),
    });
    sandbox.stub(RetranslationProgress, 'updateOne').resolves({ acknowledged: true });
    sandbox.stub(translationValidator, 'validateTranslation').resolves({
      qualityStatus: 'approved',
      qualityScore: 100,
      validationErrors: [],
    });
    const translate = sandbox.stub(productTranslationService, 'translateWithCloudflare').resolves({
      translatedText: 'Fresh translated laptop',
      providersUsed: ['cloudflare'],
    });

    try {
      await productCatalogRetranslationService.retranslateProduct(productId, 'en', { checkpoint });
      expect(translate.calledOnceWith('Source laptop', 'vi', 'en')).to.be.true;
      expect(findOneAndUpdate.firstCall.args[1].$set.name).to.equal('Fresh translated laptop');
      expect(retranslateProgress.getCompletedResult(checkpoint, nameKey).payload.value)
        .to.equal('Fresh translated laptop');
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('preserves repeated technical tokens while rejecting missing or introduced specs', () => {
    expect(translationValidator.checkTechnicalTokens(
      'RTX 3050 4GB Core 5-210H',
      'RTX 3050 4 GB Core 5-210H',
    )).to.equal(null);
    expect(translationValidator.checkTechnicalTokens('16GB 1TB', '16GB'))
      .to.include({ error: 'missing_technical_token' });
    expect(translationValidator.checkTechnicalTokens('16GB', '16GB 32GB'))
      .to.include({ error: 'unexpected_technical_token' });
    expect(translationValidator.checkTechnicalTokens('Win 11', 'Windows 11')).to.equal(null);
    expect(translationValidator.checkTechnicalTokens('RTX 3050 RTX 3050', 'RTX 3050'))
      .to.include({ error: 'missing_technical_token' });
  });

  it('prints catalog validation issues without failing the retranslation report', async () => {
    const needsRetranslate = ProductCatalogTranslationCache.schema.path('qualityStatus').enumValues
      .find(status => /retranslat|reject/i.test(status));
    const targetLanguage = SUPPORTED_LANGUAGES.find(({ code }) => code !== getDefaultLanguage().code);
    const candidate = {
      _id: new mongoose.Types.ObjectId(),
      entityId: new mongoose.Types.ObjectId().toString(),
      targetLang: targetLanguage.code,
      name: 'Laptop MSI',
      qualityStatus: needsRetranslate,
      validationErrors: ['needs_retranslate'],
    };
    sandbox.stub(LiveTranslationCache, 'find').returns({
      sort: sandbox.stub().returnsThis(),
      lean: sandbox.stub().resolves([]),
    });
    sandbox.stub(ProductCatalogTranslationCache, 'find').returns({
      sort: sandbox.stub().returnsThis(),
      lean: sandbox.stub().resolves([candidate]),
    });
    sandbox.stub(Product, 'find').returns({
      select: sandbox.stub().returnsThis(),
      lean: sandbox.stub().resolves([{ _id: candidate.entityId, name: 'MSI Laptop' }]),
    });
    sandbox.stub(productCatalogRetranslationService, 'retranslateProduct').resolves({
      translation: {
        ...candidate,
        name: 'MSI Laptop',
        validationErrors: ['missing_brand'],
      },
      skippedManualFields: [],
    });
    sandbox.stub(translationReporter, 'generateRetranslateReport').resolves({});
    sandbox.stub(translationReporter, 'saveReport');
    const log = sandbox.stub(console, 'log');

    const result = await retranslateSeeder.retranslate({ verbose: true });

    expect(result.success).to.equal(false);
    expect(result.stats.stillBrokenCount).to.equal(1);
    expect(log.args.map(args => args.join(' ')).join('\n')).to.include('Issues: missing_brand');
  });

  it('caps Cloudflare translation input into bounded chunks', async () => {
    const originalChunkSize = process.env.CLOUDFLARE_AI_INPUT_CHUNK_SIZE;
    process.env.CLOUDFLARE_AI_INPUT_CHUNK_SIZE = '900';
    const cloudflareTranslate = sandbox.stub(cloudflareAiService, 'translate').callsFake(async text => `[en] ${text}`);

    try {
      const result = await productTranslationService.translateWithCloudflare('A'.repeat(2500), 'vi', 'en');

      expect(cloudflareTranslate.callCount).to.equal(3);
      expect(cloudflareTranslate.args.every(([text]) => text.length <= 900)).to.equal(true);
      expect(result.translatedText.replace(/\[en\] /g, '')).to.equal('A'.repeat(2500));
      expect(result.providersUsed).to.deep.equal(['cloudflare']);
    } finally {
      if (originalChunkSize === undefined) delete process.env.CLOUDFLARE_AI_INPUT_CHUNK_SIZE;
      else process.env.CLOUDFLARE_AI_INPUT_CHUNK_SIZE = originalChunkSize;
    }
  });

  it('preserves source whitespace between Cloudflare chunks', async () => {
    const originalChunkSize = process.env.CLOUDFLARE_AI_INPUT_CHUNK_SIZE;
    const source = `${'A'.repeat(800)}\n${'B'.repeat(800)}`;
    process.env.CLOUDFLARE_AI_INPUT_CHUNK_SIZE = '900';
    const cloudflareTranslate = sandbox.stub(cloudflareAiService, 'translate').callsFake(async text => `[en] ${text}`);

    try {
      const result = await productTranslationService.translateWithCloudflare(source, 'vi', 'en');
      const requestedText = cloudflareTranslate.args.map(([text]) => text).join('');

      expect(cloudflareTranslate.callCount).to.equal(2);
      expect(requestedText).to.equal(source);
      expect(result.translatedText.replace(/\[en\] /g, '')).to.equal(source);
    } finally {
      if (originalChunkSize === undefined) delete process.env.CLOUDFLARE_AI_INPUT_CHUNK_SIZE;
      else process.env.CLOUDFLARE_AI_INPUT_CHUNK_SIZE = originalChunkSize;
    }
  });

  it('retries incomplete provider output with smaller Cloudflare chunks', async () => {
    const originalChunkSize = process.env.CLOUDFLARE_AI_INPUT_CHUNK_SIZE;
    process.env.CLOUDFLARE_AI_INPUT_CHUNK_SIZE = '900';
    const cloudflareTranslate = sandbox.stub(cloudflareAiService, 'translate').callsFake(async text => (
      text.length > 256 ? 'short' : `[en] ${text}`
    ));

    try {
      const result = await productTranslationService.translateWithCloudflare('A'.repeat(2500), 'vi', 'en');

      expect(cloudflareTranslate.callCount).to.be.greaterThan(3);
      expect(result.translatedText.replace(/\[en\] /g, '')).to.equal('A'.repeat(2500));
      expect(result.providersUsed).to.deep.equal(['cloudflare']);
    } finally {
      if (originalChunkSize === undefined) delete process.env.CLOUDFLARE_AI_INPUT_CHUNK_SIZE;
      else process.env.CLOUDFLARE_AI_INPUT_CHUNK_SIZE = originalChunkSize;
    }
  });

  it('propagates Cloudflare rate limits without reporting a translation result', async () => {
    const cloudflareTranslate = sandbox.stub(cloudflareAiService, 'translate').rejects(
      Object.assign(new Error('Rate limit exceeded'), { response: { status: 429 } }),
    );

    try {
      await productTranslationService.translateWithCloudflare('Original', 'vi', 'en');
      expect.fail('Expected Cloudflare rate limit to be thrown');
    } catch (error) {
      expect(error.response.status).to.equal(429);
      expect(cloudflareTranslate.calledOnce).to.equal(true);
    }
  });

  it('syncs product retranslation status back to superseded field-cache records', async () => {
    const productId = new mongoose.Types.ObjectId().toString();
    const product = {
      _id: new mongoose.Types.ObjectId(productId),
      name: 'Laptop source',
      description: '',
      specs: {},
      descriptionImages: [],
      promotions: [],
    };
    const targetLang = SUPPORTED_LANGUAGES.find(({ code }) => code !== getDefaultLanguage().code).code;
    sandbox.stub(Product, 'findById').returns({ lean: sandbox.stub().resolves(product) });
    sandbox.stub(Product, 'find').returns({
      select: sandbox.stub().returnsThis(),
      lean: sandbox.stub().resolves([product]),
    });
    sandbox.stub(Product, 'bulkWrite').resolves({ matchedCount: 1, modifiedCount: 1 });
    sandbox.stub(ProductCatalogTranslationCache, 'findOne').returns({
      lean: sandbox.stub().resolves({ manualFields: [] }),
    });
    const findOneAndUpdate = sandbox.stub(ProductCatalogTranslationCache, 'findOneAndUpdate').returns({
      lean: sandbox.stub().resolves({ qualityStatus: 'approved', validationErrors: [] }),
    });
    sandbox.stub(ProductCatalogTranslationCache, 'find').returns({
      select: sandbox.stub().returnsThis(),
      maxTimeMS: sandbox.stub().returnsThis(),
      lean: sandbox.stub().resolves([]),
    });
    const updateMany = sandbox.stub(LiveTranslationCache, 'updateMany').resolves({ modifiedCount: 1 });
    sandbox.stub(productTranslationService, 'translateWithCloudflare').resolves({
      translatedText: 'Laptop traduit',
      provider: 'cloudflare',
      providersUsed: ['cloudflare'],
    });
    sandbox.stub(translationValidator, 'validateTranslation').resolves({
      qualityStatus: 'approved',
      qualityScore: 100,
      validationErrors: [],
    });
    sandbox.stub(productTranslationLock, 'acquireProductTranslationLock').resolves(async () => {});
    sandbox.stub(distributedLockService, 'initialize').resolves();
    sandbox.stub(distributedLockService, 'acquireLock').resolves('test-lock');
    sandbox.stub(distributedLockService, 'releaseLock').resolves(true);

    await productCatalogRetranslationService.retranslateProduct(productId, targetLang);

    const savedCatalog = findOneAndUpdate.firstCall.args[1].$set;
    const syncQuery = updateMany.firstCall.args[0];
    const syncUpdate = updateMany.firstCall.args[1].$set;
    expect(savedCatalog).to.include({
      provider: 'cloudflare',
      providerSource: 'primary',
      failoverReason: null,
    });
    expect(syncQuery).to.include({ entityId: productId, targetLang });
    expect(syncUpdate).to.include({ qualityStatus: 'retranslated' });
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
    sandbox.stub(productTranslationService, 'translateWithCloudflare').rejects(quotaError);
    sandbox.stub(translationReporter, 'printRetranslateReport');
    sandbox.stub(translationReporter, 'generateRetranslateReport').resolves({});
    sandbox.stub(translationReporter, 'saveReport');

    const result = await retranslateSeeder.retranslate({ verbose: false, concurrency: 1 });

    expect(result.success).to.equal(false);
    expect(result.stats.quotaExceededCount).to.equal(1);
    expect(result.stats.errorCount).to.equal(1);
    expect(result.stats.remainingCount).to.equal(translations.length);
    expect(productTranslationService.translateWithCloudflare.calledOnce).to.equal(true);
  });

  it('retranslates independent records with the configured concurrency cap', async () => {
    const targetLanguage = SUPPORTED_LANGUAGES.find(({ code }) => code !== getDefaultLanguage().code);
    const translations = Array.from({ length: 4 }, (_, index) => ({
      _id: new mongoose.Types.ObjectId(),
      hashKey: `concurrent-hash-${index}`,
      originalText: `Source ${index}`,
      translatedText: `Old ${index}`,
      sourceLang: getDefaultLanguage().code,
      targetLang: targetLanguage.code,
      entityId: new mongoose.Types.ObjectId().toString(),
      entityType: 'product_name',
      qualityScore: 0,
      validationErrors: ['needs_retranslate'],
    }));
    sandbox.stub(LiveTranslationCache, 'find').returns({
      sort: sandbox.stub().returnsThis(),
      lean: sandbox.stub().resolves(translations),
    });
    sandbox.stub(ProductCatalogTranslationCache, 'find').returns({
      sort: sandbox.stub().returnsThis(),
      lean: sandbox.stub().resolves([]),
    });
    let activeTranslations = 0;
    let maxActiveTranslations = 0;
    sandbox.stub(productTranslationLock, 'acquireProductTranslationLock').resolves(async () => {});
    sandbox.stub(productTranslationService, 'translateWithCloudflare').callsFake(async (text) => {
      activeTranslations++;
      maxActiveTranslations = Math.max(maxActiveTranslations, activeTranslations);
      await new Promise(resolve => setTimeout(resolve, 10));
      activeTranslations--;
      return { translatedText: `${text} translated`, provider: 'cloudflare', providersUsed: ['cloudflare'] };
    });
    sandbox.stub(translationValidator, 'validateTranslation').resolves({
      qualityStatus: 'approved',
      qualityScore: 100,
      validationErrors: [],
    });
    sandbox.stub(LiveTranslationCache, 'findOneAndUpdate').callsFake(async () => ({ _id: new mongoose.Types.ObjectId() }));
    sandbox.stub(LiveTranslationCache, 'updateOne').resolves({ modifiedCount: 1 });
    sandbox.stub(TranslationQualityLog, 'create').resolves({});
    sandbox.stub(ProductTranslationSeederService, '_syncProductCatalogTranslations').resolves();
    sandbox.stub(translationReporter, 'generateRetranslateReport').resolves({});
    sandbox.stub(translationReporter, 'saveReport');

    const result = await retranslateSeeder.retranslate({
      verbose: false,
      concurrency: 2,
    });

    expect(result.stats.fixedCount).to.equal(4);
    expect(maxActiveTranslations).to.equal(2);
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

  it('requires review for translations that exceed the maximum length ratio', async () => {
    sandbox.stub(LiveTranslationCache, 'findOne').resolves(null);
    const brand = translationValidationConfig.PRESERVED_BRANDS[0];
    const original = brand;
    const translated = `${brand}${'x'.repeat(Math.floor(
      original.length * translationValidationConfig.MAX_LENGTH_RATIO,
    ) + 1)}`;
    const lengthError = translationValidator.checkLength(original, translated)?.error;

    expect(translationValidationConfig.NON_BLOCKING_ERRORS).not.to.include(lengthError);

    const result = await translationValidator.validateTranslation(
      original,
      translated,
      targetLanguage.code,
      'product_name',
    );
    const expectedScore = translationValidator.calculateQualityScore([lengthError]);
    expect(result.qualityScore).to.equal(expectedScore);
    expect(result.qualityStatus).to.equal('pending');
    expect(result.validationErrors).to.include(lengthError);
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
      $or: [
        { validationErrors: { $exists: false } },
        { validationErrors: { $size: 0 } },
      ],
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
    const sourceProduct = {
      _id: new mongoose.Types.ObjectId(productId),
      name: 'Laptop source',
      description: 'Source description',
      brand: 'Source brand',
      specs: {},
      technicalDescription: '',
      descriptionImages: [],
      promotions: [],
    };
    sandbox.stub(Product, 'findById').returns({
      lean: sandbox.stub().resolves(sourceProduct),
    });
    sandbox.stub(ProductCatalogTranslationCache, 'findOne').returns({
      lean: sandbox.stub().resolves({
        name: 'Existing laptop',
        description: 'Bad description',
        brand: 'Brand translation',
        manualFields: ['description'],
      }),
    });
    sandbox.stub(translationValidator, 'validateTranslation').callsFake(async (source, translated) => ({
      validationErrors: translated === 'Bad description' ? ['too_long'] : [],
      qualityScore: translated === 'Bad description' ? 85 : 100,
      qualityStatus: translated === 'Bad description' ? 'pending' : 'approved',
    }));
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
    sandbox.stub(LiveTranslationCache, 'updateMany').resolves({ modifiedCount: 0 });
    sandbox.stub(Product, 'bulkWrite').resolves({ matchedCount: 1, modifiedCount: 1 });
    const res = createResponse();

    sandbox.stub(productTranslationLock, 'acquireProductTranslationLock').resolves(async () => {});
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
      qualityStatus: 'pending',
      qualityScore: 85,
    });
    expect(findOneAndUpdate.firstCall.args[1].$set.sourceHash)
      .to.equal(getProductTranslationSourceHash(sourceProduct));
    expect(findOneAndUpdate.firstCall.args[1].$set.validationErrors).to.deep.equal(['too_long']);
    expect(findOneAndUpdate.firstCall.args[1].$set.manualFields).to.have.members(['description', 'name']);
    expect(res.json.firstCall.args[0].data.name).to.equal('Manual laptop');
  });

  it('rejects manual saves while a product retranslation holds its lock', async () => {
    sandbox.stub(productTranslationLock, 'acquireProductTranslationLock').rejects(Object.assign(
      new Error('Product translation is already running'),
      { code: 'PRODUCT_TRANSLATION_LOCKED' },
    ));
    const res = createResponse();

    await saveProductTranslation({
      params: { id: new mongoose.Types.ObjectId().toString() },
      query: { lang: 'en' },
      body: { name: 'Manual laptop' },
      lang: 'en',
    }, res);

    expect(res.status.calledWith(409)).to.be.true;
    expect(res.json.firstCall.args[0].code).to.equal('TRANSLATION_RETRANSLATE_BUSY');
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

    sandbox.stub(productTranslationLock, 'acquireProductTranslationLock').resolves(async () => {});
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

  it('rejects a product retranslation while another retranslation run holds the database lock', async () => {
    retranslateProgress.acquireDatabaseLock.rejects(Object.assign(
      new Error('Retranslate is already running for this database'),
      { code: 'RETRANSLATE_LOCKED' },
    ));
    const res = createResponse();

    await retranslateProduct({
      params: { id: new mongoose.Types.ObjectId().toString() },
      body: { lang: 'en' },
      lang: 'en',
    }, res);

    expect(res.status.calledWith(409)).to.be.true;
    expect(res.json.firstCall.args[0].code).to.equal('TRANSLATION_RETRANSLATE_BUSY');
  });

  it('uses the shared product checkpoint for admin retranslation', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-product-retranslate-'));
    const productId = 'abcdefabcdefabcdefabcdef';
    const targetLang = 'en';
    const sourceHash = 'current-source';
    const checkpointScope = retranslateProgress.getDatabaseScope(process.env.MONGO_URI || '');
    const checkpoint = openProductCheckpoint(checkpointScope, directory);
    const eligibleCatalogTranslation = {
      entityId: productId,
      targetLang,
      status: 'success',
      qualityStatus: 'needs_retranslate',
      validationErrors: ['needs_retranslate'],
    };
    const translation = {
      entityId: productId,
      targetLang,
      sourceHash,
      qualityStatus: 'approved',
      validationErrors: [],
    };
    sandbox.stub(Product, 'exists').resolves({ _id: productId });
    sandbox.stub(ProductCatalogTranslationCache, 'findOne').returns({
      lean: sandbox.stub().resolves(eligibleCatalogTranslation),
    });
    sandbox.stub(LiveTranslationCache, 'find').returns({
      limit: sandbox.stub().returnsThis(),
      lean: sandbox.stub().resolves([]),
    });
    retranslateProgress.openProductCheckpoint.returns(checkpoint);
    const markCompletedDurably = retranslateProgress.markCompletedDurably;
    markCompletedDurably.resetHistory();
    const retranslate = sandbox.stub(productCatalogRetranslationService, 'retranslateProduct').resolves({
      translation,
      skippedManualFields: [],
    });
    const res = createResponse();

    try {
      await retranslateProduct({
        params: { id: productId.toUpperCase() },
        body: { lang: targetLang },
        lang: 'en',
      }, res);

      expect(retranslate.calledOnceWith(productId, targetLang, { checkpoint })).to.be.true;
      expect(markCompletedDurably.firstCall.args[1]).to.equal(
        `catalog:${targetLang}:${productId}:${sourceHash}`,
      );
      expect(res.json.calledOnce).to.be.true;
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('skips admin retranslation when the product is not a CLI candidate', async () => {
    const productId = 'abcdefabcdefabcdefabcdef';
    sandbox.stub(Product, 'exists').resolves({ _id: productId });
    sandbox.stub(ProductCatalogTranslationCache, 'findOne').returns({
      lean: sandbox.stub().resolves({
        entityId: productId,
        targetLang: 'en',
        status: 'success',
        qualityStatus: 'approved',
        qualityScore: 100,
        validationErrors: [],
      }),
    });
    sandbox.stub(LiveTranslationCache, 'find').returns({
      limit: sandbox.stub().returnsThis(),
      lean: sandbox.stub().resolves([]),
    });
    const retranslate = sandbox.stub(productCatalogRetranslationService, 'retranslateProduct');
    const res = createResponse();

    await retranslateProduct({
      params: { id: productId },
      body: { lang: 'en' },
      lang: 'vi',
    }, res);

    expect(retranslate.called).to.be.false;
    expect(retranslateProgress.openProductCheckpoint.called).to.be.false;
    expect(res.json.firstCall.args[0].code).to.equal('TRANSLATION_RETRANSLATE_NOT_NEEDED');
    expect(res.json.firstCall.args[0].data.skipped).to.be.true;
  });

  it('rejects catalog retranslation while the product seeder holds its lock', async () => {
    const productId = new mongoose.Types.ObjectId().toString();
    sandbox.stub(Product, 'exists').resolves({ _id: productId });
    sandbox.stub(ProductCatalogTranslationCache, 'findOne').returns({
      lean: sandbox.stub().resolves({ status: 'success', qualityStatus: 'needs_retranslate' }),
    });
    sandbox.stub(LiveTranslationCache, 'find').returns({
      limit: sandbox.stub().returnsThis(),
      lean: sandbox.stub().resolves([]),
    });
    sandbox.stub(distributedLockService, 'initialize').resolves();
    sandbox.stub(distributedLockService, 'acquireLock').resolves(null);
    const res = createResponse();

    await retranslateProduct({
      params: { id: new mongoose.Types.ObjectId().toString() },
      body: { lang: 'en' },
      lang: 'en',
    }, res);

    expect(res.status.calledWith(409)).to.be.true;
    expect(res.json.firstCall.args[0].code).to.equal('TRANSLATION_RETRANSLATE_BUSY');
  });

  it('keeps source nested values when no text is available to retranslate', async () => {
    const productId = new mongoose.Types.ObjectId().toString();
    sandbox.stub(Product, 'exists').resolves({ _id: productId });
    sandbox.stub(LiveTranslationCache, 'find').returns({
      limit: sandbox.stub().returnsThis(),
      lean: sandbox.stub().resolves([]),
    });
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
        status: 'success',
        qualityStatus: 'needs_retranslate',
        name: 'Existing laptop',
        descriptionImages: [{ url: 'https://example.invalid/source.jpg', alt: 'Old alt' }],
        promotions: [{ type: 'Gift', title: 'Old title' }],
        manualFields: [],
      }),
    });
    sandbox.stub(productTranslationService, 'translateWithCloudflare').callsFake(async (source) => ({
      translatedText: `en:${source}`,
      provider: 'cloudflare',
      providersUsed: ['cloudflare'],
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
    sandbox.stub(LiveTranslationCache, 'updateMany').resolves({ modifiedCount: 0 });
    sandbox.stub(Product, 'bulkWrite').resolves({ matchedCount: 1, modifiedCount: 1 });
    const res = createResponse();

    sandbox.stub(distributedLockService, 'initialize').resolves();
    sandbox.stub(distributedLockService, 'acquireLock').resolves('lock-id');
    sandbox.stub(distributedLockService, 'extendLock').resolves(true);
    sandbox.stub(distributedLockService, 'releaseLock').resolves(true);
    await retranslateProduct({
      params: { id: productId },
      body: { lang: 'en' },
      lang: 'en',
    }, res);

    const update = findOneAndUpdate.firstCall.args[1].$set;
    expect(update.descriptionImages).to.deep.equal([{ url: 'https://example.invalid/source.jpg', alt: '' }]);
    expect(update.promotions).to.deep.equal([{ type: 'Gift', title: '' }]);
    expect(update.provider).to.equal('cloudflare');
    expect(update.providersUsed).to.deep.equal(['cloudflare']);
    expect(update.providerSource).to.equal('primary');
    expect(update.failoverReason).to.equal(null);
  });

  it('keeps manual fields unchanged while retranslating remaining fields in bounded parallel', async () => {
    const productId = new mongoose.Types.ObjectId().toString();
    sandbox.stub(Product, 'exists').resolves({ _id: productId });
    sandbox.stub(LiveTranslationCache, 'find').returns({
      limit: sandbox.stub().returnsThis(),
      lean: sandbox.stub().resolves([]),
    });
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
        status: 'success',
        qualityStatus: 'needs_retranslate',
        name: 'Manual laptop',
        manualFields: ['name'],
      }),
    });
    let activeTranslations = 0;
    let maximumActiveTranslations = 0;
    const translate = sandbox.stub(productTranslationService, 'translateWithCloudflare').callsFake(async (source) => {
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
    sandbox.stub(LiveTranslationCache, 'updateMany').resolves({ modifiedCount: 0 });
    sandbox.stub(Product, 'bulkWrite').resolves({ matchedCount: 1, modifiedCount: 1 });
    const res = createResponse();

    sandbox.stub(distributedLockService, 'initialize').resolves();
    sandbox.stub(distributedLockService, 'acquireLock').resolves('lock-id');
    sandbox.stub(distributedLockService, 'extendLock').resolves(true);
    sandbox.stub(distributedLockService, 'releaseLock').resolves(true);
    const originalFieldConcurrency = process.env.PRODUCT_RETRANSLATION_FIELD_CONCURRENCY;
    process.env.PRODUCT_RETRANSLATION_FIELD_CONCURRENCY = '2';
    try {
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
    } finally {
      if (originalFieldConcurrency === undefined) delete process.env.PRODUCT_RETRANSLATION_FIELD_CONCURRENCY;
      else process.env.PRODUCT_RETRANSLATION_FIELD_CONCURRENCY = originalFieldConcurrency;
    }
  });

  it('dịch text scraper có cấu trúc song song có giới hạn và giữ nguyên URL, giá trị nghiệp vụ', async () => {
    const productId = new mongoose.Types.ObjectId();
    sandbox.stub(distributedLockService, 'initialize').resolves();
    sandbox.stub(distributedLockService, 'isLocked').resolves(false);
    sandbox.stub(distributedLockService, 'acquireLock').resolves('lock-id');
    sandbox.stub(distributedLockService, 'releaseLock').resolves();
    sandbox.stub(LiveTranslationCache, 'findOne').returns({ lean: sandbox.stub().resolves(null) });
    const saveTranslation = sandbox.stub(LiveTranslationCache, 'bulkWrite').resolves({});
    const originalFieldConcurrency = process.env.PRODUCT_TRANSLATION_FIELD_CONCURRENCY;
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
      if (originalFieldConcurrency === undefined) delete process.env.PRODUCT_TRANSLATION_FIELD_CONCURRENCY;
      else process.env.PRODUCT_TRANSLATION_FIELD_CONCURRENCY = originalFieldConcurrency;
    }

    const records = saveTranslation.firstCall.args[0].map((operation) => operation.updateOne.update.$set);
    expect(result.success).to.equal(9);
    expect(result.rateLimitErr).to.equal(0);
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
