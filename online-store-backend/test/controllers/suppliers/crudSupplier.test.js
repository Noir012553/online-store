/**
 * Bộ test cho các thao tác CRUD nhà cung cấp
 * Kiểm tra getSupplierById, createSupplier, updateSupplier, deleteSupplier, hardDeleteSupplier
 * Tất cả thao tác có xử lý lỗi và validation
 * Vị trí: test/controllers/suppliers/crudSupplier.test.js
 */
const chai = require('chai');
const expect = chai.expect;
const sinon = require('sinon');
const mongoose = require('mongoose');
const Supplier = require('../../../src/models/Supplier');
const {
  getSupplierById,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  hardDeleteSupplier,
} = require('../../../src/controllers/supplierController');

describe('Supplier Controller - CRUD Operations', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('getSupplierById', () => {
    let findOneStub;

    beforeEach(() => {
      findOneStub = sandbox.stub(Supplier, 'findOne');
    });

    it('should fetch supplier by ID', async () => {
      const supplierId = new mongoose.Types.ObjectId();
      const supplier = {
        _id: supplierId,
        name: 'Tech Supplies Co',
        email: 'tech@example.com',
        contactPerson: 'John Smith',
        phone: '0123456789',
        isDeleted: false,
      };

      findOneStub.resolves(supplier);

      const req = {
        params: { id: supplierId.toString() },
      };
      const res = {
        json: sandbox.stub(),
        status: sandbox.stub().returnsThis(),
      };

      await getSupplierById(req, res);

      expect(findOneStub.calledWith({ _id: supplierId.toString(), isDeleted: false })).to.be.true;
      expect(res.json.calledWith(supplier)).to.be.true;
    });

    it('should return 404 if supplier not found', async () => {
      const supplierId = new mongoose.Types.ObjectId();
      findOneStub.resolves(null);

      const req = {
        params: { id: supplierId.toString() },
      };
      const res = {
        json: sandbox.stub(),
        status: sandbox.stub().returnsThis(),
      };

      let errorThrown = false;
      try {
        await getSupplierById(req, res);
      } catch (error) {
        errorThrown = true;
        expect(res.status.calledWith(404)).to.be.true;
      }
      expect(errorThrown).to.be.true;
    });
  });

  describe('createSupplier', () => {
    let findOneStub, saveStub;

    beforeEach(() => {
      findOneStub = sandbox.stub(Supplier, 'findOne');
      saveStub = sandbox.stub(Supplier.prototype, 'save');
    });

    it('should create a new supplier', async () => {
      findOneStub.resolves(null);

      const supplierData = {
        name: 'New Supplier',
        contactPerson: 'Jane Doe',
        phone: '9876543210',
        email: 'newsupplier@example.com',
        address: '789 Market St',
        description: 'A new supplier company',
      };

      const createdSupplier = { _id: new mongoose.Types.ObjectId(), ...supplierData };
      saveStub.resolves(createdSupplier);

      const req = {
        body: supplierData,
      };
      const res = {
        status: sandbox.stub().returnsThis(),
        json: sandbox.stub(),
      };

      await createSupplier(req, res);

      expect(res.status.calledWith(201)).to.be.true;
      expect(res.json.calledOnce).to.be.true;
    });

    it('should return 400 if supplier already exists', async () => {
      const existingSupplier = {
        _id: new mongoose.Types.ObjectId(),
        email: 'existing@example.com',
      };

      findOneStub.resolves(existingSupplier);

      const req = {
        body: {
          name: 'Existing Supplier',
          email: 'existing@example.com',
          contactPerson: 'Contact',
          phone: '1234567890',
          address: 'Address',
        },
      };
      const res = {
        status: sandbox.stub().returnsThis(),
        json: sandbox.stub(),
      };

      let errorThrown = false;
      try {
        await createSupplier(req, res);
      } catch (error) {
        errorThrown = true;
        expect(res.status.calledWith(400)).to.be.true;
      }
      expect(errorThrown).to.be.true;
    });
  });

  describe('updateSupplier', () => {
    let findByIdStub;

    beforeEach(() => {
      findByIdStub = sandbox.stub(Supplier, 'findById');
    });

    it('should update a supplier', async () => {
      const supplierId = new mongoose.Types.ObjectId();
      const supplier = {
        _id: supplierId,
        name: 'Old Name',
        email: 'old@example.com',
        contactPerson: 'Old Contact',
        phone: '0000000000',
        address: 'Old Address',
        description: 'Old description',
        save: sandbox.stub().resolvesThis(),
      };

      findByIdStub.resolves(supplier);

      const req = {
        params: { id: supplierId.toString() },
        body: {
          name: 'Updated Name',
          email: 'updated@example.com',
          contactPerson: 'New Contact',
          phone: '9999999999',
          address: 'New Address',
          description: 'New description',
        },
      };
      const res = {
        json: sandbox.stub(),
        status: sandbox.stub().returnsThis(),
      };

      await updateSupplier(req, res);

      expect(supplier.name).to.equal('Updated Name');
      expect(supplier.email).to.equal('updated@example.com');
      expect(supplier.save.calledOnce).to.be.true;
      expect(res.json.calledOnce).to.be.true;
    });

    it('should return 404 if supplier not found for update', async () => {
      const supplierId = new mongoose.Types.ObjectId();
      findByIdStub.resolves(null);

      const req = {
        params: { id: supplierId.toString() },
        body: { name: 'Updated Name' },
      };
      const res = {
        json: sandbox.stub(),
        status: sandbox.stub().returnsThis(),
      };

      let errorThrown = false;
      try {
        await updateSupplier(req, res);
      } catch (error) {
        errorThrown = true;
        expect(res.status.calledWith(404)).to.be.true;
      }
      expect(errorThrown).to.be.true;
    });
  });

  describe('deleteSupplier (soft delete)', () => {
    let findByIdStub;

    beforeEach(() => {
      findByIdStub = sandbox.stub(Supplier, 'findById');
    });

    it('should soft delete a supplier', async () => {
      const supplierId = new mongoose.Types.ObjectId();
      const supplier = {
        _id: supplierId,
        isDeleted: false,
        save: sandbox.stub().resolvesThis(),
      };

      findByIdStub.resolves(supplier);

      const req = {
        params: { id: supplierId.toString() },
      };
      const res = {
        json: sandbox.stub(),
        status: sandbox.stub().returnsThis(),
      };

      await deleteSupplier(req, res);

      expect(supplier.isDeleted).to.be.true;
      expect(supplier.save.calledOnce).to.be.true;
      expect(res.json.calledWith({ message: 'Supplier removed' })).to.be.true;
    });

    it('should return 404 if supplier not found for deletion', async () => {
      const supplierId = new mongoose.Types.ObjectId();
      findByIdStub.resolves(null);

      const req = {
        params: { id: supplierId.toString() },
      };
      const res = {
        json: sandbox.stub(),
        status: sandbox.stub().returnsThis(),
      };

      let errorThrown = false;
      try {
        await deleteSupplier(req, res);
      } catch (error) {
        errorThrown = true;
        expect(res.status.calledWith(404)).to.be.true;
      }
      expect(errorThrown).to.be.true;
    });
  });

  describe('hardDeleteSupplier', () => {
    let findByIdStub;

    beforeEach(() => {
      findByIdStub = sandbox.stub(Supplier, 'findById');
    });

    it('should hard delete a supplier', async () => {
      const supplierId = new mongoose.Types.ObjectId();
      const supplier = {
        _id: supplierId,
        deleteOne: sandbox.stub().resolves(),
      };

      findByIdStub.resolves(supplier);

      const req = {
        params: { id: supplierId.toString() },
      };
      const res = {
        json: sandbox.stub(),
        status: sandbox.stub().returnsThis(),
      };

      await hardDeleteSupplier(req, res);

      expect(supplier.deleteOne.calledOnce).to.be.true;
      expect(res.json.calledWith({ message: 'Supplier permanently removed' })).to.be.true;
    });

    it('should return 404 if supplier not found for hard delete', async () => {
      const supplierId = new mongoose.Types.ObjectId();
      findByIdStub.resolves(null);

      const req = {
        params: { id: supplierId.toString() },
      };
      const res = {
        json: sandbox.stub(),
        status: sandbox.stub().returnsThis(),
      };

      let errorThrown = false;
      try {
        await hardDeleteSupplier(req, res);
      } catch (error) {
        errorThrown = true;
        expect(res.status.calledWith(404)).to.be.true;
      }
      expect(errorThrown).to.be.true;
    });
  });
});
