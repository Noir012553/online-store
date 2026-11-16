const chai = require('chai');
const sinon = require('sinon');
const mongoose = require('mongoose');
const ProviderDirectoryEntry = require('../models/ProviderDirectoryEntry');
const controller = require('../controllers/providerDirectoryController');

const expect = chai.expect;

describe('provider directory controller', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => sandbox.restore());

  it('lists entries as non-connected and non-operational', async () => {
    const entry = {
      _id: new mongoose.Types.ObjectId(),
      category: 'deployment',
      code: 'cloudflare-pages',
      name: 'Cloudflare Pages',
      description: '',
      managementUrl: 'https://dash.cloudflare.com/',
      isDeleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    sandbox.stub(ProviderDirectoryEntry, 'find').returns({ sort: sandbox.stub().returns({ lean: sandbox.stub().resolves([entry]) }) });
    const res = { set: sandbox.stub(), status: sandbox.stub().returnsThis(), json: sandbox.stub() };

    await controller.listProviders({}, res);

    expect(res.set.calledOnce).to.equal(true);
    expect(res.json.firstCall.args[0].data.providers[0]).to.include({ isConnected: false, isOperational: false });
  });

  it('creates only entries from supported categories with secure external URLs', async () => {
    const entry = {
      _id: new mongoose.Types.ObjectId(),
      category: 'email',
      code: 'mail-provider',
      name: 'Mail Provider',
      description: '',
      managementUrl: 'https://provider.example.com/login',
      isDeleted: false,
      toString() { return this._id.toString(); },
    };
    sandbox.stub(ProviderDirectoryEntry, 'create').resolves(entry);
    const res = { status: sandbox.stub().returnsThis(), json: sandbox.stub() };

    await controller.createProvider({ body: {
      category: 'email', code: 'Mail-Provider', name: ' Mail Provider ',
      managementUrl: 'https://provider.example.com/login', isOperational: true,
    } }, res);

    expect(ProviderDirectoryEntry.create.firstCall.args[0]).to.deep.equal({
      category: 'email', code: 'mail-provider', name: 'Mail Provider', managementUrl: 'https://provider.example.com/login',
    });
    expect(res.status.calledWith(201)).to.equal(true);
    expect(res.json.firstCall.args[0].data.provider.isOperational).to.equal(false);
  });

  it('rejects unsupported categories and insecure management URLs', async () => {
    const res = { status: sandbox.stub().returnsThis(), json: sandbox.stub() };

    await controller.createProvider({ body: { category: 'payment', code: 'other-pay', name: 'Other Pay', managementUrl: 'javascript:alert(1)' } }, res);
    await controller.createProvider({ body: { category: 'unknown', code: 'other-pay', name: 'Other Pay' } }, res);

    expect(res.status.callCount).to.equal(2);
    expect(res.status.alwaysCalledWith(400)).to.equal(true);
    expect(ProviderDirectoryEntry.create.called).to.equal(false);
  });

  it('returns conflict when a category already has the same provider code', async () => {
    sandbox.stub(ProviderDirectoryEntry, 'create').rejects({ code: 11000 });
    const res = { status: sandbox.stub().returnsThis(), json: sandbox.stub() };

    await controller.createProvider({ body: { category: 'shipping', code: 'carrier-one', name: 'Carrier One' } }, res);

    expect(res.status.calledWith(409)).to.equal(true);
    expect(res.json.firstCall.args[0].code).to.equal('PROVIDER_ENTRY_EXISTS');
  });

  it('does not allow updates to category or code', async () => {
    const id = new mongoose.Types.ObjectId().toString();
    const entry = { _id: new mongoose.Types.ObjectId(id), category: 'shipping', code: 'carrier-one', name: 'Carrier One', description: '', managementUrl: '', isDeleted: false };
    const update = sandbox.stub(ProviderDirectoryEntry, 'findOneAndUpdate').resolves(entry);
    const res = { status: sandbox.stub().returnsThis(), json: sandbox.stub() };

    await controller.updateProvider({ params: { id }, body: { category: 'payment', code: 'other-pay', name: 'Carrier One Plus' } }, res);

    expect(update.firstCall.args[1]).to.deep.equal({ $set: { name: 'Carrier One Plus' } });
    expect(res.status.calledWith(200)).to.equal(true);
  });

  it('rejects invalid ids before database operations', async () => {
    const update = sandbox.stub(ProviderDirectoryEntry, 'findOneAndUpdate');
    const res = { status: sandbox.stub().returnsThis(), json: sandbox.stub() };

    await controller.deleteProvider({ params: { id: 'bad-id' } }, res);

    expect(update.called).to.equal(false);
    expect(res.status.calledWith(400)).to.equal(true);
  });
});
