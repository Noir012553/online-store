/**
 * Bộ test cho các thao tác CRUD danh mục
 * Kiểm tra getCategoryById, createCategory, updateCategory, deleteCategory, hardDeleteCategory
 * Bao gồm validation trùng lặp và chức năng xóa mềm/cứng
 * Vị trí: test/controllers/categories/crudCategory.test.js
 */
const chai = require('chai');
const expect = chai.expect;
const sinon = require('sinon');
const mongoose = require('mongoose');
const Category = require('../../../src/models/Category');
const { getCategoryById, createCategory, updateCategory, deleteCategory, hardDeleteCategory } = require('../../../src/controllers/categoryController');

describe('Category Controller - CRUD Operations', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('getCategoryById', () => {
    let findOneStub;

    beforeEach(() => {
      findOneStub = sandbox.stub(Category, 'findOne');
    });

    it('should fetch category by ID', async () => {
      const categoryId = new mongoose.Types.ObjectId();
      const category = {
        _id: categoryId,
        name: 'Laptops',
        description: 'Laptop devices',
        isDeleted: false,
      };

      findOneStub.resolves(category);

      const req = {
        params: { id: categoryId.toString() },
      };
      const res = {
        json: sandbox.stub(),
        status: sandbox.stub().returnsThis(),
      };

      await getCategoryById(req, res);

      expect(findOneStub.calledWith({ _id: categoryId.toString(), isDeleted: false })).to.be.true;
      expect(res.json.calledWith(category)).to.be.true;
    });

    it('should return 404 if category not found', async () => {
      const categoryId = new mongoose.Types.ObjectId();
      findOneStub.resolves(null);

      const req = {
        params: { id: categoryId.toString() },
      };
      const res = {
        json: sandbox.stub(),
        status: sandbox.stub().returnsThis(),
      };

      let errorThrown = false;
      try {
        await getCategoryById(req, res);
      } catch (error) {
        errorThrown = true;
        expect(res.status.calledWith(404)).to.be.true;
      }
      expect(errorThrown).to.be.true;
    });
  });

  describe('createCategory', () => {
    let findOneStub, saveStub;

    beforeEach(() => {
      findOneStub = sandbox.stub(Category, 'findOne');
      saveStub = sandbox.stub(Category.prototype, 'save');
    });

    it('should create a new category', async () => {
      findOneStub.resolves(null);

      const categoryData = {
        name: 'Tablets',
        description: 'Tablet devices',
      };

      const createdCategory = { _id: new mongoose.Types.ObjectId(), ...categoryData };
      saveStub.resolves(createdCategory);

      const req = {
        body: categoryData,
      };
      const res = {
        status: sandbox.stub().returnsThis(),
        json: sandbox.stub(),
      };

      await createCategory(req, res);

      expect(res.status.calledWith(201)).to.be.true;
      expect(res.json.calledOnce).to.be.true;
    });

    it('should return 400 if category already exists', async () => {
      const existingCategory = {
        _id: new mongoose.Types.ObjectId(),
        name: 'Laptops',
      };

      findOneStub.resolves(existingCategory);

      const req = {
        body: {
          name: 'Laptops',
          description: 'Laptop devices',
        },
      };
      const res = {
        status: sandbox.stub().returnsThis(),
        json: sandbox.stub(),
      };

      let errorThrown = false;
      try {
        await createCategory(req, res);
      } catch (error) {
        errorThrown = true;
        expect(res.status.calledWith(400)).to.be.true;
      }
      expect(errorThrown).to.be.true;
    });
  });

  describe('updateCategory', () => {
    let findByIdStub;

    beforeEach(() => {
      findByIdStub = sandbox.stub(Category, 'findById');
    });

    it('should update a category', async () => {
      const categoryId = new mongoose.Types.ObjectId();
      const category = {
        _id: categoryId,
        name: 'Old Name',
        description: 'Old description',
        save: sandbox.stub().resolvesThis(),
      };

      findByIdStub.resolves(category);

      const req = {
        params: { id: categoryId.toString() },
        body: {
          name: 'New Name',
          description: 'New description',
        },
      };
      const res = {
        json: sandbox.stub(),
        status: sandbox.stub().returnsThis(),
      };

      await updateCategory(req, res);

      expect(category.name).to.equal('New Name');
      expect(category.description).to.equal('New description');
      expect(category.save.calledOnce).to.be.true;
      expect(res.json.calledOnce).to.be.true;
    });

    it('should return 404 if category not found for update', async () => {
      const categoryId = new mongoose.Types.ObjectId();
      findByIdStub.resolves(null);

      const req = {
        params: { id: categoryId.toString() },
        body: { name: 'New Name' },
      };
      const res = {
        json: sandbox.stub(),
        status: sandbox.stub().returnsThis(),
      };

      let errorThrown = false;
      try {
        await updateCategory(req, res);
      } catch (error) {
        errorThrown = true;
        expect(res.status.calledWith(404)).to.be.true;
      }
      expect(errorThrown).to.be.true;
    });
  });

  describe('deleteCategory (soft delete)', () => {
    let findByIdStub;

    beforeEach(() => {
      findByIdStub = sandbox.stub(Category, 'findById');
    });

    it('should soft delete a category', async () => {
      const categoryId = new mongoose.Types.ObjectId();
      const category = {
        _id: categoryId,
        isDeleted: false,
        save: sandbox.stub().resolvesThis(),
      };

      findByIdStub.resolves(category);

      const req = {
        params: { id: categoryId.toString() },
      };
      const res = {
        json: sandbox.stub(),
        status: sandbox.stub().returnsThis(),
      };

      await deleteCategory(req, res);

      expect(category.isDeleted).to.be.true;
      expect(category.save.calledOnce).to.be.true;
      expect(res.json.calledWith({ message: 'Category removed' })).to.be.true;
    });

    it('should return 404 if category not found for deletion', async () => {
      const categoryId = new mongoose.Types.ObjectId();
      findByIdStub.resolves(null);

      const req = {
        params: { id: categoryId.toString() },
      };
      const res = {
        json: sandbox.stub(),
        status: sandbox.stub().returnsThis(),
      };

      let errorThrown = false;
      try {
        await deleteCategory(req, res);
      } catch (error) {
        errorThrown = true;
        expect(res.status.calledWith(404)).to.be.true;
      }
      expect(errorThrown).to.be.true;
    });
  });

  describe('hardDeleteCategory', () => {
    let findByIdStub;

    beforeEach(() => {
      findByIdStub = sandbox.stub(Category, 'findById');
    });

    it('should hard delete a category', async () => {
      const categoryId = new mongoose.Types.ObjectId();
      const category = {
        _id: categoryId,
        deleteOne: sandbox.stub().resolves(),
      };

      findByIdStub.resolves(category);

      const req = {
        params: { id: categoryId.toString() },
      };
      const res = {
        json: sandbox.stub(),
        status: sandbox.stub().returnsThis(),
      };

      await hardDeleteCategory(req, res);

      expect(category.deleteOne.calledOnce).to.be.true;
      expect(res.json.calledWith({ message: 'Category permanently removed' })).to.be.true;
    });

    it('should return 404 if category not found for hard delete', async () => {
      const categoryId = new mongoose.Types.ObjectId();
      findByIdStub.resolves(null);

      const req = {
        params: { id: categoryId.toString() },
      };
      const res = {
        json: sandbox.stub(),
        status: sandbox.stub().returnsThis(),
      };

      let errorThrown = false;
      try {
        await hardDeleteCategory(req, res);
      } catch (error) {
        errorThrown = true;
        expect(res.status.calledWith(404)).to.be.true;
      }
      expect(errorThrown).to.be.true;
    });
  });
});
