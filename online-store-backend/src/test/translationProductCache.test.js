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
const { validateProduct } = require('../utils/productImportValidator');
const {
  getProductCatalogTranslations,
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

  it('does not include removed product feature fields in imported data', () => {
    const result = validateProduct({
      name: 'Test product',
      brand: 'Test brand',
      price: 100,
      baseCurrencyCode: 'VND',
      category: 'Keyboard',
      supplier: 'Supplier',
      description: 'Description',
      features: ['feature_rgb_backlight'],
      featuresTranslations: { en: ['RGB backlight'] },
    });

    expect(result.isValid).to.equal(true);
    expect(result.cleaned).to.not.have.property('features');
    expect(result.cleaned).to.not.have.property('featuresTranslations');
  });

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
    const res = createResponse();

    await retranslateProduct({
      params: { id: productId },
      body: { lang: 'en' },
      lang: 'en',
    }, res);

    expect(translate.callCount).to.equal(3);
    expect(findOneAndUpdate.firstCall.args[1].$set).to.include({
      name: 'Manual laptop',
      description: 'en:Source description',
      brand: 'en:Source brand',
    });
    expect(findOneAndUpdate.firstCall.args[1].$set.specs).to.deep.equal({ RAM: 'en:16GB' });
    expect(res.json.firstCall.args[0].data.skippedManualFields).to.deep.equal(['name']);
  });

  it('exports only the requested fields for valid product and language filters', async () => {
    const productId = new mongoose.Types.ObjectId().toString();
    const find = sandbox.stub(ProductCatalogTranslationCache, 'find').returns({
      lean: sandbox.stub().resolves([{
        entityId: productId,
        targetLang: 'en',
        name: 'Laptop',
        description: 'Translated description',
        manualFields: ['name'],
      }]),
    });
    const res = createResponse();

    await exportProductTranslationCache({
      query: { productIds: productId, languages: 'en', fields: 'name,description' },
      lang: 'en',
    }, res);

    expect(find.calledOnceWith({ entityId: { $in: [productId] }, targetLang: { $in: ['en'] } })).to.be.true;
    expect(res.json.calledOnce).to.be.true;
    expect(res.json.firstCall.args[0].data.records).to.deep.equal([{
      productId,
      targetLang: 'en',
      translations: { name: 'Laptop', description: 'Translated description' },
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
      lean: sandbox.stub().resolves([]),
    });
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

  it('imports a record using the product name when the selected fields omit name', async () => {
    const productId = new mongoose.Types.ObjectId().toString();
    const create = sandbox.stub(TranslationBatchRequest, 'create').resolves({ _id: 'batch-request' });
    sandbox.stub(Product, 'find').returns({
      select: sandbox.stub().returns({
        lean: sandbox.stub().resolves([{ _id: new mongoose.Types.ObjectId(productId), name: 'Laptop source' }]),
      }),
    });
    sandbox.stub(ProductCatalogTranslationCache, 'find').returns({
      lean: sandbox.stub().resolves([]),
    });
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
