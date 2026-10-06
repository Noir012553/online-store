/**
 * Bộ test cho controller updateReview
 * Kiểm tra cập nhật review với xác thực quyền truy cập
 * Vị trí: test/controllers/reviews/updateReview.test.js
 */
const chai = require('chai');
const expect = chai.expect;
const sinon = require('sinon');
const mongoose = require('mongoose');
const Review = require('../../../models/Review');
const Product = require('../../../models/Product');
const { updateReview } = require('../../../controllers/reviewController');

describe('Review Controller - updateReview', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  let findOneStub, findByIdStub, saveStub;

  beforeEach(() => {
    findOneStub = sandbox.stub(Review, 'findOne');
    findByIdStub = sandbox.stub(Product, 'findById');
    sandbox.stub(Review, 'aggregate').resolves([{ avgRating: 0, count: 0 }]);
    saveStub = sandbox.stub(Product.prototype, 'save');
  });

  it('should update a review', async () => {
    const reviewId = new mongoose.Types.ObjectId();
    const productId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();

    const review = {
      _id: reviewId,
      product: productId,
      user: userId,
      rating: 3,
      comment: 'Old comment',
      save: sandbox.stub().resolvesThis(),
    };

    const product = {
      _id: productId,
      save: saveStub.resolvesThis(),
    };

    findOneStub.resolves(review);
    findByIdStub.resolves(product);
    const req = {
      params: { id: reviewId.toString() },
      query: {},
      user: { _id: userId },
      body: {
        rating: 5,
        comment: 'Updated comment',
      },
    };
    const res = {
      json: sandbox.stub(),
      status: sandbox.stub().returnsThis(),
    };

    await updateReview(req, res);

    expect(review.rating).to.equal(5);
    expect(review.comment).to.equal('Updated comment');
    expect(review.save.calledOnce).to.be.true;
    expect(res.json.calledOnce).to.be.true;
  });

  it('should return 404 if review not found', async () => {
    const reviewId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();

    findOneStub.resolves(null);

    const req = {
      params: { id: reviewId.toString() },
      query: {},
      user: { _id: userId },
      body: {
        rating: 5,
        comment: 'New comment',
      },
    };
    const res = {
      json: sandbox.stub(),
      status: sandbox.stub().returnsThis(),
    };

    let errorThrown = false;
    try {
      await updateReview(req, res);
    } catch (error) {
      errorThrown = true;
      expect(res.status.calledWith(404)).to.be.true;
    }
    expect(errorThrown).to.be.true;
  });
});
