/**
 * Bộ test cho controller createProductReview
 * Kiểm tra tạo review sản phẩm mới với validation
 * - Sản phẩm phải tồn tại
 * - Người dùng chỉ có thể review 1 sản phẩm một lần
 * Vị trí: test/controllers/reviews/createProductReview.test.js
 */
const chai = require('chai');
const expect = chai.expect;
const sinon = require('sinon');
const mongoose = require('mongoose');
const Review = require('../../../src/models/Review');
const Product = require('../../../src/models/Product');
const { createProductReview } = require('../../../src/controllers/reviewController');

describe('Review Controller - createProductReview', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  let findByIdStub, findOneStub, findReviewStub, saveStub;

  beforeEach(() => {
    findByIdStub = sandbox.stub(Product, 'findById');
    findOneStub = sandbox.stub(Review, 'findOne');
    findReviewStub = sandbox.stub(Review, 'find');
    saveStub = sandbox.stub(Product.prototype, 'save');
  });

  it('should create a new product review', async () => {
    const productId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();

    const product = {
      _id: productId,
      name: 'Test Laptop',
      numReviews: 0,
      rating: 0,
      save: saveStub.resolvesThis(),
    };

    findByIdStub.resolves(product);
    findOneStub.resolves(null);

    const newReview = {
      _id: new mongoose.Types.ObjectId(),
      product: productId,
      user: userId,
      rating: 5,
      comment: 'Excellent product!',
    };

    sandbox.stub(Review.prototype, 'save').resolves(newReview);
    findReviewStub.resolves([newReview]);

    const req = {
      params: { productId: productId.toString() },
      user: { _id: userId, name: 'Test User' },
      body: {
        rating: 5,
        comment: 'Excellent product!',
      },
    };
    const res = {
      status: sandbox.stub().returnsThis(),
      json: sandbox.stub(),
    };

    await createProductReview(req, res);

    expect(res.status.calledWith(201)).to.be.true;
    expect(res.json.calledOnce).to.be.true;
  });

  it('should return 404 if product not found', async () => {
    const productId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();

    findByIdStub.resolves(null);

    const req = {
      params: { productId: productId.toString() },
      user: { _id: userId },
      body: {
        rating: 5,
        comment: 'Good product',
      },
    };
    const res = {
      status: sandbox.stub().returnsThis(),
      json: sandbox.stub(),
    };

    let errorThrown = false;
    try {
      await createProductReview(req, res);
    } catch (error) {
      errorThrown = true;
      expect(res.status.calledWith(404)).to.be.true;
    }
    expect(errorThrown).to.be.true;
  });

  it('should return 400 if product already reviewed by user', async () => {
    const productId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();

    const product = {
      _id: productId,
      name: 'Test Laptop',
    };

    const existingReview = {
      _id: new mongoose.Types.ObjectId(),
      product: productId,
      user: userId,
    };

    findByIdStub.resolves(product);
    findOneStub.resolves(existingReview);

    const req = {
      params: { productId: productId.toString() },
      user: { _id: userId },
      body: {
        rating: 4,
        comment: 'Another review',
      },
    };
    const res = {
      status: sandbox.stub().returnsThis(),
      json: sandbox.stub(),
    };

    let errorThrown = false;
    try {
      await createProductReview(req, res);
    } catch (error) {
      errorThrown = true;
      expect(res.status.calledWith(400)).to.be.true;
    }
    expect(errorThrown).to.be.true;
  });
});
