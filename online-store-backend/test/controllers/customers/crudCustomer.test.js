/**
 * Bộ test cho các thao tác CRUD khách hàng
 * Kiểm tra getCustomerById, createCustomer, updateCustomer, deleteCustomer, hardDeleteCustomer
 * Bao gồm validation cho khách hàng duy nhất và xóa mềm/cứng
 * Vị trí: test/controllers/customers/crudCustomer.test.js
 */
const chai = require('chai');
const expect = chai.expect;
const sinon = require('sinon');
const mongoose = require('mongoose');
const Customer = require('../../../src/models/Customer');
const { getCustomerById, createCustomer, updateCustomer, deleteCustomer, hardDeleteCustomer } = require('../../../src/controllers/customerController');

describe('Customer Controller - CRUD Operations', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('getCustomerById', () => {
    let findOneStub;

    beforeEach(() => {
      findOneStub = sandbox.stub(Customer, 'findOne');
    });

    it('should fetch customer by ID', async () => {
      const customerId = new mongoose.Types.ObjectId();
      const customer = {
        _id: customerId,
        name: 'John Doe',
        email: 'john@example.com',
        isDeleted: false,
      };

      findOneStub.resolves(customer);

      const req = {
        params: { id: customerId.toString() },
      };
      const res = {
        json: sandbox.stub(),
        status: sandbox.stub().returnsThis(),
      };

      await getCustomerById(req, res);

      expect(findOneStub.calledWith({ _id: customerId.toString(), isDeleted: false })).to.be.true;
      expect(res.json.calledWith(customer)).to.be.true;
    });

    it('should return 404 if customer not found', async () => {
      const customerId = new mongoose.Types.ObjectId();
      findOneStub.resolves(null);

      const req = {
        params: { id: customerId.toString() },
      };
      const res = {
        json: sandbox.stub(),
        status: sandbox.stub().returnsThis(),
      };

      let errorThrown = false;
      try {
        await getCustomerById(req, res);
      } catch (error) {
        errorThrown = true;
        expect(res.status.calledWith(404)).to.be.true;
      }
      expect(errorThrown).to.be.true;
    });
  });

  describe('createCustomer', () => {
    let findOneStub, saveStub;

    beforeEach(() => {
      findOneStub = sandbox.stub(Customer, 'findOne');
      saveStub = sandbox.stub(Customer.prototype, 'save');
    });

    it('should create a new customer', async () => {
      findOneStub.resolves(null);

      const customerData = {
        name: 'Jane Doe',
        email: 'jane@example.com',
        phone: '0123456789',
      };

      const createdCustomer = { _id: new mongoose.Types.ObjectId(), ...customerData };
      saveStub.resolves(createdCustomer);

      const req = {
        body: customerData,
      };
      const res = {
        status: sandbox.stub().returnsThis(),
        json: sandbox.stub(),
      };

      await createCustomer(req, res);

      expect(res.status.calledWith(201)).to.be.true;
      expect(res.json.calledOnce).to.be.true;
    });

    it('should return 400 if customer already exists', async () => {
      const existingCustomer = {
        _id: new mongoose.Types.ObjectId(),
        email: 'existing@example.com',
      };

      findOneStub.resolves(existingCustomer);

      const req = {
        body: {
          name: 'Jane Doe',
          email: 'existing@example.com',
          phone: '0123456789',
        },
      };
      const res = {
        status: sandbox.stub().returnsThis(),
        json: sandbox.stub(),
      };

      let errorThrown = false;
      try {
        await createCustomer(req, res);
      } catch (error) {
        errorThrown = true;
        expect(res.status.calledWith(400)).to.be.true;
      }
      expect(errorThrown).to.be.true;
    });
  });

  describe('updateCustomer', () => {
    let findByIdStub;

    beforeEach(() => {
      findByIdStub = sandbox.stub(Customer, 'findById');
    });

    it('should update a customer', async () => {
      const customerId = new mongoose.Types.ObjectId();
      const customer = {
        _id: customerId,
        name: 'Old Name',
        email: 'old@example.com',
        phone: '0000000000',
        save: sandbox.stub().resolvesThis(),
      };

      findByIdStub.resolves(customer);

      const req = {
        params: { id: customerId.toString() },
        body: {
          name: 'New Name',
          email: 'new@example.com',
          phone: '9999999999',
        },
      };
      const res = {
        json: sandbox.stub(),
        status: sandbox.stub().returnsThis(),
      };

      await updateCustomer(req, res);

      expect(customer.name).to.equal('New Name');
      expect(customer.email).to.equal('new@example.com');
      expect(customer.save.calledOnce).to.be.true;
      expect(res.json.calledOnce).to.be.true;
    });

    it('should return 404 if customer not found for update', async () => {
      const customerId = new mongoose.Types.ObjectId();
      findByIdStub.resolves(null);

      const req = {
        params: { id: customerId.toString() },
        body: { name: 'New Name' },
      };
      const res = {
        json: sandbox.stub(),
        status: sandbox.stub().returnsThis(),
      };

      let errorThrown = false;
      try {
        await updateCustomer(req, res);
      } catch (error) {
        errorThrown = true;
        expect(res.status.calledWith(404)).to.be.true;
      }
      expect(errorThrown).to.be.true;
    });
  });

  describe('deleteCustomer (soft delete)', () => {
    let findByIdStub;

    beforeEach(() => {
      findByIdStub = sandbox.stub(Customer, 'findById');
    });

    it('should soft delete a customer', async () => {
      const customerId = new mongoose.Types.ObjectId();
      const customer = {
        _id: customerId,
        isDeleted: false,
        save: sandbox.stub().resolvesThis(),
      };

      findByIdStub.resolves(customer);

      const req = {
        params: { id: customerId.toString() },
      };
      const res = {
        json: sandbox.stub(),
        status: sandbox.stub().returnsThis(),
      };

      await deleteCustomer(req, res);

      expect(customer.isDeleted).to.be.true;
      expect(customer.save.calledOnce).to.be.true;
      expect(res.json.calledWith({ message: 'Customer removed' })).to.be.true;
    });

    it('should return 404 if customer not found for deletion', async () => {
      const customerId = new mongoose.Types.ObjectId();
      findByIdStub.resolves(null);

      const req = {
        params: { id: customerId.toString() },
      };
      const res = {
        json: sandbox.stub(),
        status: sandbox.stub().returnsThis(),
      };

      let errorThrown = false;
      try {
        await deleteCustomer(req, res);
      } catch (error) {
        errorThrown = true;
        expect(res.status.calledWith(404)).to.be.true;
      }
      expect(errorThrown).to.be.true;
    });
  });

  describe('hardDeleteCustomer', () => {
    let findByIdStub;

    beforeEach(() => {
      findByIdStub = sandbox.stub(Customer, 'findById');
    });

    it('should hard delete a customer', async () => {
      const customerId = new mongoose.Types.ObjectId();
      const customer = {
        _id: customerId,
        deleteOne: sandbox.stub().resolves(),
      };

      findByIdStub.resolves(customer);

      const req = {
        params: { id: customerId.toString() },
      };
      const res = {
        json: sandbox.stub(),
        status: sandbox.stub().returnsThis(),
      };

      await hardDeleteCustomer(req, res);

      expect(customer.deleteOne.calledOnce).to.be.true;
      expect(res.json.calledWith({ message: 'Customer permanently removed' })).to.be.true;
    });

    it('should return 404 if customer not found for hard delete', async () => {
      const customerId = new mongoose.Types.ObjectId();
      findByIdStub.resolves(null);

      const req = {
        params: { id: customerId.toString() },
      };
      const res = {
        json: sandbox.stub(),
        status: sandbox.stub().returnsThis(),
      };

      let errorThrown = false;
      try {
        await hardDeleteCustomer(req, res);
      } catch (error) {
        errorThrown = true;
        expect(res.status.calledWith(404)).to.be.true;
      }
      expect(errorThrown).to.be.true;
    });
  });
});
