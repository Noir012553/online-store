/**
 * Bộ test cho controller getCustomers
 * Kiểm tra lấy tất cả khách hàng với phân trang và lọc từ khóa
 * Chỉ Admin
 * Vị trí: test/controllers/customers/getCustomers.test.js
 */
const chai = require('chai');
const expect = chai.expect;
const sinon = require('sinon');
const mongoose = require('mongoose');
const Customer = require('../../../src/models/Customer');
const { getCustomers, getCustomerById, createCustomer, updateCustomer, deleteCustomer, hardDeleteCustomer } = require('../../../src/controllers/customerController');

describe('Customer Controller - getCustomers', () => {
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
    findStub = sandbox.stub(Customer, 'find').returns(mockQuery);
    countDocumentsStub = sandbox.stub(Customer, 'countDocuments');
  });

  it('should fetch all customers with pagination', async () => {
    const customers = [
      { _id: new mongoose.Types.ObjectId(), name: 'Customer 1', email: 'c1@example.com', isDeleted: false },
      { _id: new mongoose.Types.ObjectId(), name: 'Customer 2', email: 'c2@example.com', isDeleted: false },
    ];

    countDocumentsStub.resolves(2);
    mockQuery.then.callsFake(function(onFulfilled) {
      return Promise.resolve(customers).then(onFulfilled);
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

    await getCustomers(req, res);

    expect(res.json.calledOnce).to.be.true;
    const responseData = res.json.getCall(0).args[0];
    expect(responseData.customers).to.deep.equal(customers);
    expect(responseData.page).to.equal(1);
  });

  it('should fetch customers filtered by keyword', async () => {
    const keyword = 'John';
    const customers = [
      { _id: new mongoose.Types.ObjectId(), name: 'John Doe', email: 'john@example.com', isDeleted: false },
    ];

    countDocumentsStub.resolves(1);
    mockQuery.then.callsFake(function(onFulfilled) {
      return Promise.resolve(customers).then(onFulfilled);
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

    await getCustomers(req, res);

    expect(res.json.calledOnce).to.be.true;
    const responseData = res.json.getCall(0).args[0];
    expect(responseData.customers).to.deep.equal(customers);
  });
});
