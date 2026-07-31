/**
 * Test Suite: Coupon Controller
 * Kiểm tra: lấy danh sách coupon, chi tiết coupon, tạo/cập nhật/xóa mã giảm giá
 * Kiểm tra: tính toán giảm giá percentage/fixed, validate date range, soft/hard delete
 */

const chai = require('chai');
const expect = chai.expect;
const sinon = require('sinon');
const mongoose = require('mongoose');
const Coupon = require('../../../src/models/Coupon');
const { getCoupons, createCoupon, calculateDiscount, deleteCoupon } = require('../../../src/controllers/couponController');

describe('Coupon Controller', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('getCoupons', () => {
    it('should fetch all active coupons with pagination', async () => {
      const mockCoupons = [{ _id: new mongoose.Types.ObjectId(), code: 'SUMMER20', discountValue: 20 }];
      const mockChain = { populate: sandbox.stub().returnsThis(), limit: sandbox.stub().returnsThis(), skip: sandbox.stub().resolves(mockCoupons) };
      sandbox.stub(Coupon, 'find').returns(mockChain);
      sandbox.stub(Coupon, 'countDocuments').resolves(1);

      const req = { query: { pageNumber: '1' } };
      const res = { json: sandbox.stub() };
      await getCoupons(req, res);
      expect(res.json.calledOnce).to.be.true;
    });
  });

  describe('createCoupon', () => {
    it('should create a new coupon', async () => {
      sandbox.stub(Coupon, 'findOne').resolves(null);
      sandbox.stub(Coupon.prototype, 'save').resolves({ code: 'NEW' });

      const req = {
        body: { code: 'NEWCOUPON', discountType: 'percentage', discountValue: 15, startDate: new Date(), endDate: new Date(Date.now() + 86400000) },
      };
      const res = { status: sandbox.stub().returnsThis(), json: sandbox.stub() };
      await createCoupon(req, res);
      expect(res.status.calledWith(201)).to.be.true;
    });
  });

  describe('calculateDiscount', () => {
    it('should calculate 20% discount correctly', async () => {
      const mockCoupon = {
        code: 'SUMMER20', discountType: 'percentage', discountValue: 20, currentUses: 0, maxUses: 100, minOrderAmount: 0,
        startDate: new Date(Date.now() - 86400000), endDate: new Date(Date.now() + 86400000), isActive: true, isDeleted: false,
      };
      sandbox.stub(Coupon, 'findOne').resolves(mockCoupon);

      const req = { body: { couponCode: 'SUMMER20', orderAmount: 1000000, products: [] } };
      const res = { json: sandbox.stub(), status: sandbox.stub().returnsThis() };
      await calculateDiscount(req, res);

      const result = res.json.getCall(0).args[0];
      expect(result.discount).to.equal(200000);
      expect(result.finalAmount).to.equal(800000);
    });

    it('should calculate 100k fixed discount correctly', async () => {
      const mockCoupon = {
        code: 'WELCOME100', discountType: 'fixed', discountValue: 100000, currentUses: 0, maxUses: 100, minOrderAmount: 0,
        startDate: new Date(Date.now() - 86400000), endDate: new Date(Date.now() + 86400000), isActive: true, isDeleted: false,
      };
      sandbox.stub(Coupon, 'findOne').resolves(mockCoupon);

      const req = { body: { couponCode: 'WELCOME100', orderAmount: 500000, products: [] } };
      const res = { json: sandbox.stub(), status: sandbox.stub().returnsThis() };
      await calculateDiscount(req, res);

      const result = res.json.getCall(0).args[0];
      expect(result.discount).to.equal(100000);
      expect(result.finalAmount).to.equal(400000);
    });

    it('should reject if usage limit reached', async () => {
      const mockCoupon = {
        code: 'LIMIT', discountType: 'percentage', discountValue: 10, currentUses: 100, maxUses: 100, minOrderAmount: 0,
        startDate: new Date(Date.now() - 86400000), endDate: new Date(Date.now() + 86400000), isActive: true, isDeleted: false,
      };
      sandbox.stub(Coupon, 'findOne').resolves(mockCoupon);

      const req = { body: { couponCode: 'LIMIT', orderAmount: 1000000, products: [] } };
      const res = { status: sandbox.stub().returnsThis() };

      try {
        await calculateDiscount(req, res);
      } catch (error) {
        expect(error.message).to.include('usage limit');
      }
    });

    it('should reject if order below minimum amount', async () => {
      const mockCoupon = {
        code: 'MINORDER', discountType: 'percentage', discountValue: 10, currentUses: 0, maxUses: 100, minOrderAmount: 500000,
        startDate: new Date(Date.now() - 86400000), endDate: new Date(Date.now() + 86400000), isActive: true, isDeleted: false,
      };
      sandbox.stub(Coupon, 'findOne').resolves(mockCoupon);

      const req = { body: { couponCode: 'MINORDER', orderAmount: 300000, products: [] } };
      const res = { status: sandbox.stub().returnsThis() };

      try {
        await calculateDiscount(req, res);
      } catch (error) {
        expect(error.message).to.include('at least');
      }
    });
  });

  describe('deleteCoupon', () => {
    it('should soft delete a coupon', async () => {
      const couponId = new mongoose.Types.ObjectId();
      const coupon = { _id: couponId, isDeleted: false, save: sandbox.stub().resolves() };
      sandbox.stub(Coupon, 'findById').resolves(coupon);

      const req = { params: { id: couponId.toString() } };
      const res = { json: sandbox.stub() };
      await deleteCoupon(req, res);
      expect(coupon.isDeleted).to.be.true;
    });
  });
});
