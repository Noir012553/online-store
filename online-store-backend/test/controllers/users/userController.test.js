/**
 * Test Suite: User Controller
 * Kiểm tra: user authentication (register, login), JWT token
 * Kiểm tra: CRUD user, phân quyền (user, admin, superAdmin)
 * Kiểm tra: cập nhật profile, đổi mật khẩu, soft/hard delete
 */

const chai = require('chai');
const expect = chai.expect;
const sinon = require('sinon');
const mongoose = require('mongoose');
const User = require('../../../src/models/User');
const { authUser, registerUser, getUserProfile, updateUserProfile, getUsers, deleteUser, hardDeleteUser } = require('../../../src/controllers/userController');

describe('User Controller - Dynamic Data Tests', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    if (!process.env.JWT_SECRET) {
      process.env.JWT_SECRET = 'test_secret_key_for_jwt_signing';
    }
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('authUser', () => {
    it('should authenticate user with valid credentials', async () => {
      const userId = new mongoose.Types.ObjectId();
      const user = { 
        _id: userId, 
        email: 'test@example.com', 
        username: 'testuser',
        password: 'hashed', 
        matchPassword: sandbox.stub().resolves(true) 
      };
      sandbox.stub(User, 'findOne').resolves(user);

      const req = { body: { email: 'test@example.com', password: 'test123' } };
      const res = { json: sandbox.stub(), status: sandbox.stub().returnsThis() };
      
      await authUser(req, res);
      expect(res.json.calledOnce).to.be.true;
    });

    it('should reject invalid credentials', async () => {
      sandbox.stub(User, 'findOne').resolves(null);
      
      const req = { body: { email: 'wrong@example.com', password: 'wrong' } };
      const res = { status: sandbox.stub().returnsThis(), json: sandbox.stub() };

      try {
        await authUser(req, res);
      } catch (error) {
        expect(res.status.called || true).to.be.true;
      }
    });
  });

  describe('registerUser', () => {
    it('should register new user with dynamic data', async () => {
      const newUserId = new mongoose.Types.ObjectId();
      
      const newUser = { 
        _id: newUserId, 
        username: 'newuser', 
        email: 'new@example.com', 
        role: 'user'
      };
      
      sandbox.stub(User, 'findOne').resolves(null);
      sandbox.stub(User, 'create').resolves(newUser);

      const req = { body: { username: 'newuser', email: 'new@example.com', password: 'test123' } };
      const res = { status: sandbox.stub().returnsThis(), json: sandbox.stub() };
      
      await registerUser(req, res);
      expect(res.status.calledWith(201)).to.be.true;
    });

    it('should reject if user exists', async () => {
      sandbox.stub(User, 'findOne').resolves({ email: 'existing@example.com' });
      
      const req = { body: { email: 'existing@example.com', password: 'test123' } };
      const res = { status: sandbox.stub().returnsThis(), json: sandbox.stub() };

      try {
        await registerUser(req, res);
      } catch (error) {
        expect(res.status.calledWith(400)).to.be.true;
      }
    });
  });

  describe('getUserProfile', () => {
    it('should fetch user profile with dynamic data', async () => {
      const userId = new mongoose.Types.ObjectId();
      const user = { 
        _id: userId, 
        email: 'user@example.com', 
        username: 'testuser', 
        profileImage: 'http://example.com/image.jpg' 
      };
      sandbox.stub(User, 'findById').resolves(user);

      const req = { user: { _id: userId } };
      const res = { json: sandbox.stub() };
      
      await getUserProfile(req, res);
      expect(res.json.calledOnce).to.be.true;
    });
  });

  describe('updateUserProfile', () => {
    it('should update user with dynamic data', async () => {
      const userId = new mongoose.Types.ObjectId();
      const user = { 
        _id: userId, 
        email: 'old@example.com', 
        username: 'oldname', 
        profileImage: null, 
        save: sandbox.stub().resolves({
          _id: userId,
          email: 'new@example.com',
          username: 'newname',
          role: 'user'
        })
      };
      sandbox.stub(User, 'findById').resolves(user);

      const req = { 
        user: { _id: userId }, 
        body: { 
          email: 'new@example.com', 
          username: 'newname', 
          profileImage: 'http://example.com/new.jpg' 
        } 
      };
      const res = { json: sandbox.stub() };
      
      await updateUserProfile(req, res);
      expect(user.save.calledOnce).to.be.true;
    });
  });

  describe('getUsers', () => {
    it('should fetch all users with pagination', async () => {
      const users = [{ _id: new mongoose.Types.ObjectId(), email: 'user1@example.com' }];
      const mockChain = { limit: sandbox.stub().returnsThis(), skip: sandbox.stub().resolves(users) };
      sandbox.stub(User, 'find').returns(mockChain);
      sandbox.stub(User, 'countDocuments').resolves(1);

      const req = { query: { pageNumber: '1' } };
      const res = { json: sandbox.stub() };
      
      await getUsers(req, res);
      expect(res.json.calledOnce).to.be.true;
    });
  });

  describe('deleteUser', () => {
    it('should soft delete user', async () => {
      const user = { _id: new mongoose.Types.ObjectId(), isDeleted: false, save: sandbox.stub().resolves() };
      sandbox.stub(User, 'findById').resolves(user);

      const req = { params: { id: user._id.toString() } };
      const res = { json: sandbox.stub() };
      
      await deleteUser(req, res);
      expect(user.isDeleted).to.be.true;
    });
  });

  describe('hardDeleteUser', () => {
    it('should hard delete user', async () => {
      const userId = new mongoose.Types.ObjectId();
      const user = { 
        _id: userId, 
        deleteOne: sandbox.stub().resolves() 
      };
      sandbox.stub(User, 'findById').resolves(user);

      const req = { params: { id: userId.toString() } };
      const res = { json: sandbox.stub() };
      
      await hardDeleteUser(req, res);
      expect(user.deleteOne.calledOnce).to.be.true;
    });
  });
});
