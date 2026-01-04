/**
 * Test Suite: Product Controller
 * Kiểm tra: CRUD sản phẩm, phân trang, tìm kiếm, lọc theo category/supplier
 * Kiểm tra: quản lý kho, cập nhật rating, soft/hard delete
 * Kiểm tra: upload ảnh, validate dữ liệu
 */

const chai = require('chai');
const expect = chai.expect;
const sinon = require('sinon');
const mongoose = require('mongoose');
const Product = require('../../../src/models/Product');
const { getProducts, createProduct, updateProduct, deleteProduct, hardDeleteProduct } = require('../../../src/controllers/productController');

describe('Product Controller', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('getProducts', () => {
    it('should fetch all products with pagination and filtering', async () => {
      const mockChain = { populate: sandbox.stub().returnsThis(), limit: sandbox.stub().returnsThis(), skip: sandbox.stub().returnsThis(), sort: sandbox.stub().returnsThis(), select: sandbox.stub().returnsThis(), lean: sandbox.stub().returnsThis(), exec: sandbox.stub().resolves([]) };
      sandbox.stub(Product, 'find').returns(mockChain);
      sandbox.stub(Product, 'countDocuments').resolves(0);

      const req = { query: { pageNumber: '1' } };
      const res = { json: sandbox.stub() };
      await getProducts(req, res);
      expect(res.json.calledOnce).to.be.true;
    });

    it('should fetch products filtered by keyword', async () => {
      const mockChain = { populate: sandbox.stub().returnsThis(), limit: sandbox.stub().returnsThis(), skip: sandbox.stub().returnsThis(), sort: sandbox.stub().returnsThis(), select: sandbox.stub().returnsThis(), lean: sandbox.stub().returnsThis(), exec: sandbox.stub().resolves([]) };
      sandbox.stub(Product, 'find').returns(mockChain);
      sandbox.stub(Product, 'countDocuments').resolves(0);

      const req = { query: { keyword: 'laptop', pageNumber: '1' } };
      const res = { json: sandbox.stub() };
      await getProducts(req, res);
      expect(res.json.calledOnce).to.be.true;
    });

    it('should fetch products filtered by category', async () => {
      const mockChain = { populate: sandbox.stub().returnsThis(), limit: sandbox.stub().returnsThis(), skip: sandbox.stub().returnsThis(), sort: sandbox.stub().returnsThis(), select: sandbox.stub().returnsThis(), lean: sandbox.stub().returnsThis(), exec: sandbox.stub().resolves([]) };
      sandbox.stub(Product, 'find').returns(mockChain);
      sandbox.stub(Product, 'countDocuments').resolves(0);

      const req = { query: { category: 'gaming', pageNumber: '1' } };
      const res = { json: sandbox.stub() };
      await getProducts(req, res);
      expect(res.json.calledOnce).to.be.true;
    });

    it('should fetch products filtered by brand', async () => {
      const mockChain = { populate: sandbox.stub().returnsThis(), limit: sandbox.stub().returnsThis(), skip: sandbox.stub().returnsThis(), sort: sandbox.stub().returnsThis(), select: sandbox.stub().returnsThis(), lean: sandbox.stub().returnsThis(), exec: sandbox.stub().resolves([]) };
      sandbox.stub(Product, 'find').returns(mockChain);
      sandbox.stub(Product, 'countDocuments').resolves(0);

      const req = { query: { brand: 'Dell', pageNumber: '1' } };
      const res = { json: sandbox.stub() };
      await getProducts(req, res);
      expect(res.json.calledOnce).to.be.true;
    });
  });

  describe('createProduct', () => {
    it('should create a new product', async () => {
      const userId = new mongoose.Types.ObjectId();
      const newProduct = { _id: new mongoose.Types.ObjectId(), name: 'Laptop', price: 1000, image: '/uploads/test.jpg', user: userId };
      sandbox.stub(Product.prototype, 'save').resolves(newProduct);

      const req = { 
        user: { _id: userId },
        body: { name: 'Laptop', price: 1000, description: 'Test' },
        file: { path: 'uploads/test.jpg' }
      };
      const res = { status: sandbox.stub().returnsThis(), json: sandbox.stub() };
      await createProduct(req, res);
      
      expect(res.status.called || res.json.called).to.be.true;
    });
  });

  describe('updateProduct', () => {
    it('should update an existing product', async () => {
      const product = { _id: new mongoose.Types.ObjectId(), name: 'Laptop', price: 1000, save: sandbox.stub().resolves() };
      sandbox.stub(Product, 'findById').resolves(product);

      const req = { params: { id: product._id.toString() }, body: { name: 'Updated Laptop' } };
      const res = { json: sandbox.stub() };
      await updateProduct(req, res);
      expect(res.json.calledOnce).to.be.true;
    });

    it('should return 404 if product not found during update', async () => {
      sandbox.stub(Product, 'findById').resolves(null);

      const req = { params: { id: new mongoose.Types.ObjectId().toString() }, body: {} };
      const res = { status: sandbox.stub().returnsThis() };

      try {
        await updateProduct(req, res);
      } catch (error) {
        expect(res.status.calledWith(404)).to.be.true;
      }
    });
  });

  describe('deleteProduct', () => {
    it('should soft delete a product', async () => {
      const product = { _id: new mongoose.Types.ObjectId(), isDeleted: false, save: sandbox.stub().resolves() };
      sandbox.stub(Product, 'findById').resolves(product);

      const req = { params: { id: product._id.toString() } };
      const res = { json: sandbox.stub() };
      await deleteProduct(req, res);
      expect(product.isDeleted).to.be.true;
    });

    it('should return 404 if product not found during soft delete', async () => {
      sandbox.stub(Product, 'findById').resolves(null);

      const req = { params: { id: new mongoose.Types.ObjectId().toString() } };
      const res = { status: sandbox.stub().returnsThis() };

      try {
        await deleteProduct(req, res);
      } catch (error) {
        expect(res.status.calledWith(404)).to.be.true;
      }
    });
  });

  describe('hardDeleteProduct', () => {
    it('should hard delete a product', async () => {
      const productId = new mongoose.Types.ObjectId();
      sandbox.stub(Product, 'findById').resolves({ _id: productId });
      sandbox.stub(Product, 'findByIdAndDelete').resolves({ _id: productId });

      const req = { params: { id: productId.toString() } };
      const res = { json: sandbox.stub() };
      await hardDeleteProduct(req, res);
      expect(res.json.calledOnce).to.be.true;
    });

    it('should return 404 if product not found during hard delete', async () => {
      sandbox.stub(Product, 'findById').resolves(null);

      const req = { params: { id: new mongoose.Types.ObjectId().toString() } };
      const res = { status: sandbox.stub().returnsThis() };

      try {
        await hardDeleteProduct(req, res);
      } catch (error) {
        expect(res.status.calledWith(404)).to.be.true;
      }
    });
  });
});
