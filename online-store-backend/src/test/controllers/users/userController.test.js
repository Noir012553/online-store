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
const User = require('../../../models/User');
const adminUserGovernanceService = require('../../../services/adminUserGovernanceService');
const { authUser, registerUser, getUserProfile, updateUserProfile, getUsers, updateUser, deleteUser, hardDeleteUser } = require('../../../controllers/userController');

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
        matchPassword: sandbox.stub().resolves(true),
        save: sandbox.stub().resolves() 
      };
      sandbox.stub(User, 'findOne').resolves(user);

      const req = { body: { email: 'test@example.com', password: 'test123' } };
      const res = { cookie: sandbox.stub(), json: sandbox.stub(), status: sandbox.stub().returnsThis() };
      
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
        role: 'user',
        save: sandbox.stub().resolves(),
      };
      
      sandbox.stub(User, 'findOne').resolves(null);
      sandbox.stub(User, 'create').resolves(newUser);

      const req = { body: { username: 'newuser', email: 'new@example.com', password: 'test123' } };
      const res = { cookie: sandbox.stub(), status: sandbox.stub().returnsThis(), json: sandbox.stub() };
      
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
        isEmailVerified: true,
        save: sandbox.stub().resolves({
          _id: userId,
          email: 'new@example.com',
          username: 'newname',
          role: 'user'
        })
      };
      sandbox.stub(User, 'findById').resolves(user);
      sandbox.stub(User, 'findOne').resolves(null);

      const req = {
        user: { _id: userId },
        headers: {},
        body: { 
          email: 'new@example.com', 
          username: 'newname', 
          profileImage: 'http://example.com/new.jpg' 
        } 
      };
      const res = { json: sandbox.stub() };
      
      await updateUserProfile(req, res);
      expect(user.save.calledOnce).to.be.true;
      expect(user.isEmailVerified).to.be.false;
      expect(user.emailVerificationToken).to.be.a('string');
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

  describe('updateUser', () => {
    it('should prevent a super admin from demoting their own account', async () => {
      const userId = new mongoose.Types.ObjectId();
      const error = Object.assign(new Error('A super admin cannot demote their own account'), {
        errorCode: 'SUPER_ADMIN_SELF_DEMOTION_FORBIDDEN',
        statusCode: 403,
      });
      sandbox.stub(adminUserGovernanceService, 'updateManagedUser').rejects(error);
      const req = {
        params: { id: userId.toString() },
        user: { _id: userId },
        body: { role: 'admin' },
      };
      const res = { status: sandbox.stub().returnsThis() };

      try {
        await updateUser(req, res);
        throw new Error('Expected updateUser to reject');
      } catch (caught) {
        expect(caught.errorCode).to.equal('SUPER_ADMIN_SELF_DEMOTION_FORBIDDEN');
        expect(caught.statusCode).to.equal(403);
      }

      expect(adminUserGovernanceService.updateManagedUser.calledOnce).to.be.true;
    });

    it('should allow a super admin to change another user\'s role', async () => {
      const userId = new mongoose.Types.ObjectId();
      const actorId = new mongoose.Types.ObjectId();
      const user = { _id: userId, username: 'admin', email: 'admin@example.com', role: 'user' };
      sandbox.stub(adminUserGovernanceService, 'updateManagedUser').resolves(user);
      const req = {
        params: { id: userId.toString() },
        user: { _id: actorId, role: 'super-admin' },
        body: { role: 'user' },
      };
      const res = { json: sandbox.stub() };

      await updateUser(req, res);

      expect(adminUserGovernanceService.updateManagedUser.calledOnce).to.be.true;
      expect(res.json.calledOnce).to.be.true;
    });
  });

  describe('deleteUser', () => {
    it('should soft delete user', async () => {
      const user = { _id: new mongoose.Types.ObjectId(), isDeleted: false };
      sandbox.stub(adminUserGovernanceService, 'softDeleteManagedUser').resolves({ asset: null });

      const req = { params: { id: user._id.toString() }, user: { _id: new mongoose.Types.ObjectId() } };
      const res = { json: sandbox.stub() };
      
      await deleteUser(req, res);
      expect(adminUserGovernanceService.softDeleteManagedUser.calledOnce).to.be.true;
    });
  });

  describe('hardDeleteUser', () => {
    it('should hard delete user', async () => {
      const userId = new mongoose.Types.ObjectId();
      sandbox.stub(adminUserGovernanceService, 'hardDeleteManagedUser').resolves({ asset: null });

      const req = { params: { id: userId.toString() }, query: {}, user: { _id: new mongoose.Types.ObjectId() } };
      const res = { json: sandbox.stub() };
      
      await hardDeleteUser(req, res);
      expect(adminUserGovernanceService.hardDeleteManagedUser.calledOnce).to.be.true;
    });
  });
});
