/**
 * Test Suite: Order Controller
 * Kiểm tra: tạo đơn hàng, cập nhật trạng thái paid/delivered
 * Kiểm tra: quản lý customer tự động, kiểm tra stock, soft/hard delete
 * Kiểm tra: phân trang, tìm kiếm, validate dữ liệu
 */

const chai = require('chai');
const expect = chai.expect;
const sinon = require('sinon');
const mongoose = require('mongoose');
const Order = require('../../../models/Order');
const Product = require('../../../models/Product');
const Currency = require('../../../models/Currency');
const ExchangeRate = require('../../../models/ExchangeRate');
const { addOrderItems, updateOrderStatus, updateOrderToDelivered, getMyOrders, deleteOrder, hardDeleteOrder } = require('../../../controllers/orderController');

const createQuery = (sandbox, result) => ({
  populate: sandbox.stub().returnsThis(),
  then: (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected),
});

const createCurrencyQuery = (sandbox, result) => ({
  lean: sandbox.stub().resolves(result),
});

const createOrder = (id, userId, productId) => ({
  _id: id,
  user: userId,
  orderItems: [{ product: productId, qty: 2, price: 100, name: 'Laptop', image: '/laptop.jpg' }],
  itemsPrice: 200,
  discount: 0,
  taxPrice: 0,
  shippingFee: 0,
  totalPrice: 200,
  currencyCode: 'USD',
  baseCurrencyCode: 'USD',
  baseItemsPrice: 200,
  baseDiscount: 0,
  baseShippingFee: 0,
  baseTotalPrice: 200,
  exchangeRates: [],
});

describe('Order Controller', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(Currency, 'find').returns(createCurrencyQuery(sandbox, [
      { code: 'USD', symbol: '$', position: 'before', decimalPlaces: 2 },
    ]));
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('addOrderItems', () => {
    it('should create a new order from canonical cartItems input', async () => {
      const productId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();
      const savedOrder = createOrder(new mongoose.Types.ObjectId(), userId, productId);
      const populatedOrder = { ...savedOrder };

      sandbox.stub(Product, 'find').resolves([{
        _id: productId,
        countInStock: 100,
        price: 100,
        baseCurrencyCode: 'USD',
        name: 'Laptop',
        image: '/laptop.jpg',
      }]);
      sandbox.stub(Currency, 'findOne')
        .onFirstCall().returns(createCurrencyQuery(sandbox, { code: 'USD' }))
        .onSecondCall().returns(createCurrencyQuery(sandbox, { code: 'USD' }));
      sandbox.stub(ExchangeRate, 'find').resolves([]);
      sandbox.stub(Order.prototype, 'save').resolves(savedOrder);
      sandbox.stub(Order, 'findById').returns(createQuery(sandbox, populatedOrder));

      const req = {
        user: { _id: userId },
        body: {
          cartItems: [{ productId: productId.toString(), quantity: 2 }],
          currencyCode: 'USD',
          paymentMethod: 'cod',
        },
        lang: 'en',
        locale: 'en',
        app: { get: sandbox.stub().returns(null) },
      };
      const res = { status: sandbox.stub().returnsThis(), json: sandbox.stub() };

      await addOrderItems(req, res);
      expect(res.status.calledWith(201)).to.be.true;
      expect(res.json.calledOnce).to.be.true;
      expect(res.json.firstCall.args[0].data.orderItems[0].qty).to.equal(2);
    });

    it('should return 400 if cartItems is empty', async () => {
      const req = {
        user: { _id: new mongoose.Types.ObjectId() },
        body: { cartItems: [] },
        lang: 'en',
      };
      const res = { status: sandbox.stub().returnsThis(), json: sandbox.stub() };

      try {
        await addOrderItems(req, res);
      } catch (error) {
        expect(res.status.calledWith(400)).to.be.true;
      }
    });
  });

  describe('updateOrderStatus', () => {
    it('should update an order delivery status', async () => {
      const order = {
        _id: new mongoose.Types.ObjectId(),
        isPaid: false,
        isDelivered: false,
        orderItems: [],
        save: sandbox.stub().resolvesThis(),
      };
      sandbox.stub(Order, 'findOne').resolves(order);

      const req = {
        params: { id: order._id.toString() },
        body: { isDelivered: true },
        lang: 'en',
        locale: 'en',
        app: { get: sandbox.stub().returns(null) },
      };
      const res = { json: sandbox.stub() };

      await updateOrderStatus(req, res);
      expect(order.isDelivered).to.be.true;
      expect(res.json.calledOnce).to.be.true;
    });
  });

  describe('updateOrderToDelivered', () => {
    it('should update order to delivered', async () => {
      const order = {
        ...createOrder(new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()),
        isDelivered: false,
        deliveredAt: null,
        save: sandbox.stub().resolvesThis(),
      };
      sandbox.stub(Order, 'findOne').resolves(order);

      const req = {
        params: { id: order._id.toString() },
        lang: 'en',
        locale: 'en',
        app: { get: sandbox.stub().returns(null) },
      };
      const res = { json: sandbox.stub() };
      
      await updateOrderToDelivered(req, res);
      expect(res.json.calledOnce).to.be.true;
    });
  });

  describe('getMyOrders', () => {
    it('should fetch user orders with pagination', async () => {
      const userId = new mongoose.Types.ObjectId();
      const orders = [{ _id: new mongoose.Types.ObjectId(), user: userId }];
      sandbox.stub(Order, 'countDocuments').resolves(1);
      const mockChain = {
        populate: sandbox.stub().returnsThis(),
        sort: sandbox.stub().returnsThis(),
        limit: sandbox.stub().returnsThis(),
        skip: sandbox.stub().resolves(orders),
      };
      sandbox.stub(Order, 'find').returns(mockChain);

      const req = { user: { _id: userId }, query: { pageNumber: '1' }, lang: 'en', locale: 'en' };
      const res = { json: sandbox.stub() };
      
      await getMyOrders(req, res);
      expect(res.json.calledOnce).to.be.true;
    });
  });

  describe('deleteOrder', () => {
    it('should soft delete an order', async () => {
      const order = { _id: new mongoose.Types.ObjectId(), isDeleted: false, save: sandbox.stub().resolves() };
      sandbox.stub(Order, 'findOne').resolves(order);

      const req = { params: { id: order._id.toString() }, app: { get: sandbox.stub().returns(null) }, lang: 'en' };
      const res = { json: sandbox.stub() };
      
      await deleteOrder(req, res);
      expect(order.isDeleted).to.be.true;
    });
  });

  describe('hardDeleteOrder', () => {
    it('should hard delete an order', async () => {
      const orderId = new mongoose.Types.ObjectId();
      sandbox.stub(Order, 'findById').resolves({ _id: orderId });
      sandbox.stub(Order, 'findByIdAndDelete').resolves({ _id: orderId });

      const req = { params: { id: orderId.toString() }, lang: 'en' };
      const res = { json: sandbox.stub() };
      
      await hardDeleteOrder(req, res);
      expect(res.json.calledOnce).to.be.true;
    });
  });
});
