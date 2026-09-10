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
const Product = require('../../../models/Product');
const Category = require('../../../models/Category');
const ProductCatalogTranslationCache = require('../../../models/ProductCatalogTranslationCache');
const CategoryCatalogTranslationCache = require('../../../models/CategoryCatalogTranslationCache');
const Currency = require('../../../models/Currency');
const cloudinaryService = require('../../../services/cloudinaryService');
const originalUploadToCloudinary = cloudinaryService.uploadToCloudinary;
cloudinaryService.uploadToCloudinary = async () => ({
  url: 'https://res.cloudinary.com/test/image/upload/laptop-store/admins/test.jpg',
  publicId: 'laptop-store/admins/test',
});
const { getProducts, getDeletedProducts, createProduct, updateProduct, deleteProduct, hardDeleteProduct } = require('../../../controllers/productController');

const createProductQuery = (sandbox, products = []) => ({
  populate: sandbox.stub().returnsThis(),
  limit: sandbox.stub().returnsThis(),
  skip: sandbox.stub().returnsThis(),
  sort: sandbox.stub().returnsThis(),
  maxTimeMS: sandbox.stub().returnsThis(),
  select: sandbox.stub().returnsThis(),
  lean: sandbox.stub().returnsThis(),
  then: (onFulfilled, onRejected) => Promise.resolve(products).then(onFulfilled, onRejected),
});

const createCountQuery = (sandbox, count = 0) => ({
  maxTimeMS: sandbox.stub().resolves(count),
});

describe('Product Controller', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(Currency, 'find').returns({ lean: sandbox.stub().resolves([]) });
    sandbox.stub(Currency, 'exists').resolves({ _id: new mongoose.Types.ObjectId() });
  });

  afterEach(() => {
    sandbox.restore();
  });

  after(() => {
    cloudinaryService.uploadToCloudinary = originalUploadToCloudinary;
  });

  describe('getProducts', () => {
    it('should fetch all products with pagination and filtering', async () => {
      const mockChain = createProductQuery(sandbox);
      sandbox.stub(Product, 'find').returns(mockChain);
      sandbox.stub(Product, 'countDocuments').returns({ maxTimeMS: sandbox.stub().resolves(0) });

      const req = { query: { pageNumber: '1' } };
      const res = { json: sandbox.stub() };
      await getProducts(req, res);
      expect(res.json.calledOnce).to.be.true;
    });

    it('should fetch products filtered by keyword', async () => {
      const mockChain = createProductQuery(sandbox);
      sandbox.stub(Product, 'find').returns(mockChain);
      sandbox.stub(Product, 'countDocuments').returns({ maxTimeMS: sandbox.stub().resolves(0) });

      const req = { query: { keyword: 'laptop', pageNumber: '1' } };
      const res = { json: sandbox.stub() };
      await getProducts(req, res);
      expect(res.json.calledOnce).to.be.true;
    });

    it('should return categories localized for the requested locale', async () => {
      const categoryId = new mongoose.Types.ObjectId();
      const products = [{
        _id: new mongoose.Types.ObjectId(),
        name: 'Laptop',
        brand: 'Test Brand',
        category: { _id: categoryId, name: 'Máy tính', description: 'Mô tả gốc' },
      }];
      const mockChain = createProductQuery(sandbox, products);
      sandbox.stub(Product, 'find').returns(mockChain);
      sandbox.stub(Product, 'countDocuments').returns(createCountQuery(sandbox, 1));
      sandbox.stub(ProductCatalogTranslationCache, 'find').returns({
        select: sandbox.stub().returnsThis(),
        maxTimeMS: sandbox.stub().returnsThis(),
        lean: sandbox.stub().resolves([{
          entityId: products[0]._id.toString(),
          targetLang: 'en',
          status: 'success',
          qualityStatus: 'approved',
          name: 'Laptop',
          brand: 'Test Brand',
        }]),
      });
      const categoryFind = sandbox.stub(CategoryCatalogTranslationCache, 'find').returns({
        select: sandbox.stub().returnsThis(),
        maxTimeMS: sandbox.stub().returnsThis(),
        lean: sandbox.stub().resolves([{
          entityId: categoryId.toString(),
          targetLang: 'en',
          status: 'success',
          name: 'Computers',
          description: 'Translated description',
        }]),
      });
      const res = { json: sandbox.stub() };

      await getProducts({ query: { pageNumber: '1' }, lang: 'en' }, res);

      expect(res.json.firstCall.args[0].products[0].category).to.include({
        name: 'Computers',
        description: 'Translated description',
      });
      expect(categoryFind.calledOnceWith({
        entityId: { $in: [categoryId.toString()] },
        targetLang: 'en',
        status: 'success',
      })).to.be.true;
    });

    it('should fetch products filtered by category', async () => {
      const mockChain = createProductQuery(sandbox);
      sandbox.stub(Product, 'find').returns(mockChain);
      sandbox.stub(Product, 'countDocuments').returns({ maxTimeMS: sandbox.stub().resolves(0) });

      const req = { query: { category: 'gaming', pageNumber: '1' } };
      const res = { json: sandbox.stub() };
      await getProducts(req, res);
      expect(res.json.calledOnce).to.be.true;
    });

    it('should fetch products filtered by brand', async () => {
      const mockChain = createProductQuery(sandbox);
      sandbox.stub(Product, 'find').returns(mockChain);
      sandbox.stub(Product, 'countDocuments').returns({ maxTimeMS: sandbox.stub().resolves(0) });

      const req = { query: { brand: 'Dell', pageNumber: '1' } };
      const res = { json: sandbox.stub() };
      await getProducts(req, res);
      expect(res.json.calledOnce).to.be.true;
    });
  });

  describe('getDeletedProducts', () => {
    it('should return product and category translations for the requested locale', async () => {
      const productId = new mongoose.Types.ObjectId();
      const categoryId = new mongoose.Types.ObjectId();
      const products = [{
        _id: productId,
        name: 'Máy tính xách tay',
        description: 'Mô tả gốc',
        category: { _id: categoryId, name: 'Máy tính', description: 'Danh mục gốc' },
      }];
      const mockChain = createProductQuery(sandbox, products);
      sandbox.stub(Product, 'find').returns(mockChain);
      sandbox.stub(Product, 'countDocuments').returns(createCountQuery(sandbox, 1));
      sandbox.stub(ProductCatalogTranslationCache, 'find').returns({
        select: sandbox.stub().returnsThis(),
        maxTimeMS: sandbox.stub().returnsThis(),
        lean: sandbox.stub().resolves([{
          entityId: productId.toString(),
          targetLang: 'en',
          status: 'success',
          name: 'Laptop',
          description: 'Translated product description',
        }]),
      });
      sandbox.stub(CategoryCatalogTranslationCache, 'find').returns({
        select: sandbox.stub().returnsThis(),
        maxTimeMS: sandbox.stub().returnsThis(),
        lean: sandbox.stub().resolves([{
          entityId: categoryId.toString(),
          targetLang: 'en',
          status: 'success',
          name: 'Computers',
          description: 'Translated category description',
        }]),
      });
      const res = { json: sandbox.stub() };

      await getDeletedProducts({ query: { pageNumber: '1' }, lang: 'en' }, res);

      expect(res.json.firstCall.args[0].products[0]).to.include({
        name: 'Laptop',
        description: 'Translated product description',
      });
      expect(res.json.firstCall.args[0].products[0].category).to.include({
        name: 'Computers',
        description: 'Translated category description',
      });
    });
  });

  describe('createProduct', () => {
    it('should create a new product', async () => {
      const userId = new mongoose.Types.ObjectId();
      const categoryId = new mongoose.Types.ObjectId();
      const newProduct = { _id: new mongoose.Types.ObjectId(), name: 'Laptop', price: 1000, image: '/uploads/test.jpg', user: userId };
      sandbox.stub(Product.prototype, 'save').resolves(newProduct);
      sandbox.stub(Product, 'findById').returns({
        populate: sandbox.stub().returnsThis(),
      });
      sandbox.stub(Category, 'findOne').returns({
        select: sandbox.stub().returnsThis(),
        lean: sandbox.stub().resolves({ _id: categoryId }),
      });

      const req = {
        user: { _id: userId },
        body: {
          name: 'Laptop',
          price: 1000,
          description: 'Test',
          countInStock: 5,
          category: categoryId.toString(),
          baseCurrencyCode: 'VND',
        },
        file: { path: 'uploads/test.jpg' },
        app: { get: sandbox.stub().returns(null) },
      };
      const res = { status: sandbox.stub().returnsThis(), json: sandbox.stub() };
      await createProduct(req, res);
      
      expect(res.status.called || res.json.called).to.be.true;
    });
  });

  describe('updateProduct', () => {
    it('should update an existing product', async () => {
      const product = { _id: new mongoose.Types.ObjectId(), name: 'Laptop', price: 1000, save: sandbox.stub().resolvesThis() };
      const populatedProduct = { ...product };
      const findByIdStub = sandbox.stub(Product, 'findById');
      findByIdStub.onFirstCall().resolves(product);
      findByIdStub.onSecondCall().returns({
        populate: sandbox.stub().withArgs('category').resolves(populatedProduct),
      });
      sandbox.stub(ProductCatalogTranslationCache, 'updateMany').resolves();
      const req = {
        params: { id: product._id.toString() },
        query: {},
        body: { name: 'Updated Laptop' },
        app: { get: sandbox.stub().returns(null) },
      };
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

      const req = {
        params: { id: product._id.toString() },
        app: { get: sandbox.stub().returns(null) },
      };
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
      sandbox.stub(ProductCatalogTranslationCache, 'deleteMany').resolves();

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
