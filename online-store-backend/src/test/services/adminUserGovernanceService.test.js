const chai = require('chai');
const expect = chai.expect;
const sinon = require('sinon');
const mongoose = require('mongoose');
const User = require('../../models/User');
const AdminUserGovernance = require('../../models/AdminUserGovernance');
const adminUserGovernanceService = require('../../services/adminUserGovernanceService');

describe('Admin user governance service', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  const setupTransaction = ({ actor, target = actor, superAdminCount = 1 }) => {
    const session = {
      withTransaction: callback => callback(),
      endSession: sandbox.stub().resolves(),
    };
    sandbox.stub(mongoose, 'startSession').resolves(session);
    sandbox.stub(AdminUserGovernance, 'updateOne').resolves({ acknowledged: true });
    sandbox.stub(User, 'findOne').callsFake(filter => ({
      session: () => Promise.resolve(filter.role === 'super-admin' ? actor : target),
    }));
    sandbox.stub(User, 'countDocuments').returns({
      session: () => Promise.resolve(superAdminCount),
    });
    return session;
  };

  it('rejects self-demotion by the only super admin', async () => {
    const id = new mongoose.Types.ObjectId();
    const actor = { _id: id, role: 'super-admin', isDeleted: false };
    const target = { ...actor, save: sandbox.stub() };
    setupTransaction({ actor, target });

    try {
      await adminUserGovernanceService.updateManagedUser(id, id, { role: 'admin' }, 'en');
      throw new Error('Expected self-demotion to be rejected');
    } catch (error) {
      expect(error.errorCode).to.equal('SUPER_ADMIN_SELF_DEMOTION_FORBIDDEN');
      expect(error.statusCode).to.equal(403);
    }

    expect(target.save.called).to.be.false;
  });

  it('rejects self-deletion by the only super admin', async () => {
    const id = new mongoose.Types.ObjectId();
    const actor = { _id: id, role: 'super-admin', isDeleted: false };
    setupTransaction({ actor, target: actor });

    try {
      await adminUserGovernanceService.softDeleteManagedUser(id, id, 'en');
      throw new Error('Expected self-deletion to be rejected');
    } catch (error) {
      expect(error.errorCode).to.equal('SUPER_ADMIN_SELF_DELETION_FORBIDDEN');
      expect(error.statusCode).to.equal(403);
    }
  });

  it('rejects removing the last active super admin', async () => {
    const actorId = new mongoose.Types.ObjectId();
    const targetId = new mongoose.Types.ObjectId();
    const actor = { _id: actorId, role: 'super-admin', isDeleted: false };
    const target = { _id: targetId, role: 'super-admin', isDeleted: false, save: sandbox.stub() };
    setupTransaction({ actor, target, superAdminCount: 1 });

    try {
      await adminUserGovernanceService.updateManagedUser(actorId, targetId, { role: 'admin' }, 'en');
      throw new Error('Expected last super-admin removal to be rejected');
    } catch (error) {
      expect(error.errorCode).to.equal('LAST_SUPER_ADMIN_REQUIRED');
      expect(error.statusCode).to.equal(409);
    }

    expect(target.save.called).to.be.false;
  });

  it('allows demoting another super admin when one remains active', async () => {
    const actorId = new mongoose.Types.ObjectId();
    const targetId = new mongoose.Types.ObjectId();
    const actor = { _id: actorId, role: 'super-admin', isDeleted: false };
    const target = {
      _id: targetId,
      role: 'super-admin',
      isDeleted: false,
      save: sandbox.stub().resolves(),
    };
    setupTransaction({ actor, target, superAdminCount: 2 });

    await adminUserGovernanceService.updateManagedUser(actorId, targetId, { role: 'admin' }, 'en');

    expect(target.role).to.equal('admin');
    expect(target.save.calledOnce).to.be.true;
  });

  it('rechecks the actor role inside the transaction', async () => {
    const actorId = new mongoose.Types.ObjectId();
    const session = {
      withTransaction: callback => callback(),
      endSession: sandbox.stub().resolves(),
    };
    sandbox.stub(mongoose, 'startSession').resolves(session);
    sandbox.stub(AdminUserGovernance, 'updateOne').resolves({ acknowledged: true });
    sandbox.stub(User, 'findOne').returns({ session: () => Promise.resolve(null) });

    try {
      await adminUserGovernanceService.updateManagedUser(actorId, new mongoose.Types.ObjectId(), { role: 'user' }, 'en');
      throw new Error('Expected revoked actor to be rejected');
    } catch (error) {
      expect(error.errorCode).to.equal('SUPER_ADMIN_REQUIRED');
      expect(error.statusCode).to.equal(403);
    }
  });
});
