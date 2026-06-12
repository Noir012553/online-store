/**
 * Bộ test cho controller deleteReview & hardDeleteReview
 * Kiểm tra xóa mềm và xóa cứng review
 * Vị trí: test/controllers/reviews/deleteReview.test.js
 */
const chai = require('chai');
const expect = chai.expect;
const sinon = require('sinon');
const mongoose = require('mongoose');
const Review = require('../../../src/models/Review');
const Product = require('../../../src/models/Product');
const { deleteReview, hardDeleteReview } = require('../../../src/controllers/reviewController');

describe('Review Controller - deleteReview & hardDeleteReview', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('deleteReview (soft delete)', () => {
    let findByIdStub, findReviewStub, saveStub;

    beforeEach(() => {
      findByIdStub = sandbox.stub(Review, 'findById');
      findReviewStub = sandbox.stub(Review, 'find');
      saveStub = sandbox.stub(Product.prototype, 'save');
    });

    it('should soft delete a review', async () => {
      const reviewId = new mongoose.Types.ObjectId();
      const productId = new mongoose.Types.ObjectId();

      const review = {
        _id: reviewId,
        product: productId,
        isDeleted: false,
        save: sandbox.stub().resolvesThis(),
      };

      const product = {
        _id: productId,
        save: saveStub.resolvesThis(),
      };

      findByIdStub.resolves(review);
      sandbox.stub(Product, 'findById').resolves(product);
      findReviewStub.resolves([]);

      const req = {
        params: { id: reviewId.toString() },
      };
      const res = {
        json: sandbox.stub(),
        status: sandbox.stub().returnsThis(),
      };

      await deleteReview(req, res);

      expect(review.isDeleted).to.be.true;
      expect(review.save.calledOnce).to.be.true;
      expect(res.json.calledWith({ message: 'Review removed' })).to.be.true;
    });

    it('should return 404 if review not found for deletion', async () => {
      const reviewId = new mongoose.Types.ObjectId();
      findByIdStub.resolves(null);

      const req = {
        params: { id: reviewId.toString() },
      };
      const res = {
        json: sandbox.stub(),
        status: sandbox.stub().returnsThis(),
      };

      let errorThrown = false;
      try {
        await deleteReview(req, res);
      } catch (error) {
        errorThrown = true;
        expect(res.status.calledWith(404)).to.be.true;
      }
      expect(errorThrown).to.be.true;
    });
  });

  describe('hardDeleteReview', () => {
    let findByIdStub, findReviewStub, saveStub;

    beforeEach(() => {
      findByIdStub = sandbox.stub(Review, 'findById');
      findReviewStub = sandbox.stub(Review, 'find');
      saveStub = sandbox.stub(Product.prototype, 'save');
    });

    it('should hard delete a review', async () => {
      const reviewId = new mongoose.Types.ObjectId();
      const productId = new mongoose.Types.ObjectId();

      const review = {
        _id: reviewId,
        product: productId,
        deleteOne: sandbox.stub().resolves(),
      };

      const product = {
        _id: productId,
        save: saveStub.resolvesThis(),
      };

      findByIdStub.resolves(review);
      sandbox.stub(Product, 'findById').resolves(product);
      findReviewStub.resolves([]);

      const req = {
        params: { id: reviewId.toString() },
      };
      const res = {
        json: sandbox.stub(),
        status: sandbox.stub().returnsThis(),
      };

      await hardDeleteReview(req, res);

      expect(review.deleteOne.calledOnce).to.be.true;
      expect(res.json.calledWith({ message: 'Review permanently removed' })).to.be.true;
    });

    it('should return 404 if review not found for hard delete', async () => {
      const reviewId = new mongoose.Types.ObjectId();
      findByIdStub.resolves(null);

      const req = {
        params: { id: reviewId.toString() },
      };
      const res = {
        json: sandbox.stub(),
        status: sandbox.stub().returnsThis(),
      };

      let errorThrown = false;
      try {
        await hardDeleteReview(req, res);
      } catch (error) {
        errorThrown = true;
        expect(res.status.calledWith(404)).to.be.true;
      }
      expect(errorThrown).to.be.true;
    });
  });
});
