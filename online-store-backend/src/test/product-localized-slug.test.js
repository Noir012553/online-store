const { expect } = require('chai');
const sinon = require('sinon');
const mongoose = require('mongoose');
const ProductLocalizedSlug = require('../models/ProductLocalizedSlug');
const {
  changeCanonicalProductSlug,
  getSlugCandidates,
  slugifyProductName,
} = require('../services/productLocalizedSlugService');

describe('Product localized slug service', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });
  it('normalizes Vietnamese accents and punctuation into stable ASCII slugs', () => {
    expect(slugifyProductName('Bàn phím Razer BlackWidow V4 - Yellow Switch'))
      .to.equal('ban-phim-razer-blackwidow-v4-yellow-switch');
    expect(slugifyProductName('Đặng’s Écran & Cảm ứng'))
      .to.equal('dang-s-ecran-cam-ung');
  });

  it('creates deterministic locale, SKU, and product ID collision candidates', () => {
    const candidates = getSlugCandidates(
      'Bàn phím Razer',
      'en',
      'RBW V4',
      '65a0d73a0069aece85a8c903',
    );

    expect(candidates).to.deep.equal([
      'ban-phim-razer',
      'ban-phim-razer-en',
      'ban-phim-razer-rbw-v4',
      'ban-phim-razer-85a8c903',
      'ban-phim-razer-65a0d73a0069aece85a8c903',
    ]);
  });

  it('does not return duplicate collision candidates', () => {
    const candidates = getSlugCandidates('Mouse', 'en', 'mouse', 'a'.repeat(24));
    expect(new Set(candidates).size).to.equal(candidates.length);
  });

  it('rejects a slug that normalizes to an empty value', async () => {
    try {
      await changeCanonicalProductSlug({
        productId: new mongoose.Types.ObjectId(),
        locale: 'vi',
        slug: '!!!',
      });
      throw new Error('Expected invalid slug to be rejected');
    } catch (error) {
      expect(error.status).to.equal(400);
      expect(error.errorCode).to.equal('INVALID_PRODUCT_SLUG');
    }
  });

  it('keeps the previous canonical slug as an alias', async () => {
    const productId = new mongoose.Types.ObjectId();
    const session = {
      withTransaction: sandbox.stub().callsFake((callback) => callback()),
      endSession: sandbox.stub().resolves(),
    };
    sandbox.stub(mongoose, 'startSession').resolves(session);
    const current = {
      productId,
      locale: 'vi',
      slug: 'old-name',
      sourceName: 'Tên sản phẩm',
      status: 'canonical',
      save: sandbox.stub().resolvesThis(),
    };
    const findOne = sandbox.stub(ProductLocalizedSlug, 'findOne');
    findOne.onFirstCall().returns({ session: sandbox.stub().resolves(current) });
    findOne.onSecondCall().returns({ session: sandbox.stub().resolves(null) });
    const created = { slug: 'new-name' };
    const create = sandbox.stub(ProductLocalizedSlug, 'create').resolves([created]);

    const result = await changeCanonicalProductSlug({ productId, locale: 'vi', slug: 'New Name' });

    expect(current.status).to.equal('alias');
    expect(current.save.calledOnceWith({ session })).to.equal(true);
    expect(create.calledOnce).to.equal(true);
    expect(create.firstCall.args[0][0]).to.include({
      productId,
      locale: 'vi',
      slug: 'new-name',
      sourceName: 'Tên sản phẩm',
      status: 'canonical',
    });
    expect(result).to.deep.equal({ slug: 'new-name', previousSlug: 'old-name' });
    expect(session.endSession.calledOnce).to.equal(true);
  });

  it('rejects a slug that belongs to another product', async () => {
    const productId = new mongoose.Types.ObjectId();
    const session = {
      withTransaction: sandbox.stub().callsFake((callback) => callback()),
      endSession: sandbox.stub().resolves(),
    };
    sandbox.stub(mongoose, 'startSession').resolves(session);
    const current = {
      productId,
      locale: 'vi',
      slug: 'old-name',
      sourceName: 'Tên sản phẩm',
      status: 'canonical',
      save: sandbox.stub().resolvesThis(),
    };
    const findOne = sandbox.stub(ProductLocalizedSlug, 'findOne');
    findOne.onFirstCall().returns({ session: sandbox.stub().resolves(current) });
    findOne.onSecondCall().returns({
      session: sandbox.stub().resolves({ productId: new mongoose.Types.ObjectId(), locale: 'vi', status: 'canonical' }),
    });

    try {
      await changeCanonicalProductSlug({ productId, locale: 'vi', slug: 'taken-name' });
      throw new Error('Expected slug collision to be rejected');
    } catch (error) {
      expect(error.status).to.equal(409);
      expect(error.errorCode).to.equal('PRODUCT_SLUG_CONFLICT');
    }

    expect(current.save.called).to.equal(false);
    expect(session.endSession.calledOnce).to.equal(true);
  });
});
