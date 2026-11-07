process.env.JWT_ACCESS_SECRET = 'isolated-order-api-access-secret';
process.env.JWT_SECRET = process.env.JWT_ACCESS_SECRET;
process.env.JWT_REFRESH_SECRET = 'isolated-order-api-refresh-secret';

const express = require('express');
const request = require('supertest');
const { expect } = require('chai');
const sinon = require('sinon');
const mongoose = require('mongoose');
const { generateAccessToken } = require('../utils/generateToken');
const User = require('../models/User');
const Customer = require('../models/Customer');
const TokenBlacklist = require('../models/TokenBlacklist');
const Order = require('../models/Order');
const Currency = require('../models/Currency');
const orderRoutes = require('../routes/orderRoutes');
const { errorHandler } = require('../middleware/errorMiddleware');

const app = express();
app.use(express.json());
app.use('/api/orders', orderRoutes);
app.use(errorHandler);

describe('Order HTTP API', () => {
  let sandbox;
  const adminUser = { _id: new mongoose.Types.ObjectId(), email: 'admin@example.com', role: 'admin' };
  const customerUser = { _id: new mongoose.Types.ObjectId(), email: 'customer@example.com', role: 'customer' };

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(TokenBlacklist, 'findOne').resolves(null);
    sandbox.stub(User, 'findById').callsFake((id) => ({
      select: sandbox.stub().resolves(
        String(id) === String(adminUser._id) ? adminUser : customerUser,
      ),
    }));
    sandbox.stub(Currency, 'find').returns({
      lean: sandbox.stub().resolves([
        { code: 'USD', symbol: '$', position: 'before', decimalPlaces: 2 },
      ]),
    });
  });

  afterEach(() => sandbox.restore());

  const auth = (user) => `Bearer ${generateAccessToken(user._id.toString())}`;

  it('requires authentication for the order list', async () => {
    const response = await request(app).get('/api/orders');
    expect(response.status).to.equal(401);
  });

  it('rejects non-admin access to the order list', async () => {
    const response = await request(app)
      .get('/api/orders')
      .set('Authorization', auth(customerUser));

    expect(response.status).to.equal(403);
  });

  it('applies keyword, status, payment, and pagination filters in the database query', async () => {
    const customerLookup = {
      select: sandbox.stub().returnsThis(),
      lean: sandbox.stub().resolves([]),
    };
    const userLookup = {
      select: sandbox.stub().returnsThis(),
      lean: sandbox.stub().resolves([]),
    };
    sandbox.stub(Customer, 'find').returns(customerLookup);
    sandbox.stub(User, 'find').returns(userLookup);

    const countQuery = { maxTimeMS: sandbox.stub().resolves(0) };
    const countDocuments = sandbox.stub(Order, 'countDocuments').returns(countQuery);
    const listQuery = {
      populate: sandbox.stub().returnsThis(),
      sort: sandbox.stub().returnsThis(),
      limit: sandbox.stub().returnsThis(),
      skip: sandbox.stub().returnsThis(),
      maxTimeMS: sandbox.stub().returnsThis(),
      lean: sandbox.stub().resolves([]),
    };
    const findOrders = sandbox.stub(Order, 'find').returns(listQuery);

    const response = await request(app)
      .get('/api/orders?keyword=Jane&status=paid&paymentMethod=cod&pageNumber=2&pageSize=5')
      .set('Authorization', auth(adminUser));

    expect(response.status).to.equal(200);
    expect(countDocuments.firstCall.args[0]).to.include({ isDeleted: false, isPaid: true, isDelivered: false, paymentMethod: 'cod' });
    expect(countDocuments.firstCall.args[0].$or).to.have.length(6);
    expect(findOrders.firstCall.args[0]).to.deep.equal(countDocuments.firstCall.args[0]);
    expect(listQuery.limit.calledWith(5)).to.equal(true);
    expect(listQuery.skip.calledWith(5)).to.equal(true);
  });

  it('returns field-level validation errors for an invalid list filter', async () => {
    const response = await request(app)
      .get('/api/orders?status=unknown')
      .set('Authorization', auth(adminUser));

    expect(response.status).to.equal(400);
    expect(response.body.code).to.equal('VALIDATION_FAILED');
    expect(response.body.errors.some(({ field }) => field === 'status')).to.equal(true);
  });

  it('validates order updates before accessing data', async () => {
    const response = await request(app)
      .put(`/api/orders/${new mongoose.Types.ObjectId()}`)
      .set('Authorization', auth(adminUser))
      .send({ shippingAddress: { name: 'A', phone: '123', address: '' } });

    expect(response.status).to.equal(400);
    expect(response.body.code).to.equal('VALIDATION_FAILED');
    expect(response.body.errors).to.have.length.greaterThan(0);
  });

  it('uses the canonical hard-delete endpoint', async () => {
    const order = { _id: new mongoose.Types.ObjectId(), isDeleted: true };
    sandbox.stub(Order, 'findById').resolves(order);
    sandbox.stub(Order, 'findByIdAndDelete').resolves(order);

    const response = await request(app)
      .delete(`/api/orders/${order._id}/hard`)
      .set('Authorization', auth(adminUser));

    expect(response.status).to.equal(200);
  });

  it('rejects invalid order status payloads', async () => {
    const orderId = new mongoose.Types.ObjectId();
    const invalidValue = await request(app)
      .put(`/api/orders/${orderId}/status`)
      .set('Authorization', auth(adminUser))
      .send({ isDelivered: 'yes' });
    const emptyPayload = await request(app)
      .put(`/api/orders/${orderId}/status`)
      .set('Authorization', auth(adminUser))
      .send({});

    expect(invalidValue.status).to.equal(400);
    expect(emptyPayload.status).to.equal(400);
  });

  it('rejects hard deletion of an active order', async () => {
    const order = { _id: new mongoose.Types.ObjectId(), isDeleted: false };
    sandbox.stub(Order, 'findById').resolves(order);

    const response = await request(app)
      .delete(`/api/orders/${order._id}/hard`)
      .set('Authorization', auth(adminUser));

    expect(response.status).to.equal(409);
  });

  it('rejects shipping updates after payment has started', async () => {
    const order = {
      _id: new mongoose.Types.ObjectId(),
      isDeleted: false,
      isPaid: true,
      isDelivered: false,
      shipmentStatus: 'pending',
      save: sandbox.stub(),
    };
    sandbox.stub(Order, 'findOne').resolves(order);

    const response = await request(app)
      .put(`/api/orders/${order._id}`)
      .set('Authorization', auth(adminUser))
      .send({
        shippingAddress: { name: 'Updated Name', phone: '0901234567', address: '12 Le Loi' },
      });

    expect(response.status).to.equal(409);
    expect(response.body.code).to.equal('ORDER_CANNOT_BE_EDITED');
    expect(order.save.called).to.equal(false);
  });

  it('updates shipping details for an unpaid order', async () => {
    const order = {
      _id: new mongoose.Types.ObjectId(),
      isDeleted: false,
      isPaid: false,
      isDelivered: false,
      shipmentStatus: 'pending',
      shippingAddress: { name: 'Old Name', phone: '0900000000', address: 'Old Address', districtId: 1 },
      currencyCode: 'USD',
      baseCurrencyCode: 'USD',
      itemsPrice: 20,
      discount: 0,
      taxPrice: 0,
      shippingFee: 0,
      totalPrice: 20,
      baseItemsPrice: 20,
      baseDiscount: 0,
      baseShippingFee: 0,
      baseTotalPrice: 20,
      orderItems: [],
      exchangeRates: [],
      save: sandbox.stub().callsFake(async function () { return this; }),
    };
    sandbox.stub(Order, 'findOne').resolves(order);

    const response = await request(app)
      .put(`/api/orders/${order._id}`)
      .set('Authorization', auth(adminUser))
      .send({
        shippingAddress: {
          name: 'Updated Name',
          phone: '0901234567',
          address: '12 Le Loi, Quan 1',
        },
      });

    expect(response.status).to.equal(200);
    expect(response.body.shippingAddress).to.include({
      name: 'Updated Name',
      phone: '0901234567',
      address: '12 Le Loi, Quan 1',
    });
    expect(order.save.calledOnce).to.equal(true);
  });
});
