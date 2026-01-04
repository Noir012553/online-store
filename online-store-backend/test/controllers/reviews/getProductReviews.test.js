/**
 * Bộ test cho controller getProductReviews
 * Kiểm tra lấy tất cả review sản phẩm với phân trang và lọc
 * Vị trí: test/controllers/reviews/getProductReviews.test.js
 */
const chai = require('chai');
const expect = chai.expect;
const sinon = require('sinon');
const mongoose = require('mongoose');
const Review = require('../../../src/models/Review');
const { getProductReviews } = require('../../../src/controllers/reviewController');

describe('Review Controller - getProductReviews', () => {
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
      populate: sandbox.stub().returnsThis(),
      limit: sandbox.stub().returnsThis(),
      skip: sandbox.stub().returnsThis(),
      then: sandbox.stub(),
    };
    findStub = sandbox.stub(Review, 'find').returns(mockQuery);
    countDocumentsStub = sandbox.stub(Review, 'countDocuments');
  });

  it('should fetch all reviews for a product with pagination', async () => {
    const productId = new mongoose.Types.ObjectId();
    const reviews = [
      {
        _id: new mongoose.Types.ObjectId(),
        product: productId,
        rating: 5,
        comment: 'Great product!',
        isDeleted: false,
      },
      {
        _id: new mongoose.Types.ObjectId(),
        product: productId,
        rating: 4,
        comment: 'Good quality',
        isDeleted: false,
      },
    ];

    countDocumentsStub.resolves(2);
    mockQuery.then.callsFake(function(onFulfilled) {
      return Promise.resolve(reviews).then(onFulfilled);
    });

    const req = {
      params: { productId: productId.toString() },
      query: {
        pageNumber: '1',
        pageSize: '10',
      },
    };
    const res = {
      json: sandbox.stub(),
      status: sandbox.stub().returnsThis(),
    };

    await getProductReviews(req, res);

    expect(res.json.calledOnce).to.be.true;
    const responseData = res.json.getCall(0).args[0];
    expect(responseData.reviews).to.deep.equal(reviews);
    expect(responseData.page).to.equal(1);
  });

  it('should fetch reviews filtered by keyword', async () => {
    const productId = new mongoose.Types.ObjectId();
    const keyword = 'excellent';
    const reviews = [
      {
        _id: new mongoose.Types.ObjectId(),
        product: productId,
        rating: 5,
        comment: 'Excellent product!',
        isDeleted: false,
      },
    ];

    countDocumentsStub.resolves(1);
    mockQuery.then.callsFake(function(onFulfilled) {
      return Promise.resolve(reviews).then(onFulfilled);
    });

    const req = {
      params: { productId: productId.toString() },
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

    await getProductReviews(req, res);

    expect(res.json.calledOnce).to.be.true;
    const responseData = res.json.getCall(0).args[0];
    expect(responseData.reviews).to.deep.equal(reviews);
  });
});
