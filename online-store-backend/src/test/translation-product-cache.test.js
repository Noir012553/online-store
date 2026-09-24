const chai = require('chai');
const expect = chai.expect;
const sinon = require('sinon');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const ProductCatalogTranslationCache = require('../models/ProductCatalogTranslationCache');
const LiveTranslationCache = require('../models/LiveTranslationCache');
const TranslationBatchRequest = require('../models/TranslationBatchRequest');
const LanguageService = require('../services/languageService');
const cloudflareAiService = require('../services/cloudflareAiService');
const translationValidator = require('../utils/translationValidator');
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
    sandbox.stub(cloudflareAiService, 'translate').callsFake(async (source) => `en:${source}`);
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
  });

  it('keeps manual fields unchanged when retranslating the remaining product fields', async () => {
    const productId = new mongoose.Types.ObjectId().toString();
    sandbox.stub(Product, 'findById').returns({
      lean: sandbox.stub().resolves({
        name: 'Laptop source',
        description: 'Source description',
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
    const translate = sandbox.stub(cloudflareAiService, 'translate').callsFake(async (source) => `en:${source}`);
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
      lean: sandbox.stub().resolves([{ _id: new mongoose.Types.ObjectId(productId), name: 'Laptop source', description: 'Source description', brand: 'Source brand', specs: { RAM: '16GB' } }]),
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

    expect(translate.callCount).to.equal(2);
    expect(findOneAndUpdate.firstCall.args[1].$set).to.include({
      name: 'Manual laptop',
      description: 'en:Source description',
      brand: 'Source brand',
    });
    expect(findOneAndUpdate.firstCall.args[1].$set.specs).to.deep.equal({ RAM: 'en:16GB' });
    expect(res.json.firstCall.args[0].data.skippedManualFields).to.deep.equal(['name']);
  });

  it('dịch text scraper có cấu trúc nhưng giữ nguyên URL và giá trị nghiệp vụ', async () => {
    const productId = new mongoose.Types.ObjectId();
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

    const result = await ProductTranslationSeederService._translateProduct({
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

    const records = saveTranslation.firstCall.args[0].map((operation) => operation.updateOne.update.$set);
    expect(result.success).to.equal(9);
    expect(result.rateLimitErr).to.equal(0);
    expect(result.failoverErr).to.equal(0);
    expect(result.otherErr).to.equal(0);
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
