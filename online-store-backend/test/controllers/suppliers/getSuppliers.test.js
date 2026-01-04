/**
 * Bộ test cho controller getSuppliers
 * Kiểm tra lấy tất cả nhà cung cấp với phân trang và tìm kiếm từ khóa
 * Chỉ Admin
 * Vị trí: test/controllers/suppliers/getSuppliers.test.js
 */
const chai = require('chai');
const expect = chai.expect;
const sinon = require('sinon');
const mongoose = require('mongoose');
const Supplier = require('../../../src/models/Supplier');
const { getSuppliers } = require('../../../src/controllers/supplierController');

describe('Supplier Controller - getSuppliers', () => {
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
    findStub = sandbox.stub(Supplier, 'find').returns(mockQuery);
    countDocumentsStub = sandbox.stub(Supplier, 'countDocuments');
  });

  it('should fetch all suppliers with pagination', async () => {
    const suppliers = [
      { _id: new mongoose.Types.ObjectId(), name: 'Supplier 1', email: 's1@example.com', isDeleted: false },
      { _id: new mongoose.Types.ObjectId(), name: 'Supplier 2', email: 's2@example.com', isDeleted: false },
    ];

    countDocumentsStub.resolves(2);
    mockQuery.then.callsFake(function(onFulfilled) {
      return Promise.resolve(suppliers).then(onFulfilled);
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

    await getSuppliers(req, res);

    expect(res.json.calledOnce).to.be.true;
    const responseData = res.json.getCall(0).args[0];
    expect(responseData.suppliers).to.deep.equal(suppliers);
    expect(responseData.page).to.equal(1);
  });

  it('should fetch suppliers filtered by keyword', async () => {
    const keyword = 'Dell';
    const suppliers = [
      { _id: new mongoose.Types.ObjectId(), name: 'Dell Inc', email: 'dell@example.com', isDeleted: false },
    ];

    countDocumentsStub.resolves(1);
    mockQuery.then.callsFake(function(onFulfilled) {
      return Promise.resolve(suppliers).then(onFulfilled);
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

    await getSuppliers(req, res);

    expect(res.json.calledOnce).to.be.true;
    const responseData = res.json.getCall(0).args[0];
    expect(responseData.suppliers).to.deep.equal(suppliers);
  });
});
