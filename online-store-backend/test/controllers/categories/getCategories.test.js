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
const { getCategories, getCategoryById, createCategory, updateCategory, deleteCategory, hardDeleteCategory } = require('../../../src/controllers/categoryController');

describe('Category Controller - getCategories', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  let findStub, countDocumentsStub, mockQuery;

  beforeEach(() => {
    mockQuery = {
      limit: sandbox.stub().returnsThis(),
      skip: sandbox.stub().returnsThis(),
      then: sandbox.stub(),
    };
    findStub = sandbox.stub(Category, 'find').returns(mockQuery);
    countDocumentsStub = sandbox.stub(Category, 'countDocuments');
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
});
