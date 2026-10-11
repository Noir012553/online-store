const expect = chai.expect;
const sinon = require('sinon');
const mongoose = require('mongoose');
const Review = require('../models/Review');
const Product = require('../models/Product');
const aboutMediaSeeder = require('../seeds/aboutMediaSeeder');
const reviewSeederPath = require.resolve('../seeds/reviewSeeder');
const loadReviewSeeder = () => {
  delete require.cache[reviewSeederPath];
  return require('../seeds/reviewSeeder');
};

describe('Review seeder', () => {
  let sandbox;
  let seedReviews;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(Review, 'deleteMany').resolves({ deletedCount: 0 });
    sandbox.stub(Review, 'create').callsFake(async reviews => reviews.map((review, index) => ({
      ...review,
      _id: new mongoose.Types.ObjectId(String(index + 1).padStart(24, '0')),
      product: { toString: () => String(review.product) },
    })));
    sandbox.stub(Review, 'aggregate').resolves([]);
    sandbox.stub(Product, 'bulkWrite').resolves({ modifiedCount: 0 });
  });

  afterEach(() => {
    sandbox.restore();
    delete require.cache[reviewSeederPath];
  });

  it('continues with empty avatars when remote avatar fetching fails', async () => {
    const fetchReviewerAssets = sandbox.stub(aboutMediaSeeder, 'seedAboutReviewers')
      .rejects(new TypeError('fetch failed'));
    seedReviews = loadReviewSeeder();
    const products = [{ _id: new mongoose.Types.ObjectId() }];
    const users = [{ _id: new mongoose.Types.ObjectId() }];

    await seedReviews(products, users, { skipTranslate: true });

    sinon.assert.callOrder(fetchReviewerAssets, Review.deleteMany);
    expect(Review.deleteMany.firstCall.args[0].product.$in).to.deep.equal([products[0]._id]);
    expect(Review.deleteMany.firstCall.args[0].comment.$in).to.have.length(8);
    expect(Review.create.firstCall.args[0][0].avatar).to.equal(null);
  });

  it('skips reviewer avatar requests when requested', async () => {
    const fetchReviewerAssets = sandbox.stub(aboutMediaSeeder, 'seedAboutReviewers');
    seedReviews = loadReviewSeeder();
    const products = [{ _id: new mongoose.Types.ObjectId() }];
    const users = [{ _id: new mongoose.Types.ObjectId() }];

    await seedReviews(products, users, { skipTranslate: true, skipReviewerAvatars: true });

    sinon.assert.notCalled(fetchReviewerAssets);
    expect(Review.create.firstCall.args[0][0].avatar).to.equal(null);
  });
});
