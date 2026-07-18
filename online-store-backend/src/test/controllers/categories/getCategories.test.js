/**
 * Bộ test cho controller getCategories
 * Kiểm tra lấy tất cả danh mục với phân trang và tìm kiếm từ khóa
 * Vị trí: test/controllers/categories/getCategories.test.js
 */
const chai = require('chai');
const expect = chai.expect;
const sinon = require('sinon');
const mongoose = require('mongoose');
const Category = require('../../../src/models/Category');
const CategoryCatalogTranslationCache = require('../../../src/models/CategoryCatalogTranslationCache');
const { getCategories, getCategoryById, createCategory, updateCategory, deleteCategory, hardDeleteCategory } = require('../../../src/controllers/categoryController');

describe('Category Controller - getCategories', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  let findStub, countDocumentsStub, translationFindStub, mockQuery;

  beforeEach(() => {
    translationFindStub = sandbox.stub(CategoryCatalogTranslationCache, 'find');
    mockQuery = {
      limit: sandbox.stub().returnsThis(),
      skip: sandbox.stub().returnsThis(),
      then: sandbox.stub(),
    };
    findStub = sandbox.stub(Category, 'find').returns(mockQuery);
    countDocumentsStub = sandbox.stub(Category, 'countDocuments');
    translationFindStub.returns({ lean: sandbox.stub().resolves([]) });
  });

  it('should fetch all categories with pagination', async () => {
    const categories = [
      { _id: new mongoose.Types.ObjectId(), name: 'Laptops', description: 'Laptop devices', isDeleted: false },
      { _id: new mongoose.Types.ObjectId(), name: 'Desktops', description: 'Desktop computers', isDeleted: false },
    ];

    countDocumentsStub.resolves(2);
    mockQuery.then.callsFake(function(onFulfilled) {
      return Promise.resolve(categories).then(onFulfilled);
    });

    const req = {
      query: {
        pageNumber: '1',
        pageSize: '10',
      },
    };
    const res = {
      json: sandbox.stub(),
      status: sandbox.stub().returnsThis(),
    };

    await getCategories(req, res);

    expect(res.json.calledOnce).to.be.true;
    const responseData = res.json.getCall(0).args[0];
    expect(responseData.categories).to.deep.equal(categories);
    expect(responseData.page).to.equal(1);
  });

  it('should overlay successful translations for the requested locale', async () => {
    const categoryId = new mongoose.Types.ObjectId();
    const categories = [{ _id: categoryId, name: 'Máy tính', description: 'Mô tả gốc', isDeleted: false }];
    countDocumentsStub.resolves(1);
    mockQuery.then.callsFake(function(onFulfilled) {
      return Promise.resolve(categories).then(onFulfilled);
    });
    translationFindStub.returns({
      lean: sandbox.stub().resolves([{
        entityId: categoryId.toString(),
        targetLang: 'en',
        status: 'success',
        name: 'Computers',
        description: 'Translated description',
      }]),
    });

    const res = {
      json: sandbox.stub(),
      status: sandbox.stub().returnsThis(),
    };
    await getCategories(
      { query: { pageNumber: '1', pageSize: '10' }, lang: 'en' },
      res
    );

    expect(res.json.firstCall.args[0].categories[0].name).to.equal('Computers');
    expect(res.json.firstCall.args[0].categories[0].description).to.equal('Translated description');
    expect(translationFindStub.calledWith({
      entityId: { $in: [categoryId.toString()] },
      targetLang: 'en',
      status: 'success',
    })).to.be.true;
  });

  it('should keep the source category when no successful translation exists', async () => {
    const categoryId = new mongoose.Types.ObjectId();
    const categories = [{ _id: categoryId, name: 'Máy tính', description: 'Mô tả gốc', isDeleted: false }];
    countDocumentsStub.resolves(1);
    mockQuery.then.callsFake(function(onFulfilled) {
      return Promise.resolve(categories).then(onFulfilled);
    });

    const res = {
      json: sandbox.stub(),
      status: sandbox.stub().returnsThis(),
    };
    await getCategories(
      { query: { pageNumber: '1', pageSize: '10' }, lang: 'en' },
      res
    );

    expect(res.json.firstCall.args[0].categories[0]).to.deep.equal(categories[0]);
  });

  it('should fetch categories filtered by keyword', async () => {
    const keyword = 'Laptop';
    const categories = [
      { _id: new mongoose.Types.ObjectId(), name: 'Laptops', description: 'Laptop devices', isDeleted: false },
    ];

    countDocumentsStub.resolves(1);
    mockQuery.then.callsFake(function(onFulfilled) {
      return Promise.resolve(categories).then(onFulfilled);
    });

    const req = {
      query: {
        keyword,
        pageNumber: '1',
        pageSize: '10',
      },
    };
    const res = {
      json: sandbox.stub(),
      status: sandbox.stub().returnsThis(),
    };

    await getCategories(req, res);

    expect(res.json.calledOnce).to.be.true;
    const responseData = res.json.getCall(0).args[0];
    expect(responseData.categories).to.deep.equal(categories);
  });

  it('should find categories by successful exact-locale translations', async () => {
    const categoryId = new mongoose.Types.ObjectId();
    const categories = [{ _id: categoryId, name: 'Máy tính', description: 'Mô tả gốc', isDeleted: false }];
    const translation = {
      entityId: categoryId.toString(),
      targetLang: 'en',
      status: 'success',
      name: 'Computers',
      description: 'Translated description',
    };

    countDocumentsStub.resolves(1);
    mockQuery.then.callsFake(function(onFulfilled) {
      return Promise.resolve(categories).then(onFulfilled);
    });
    translationFindStub.onFirstCall().returns({ lean: sandbox.stub().resolves([translation]) });
    translationFindStub.onSecondCall().returns({ lean: sandbox.stub().resolves([translation]) });

    const res = {
      json: sandbox.stub(),
      status: sandbox.stub().returnsThis(),
    };
    await getCategories(
      { query: { keyword: 'comput', pageNumber: '1', pageSize: '10' }, lang: 'en' },
      res
    );

    expect(Category.find.calledWith({
      isDeleted: false,
      $or: [
        { name: { $regex: 'comput', $options: 'i' } },
        { _id: { $in: [categoryId.toString()] } },
      ],
    })).to.be.true;
    expect(res.json.firstCall.args[0].categories[0].name).to.equal('Computers');
  });
});
