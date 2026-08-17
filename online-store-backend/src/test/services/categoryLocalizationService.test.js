const chai = require('chai');
const expect = chai.expect;
const sinon = require('sinon');
const mongoose = require('mongoose');
const CategoryCatalogTranslationCache = require('../../models/CategoryCatalogTranslationCache');
const {
  localizeProductCategory,
  localizeProductCategories,
} = require('../../services/categoryLocalizationService');

describe('categoryLocalizationService', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('localizes populated categories once per unique category for a product list', async () => {
    const categoryId = new mongoose.Types.ObjectId();
    const products = [
      { _id: new mongoose.Types.ObjectId(), category: { _id: categoryId, name: 'Máy tính', description: 'Mô tả gốc' } },
      { _id: new mongoose.Types.ObjectId(), category: { _id: categoryId, name: 'Máy tính', description: 'Mô tả gốc' } },
    ];
    const find = sandbox.stub(CategoryCatalogTranslationCache, 'find').returns({
      lean: sandbox.stub().resolves([{
        entityId: categoryId.toString(),
        targetLang: 'en',
        status: 'success',
        name: 'Computers',
        description: 'Translated description',
      }]),
    });

    const localizedProducts = await localizeProductCategories(products, 'en');

    expect(find.calledOnceWith({
      entityId: { $in: [categoryId.toString()] },
      targetLang: 'en',
      status: 'success',
    })).to.be.true;
    expect(localizedProducts[0].category).to.include({
      name: 'Computers',
      description: 'Translated description',
    });
    expect(localizedProducts[1].category).to.include({
      name: 'Computers',
      description: 'Translated description',
    });
  });

  it('keeps source category values when no successful exact-language translation exists', async () => {
    const categoryId = new mongoose.Types.ObjectId();
    const product = {
      _id: new mongoose.Types.ObjectId(),
      category: { _id: categoryId, name: 'Máy tính', description: 'Mô tả gốc' },
    };
    const find = sandbox.stub(CategoryCatalogTranslationCache, 'find').returns({
      lean: sandbox.stub().resolves([]),
    });

    const localizedProduct = await localizeProductCategory(product, 'en');

    expect(find.calledOnceWith({
      entityId: { $in: [categoryId.toString()] },
      targetLang: 'en',
      status: 'success',
    })).to.be.true;
    expect(localizedProduct.category).to.deep.equal(product.category);
  });

  it('preserves products whose category is missing or not populated', async () => {
    const products = [
      { _id: new mongoose.Types.ObjectId(), category: null },
      { _id: new mongoose.Types.ObjectId(), category: new mongoose.Types.ObjectId() },
    ];
    const find = sandbox.stub(CategoryCatalogTranslationCache, 'find');

    const localizedProducts = await localizeProductCategories(products, 'en');

    expect(find.notCalled).to.be.true;
    expect(localizedProducts).to.deep.equal(products);
  });
});
