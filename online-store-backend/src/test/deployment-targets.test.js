const chai = require('chai');
const sinon = require('sinon');
const DeploymentTargets = require('../models/DeploymentTargets');
const controller = require('../controllers/deploymentTargetsController');

const expect = chai.expect;

describe('deployment target controller', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => sandbox.restore());

  it('returns Cloudflare Tunnel defaults for both application parts', async () => {
    sandbox.stub(DeploymentTargets, 'findOne').returns({ lean: sandbox.stub().resolves(null) });
    const res = { set: sandbox.stub(), status: sandbox.stub().returnsThis(), json: sandbox.stub() };

    await controller.getDeploymentTargets({}, res);

    expect(res.json.firstCall.args[0].data).to.deep.equal({
      targets: { backend: 'cloudflare-tunnel', frontend: 'cloudflare-tunnel' },
      saved: false,
    });
  });

  it('saves frontend and backend targets independently', async () => {
    const saved = { backend: 'cloudflare-tunnel', frontend: 'vercel' };
    const update = sandbox.stub(DeploymentTargets, 'findOneAndUpdate').resolves(saved);
    const res = { status: sandbox.stub().returnsThis(), json: sandbox.stub() };

    await controller.updateDeploymentTargets({ body: saved }, res);

    expect(update.firstCall.args[1]).to.deep.equal({ $set: saved });
    expect(res.status.calledWith(200)).to.equal(true);
    expect(res.json.firstCall.args[0].data).to.deep.equal({ targets: saved, saved: true });
  });

  it('rejects unsupported targets without writing them', async () => {
    const update = sandbox.stub(DeploymentTargets, 'findOneAndUpdate');
    const res = { status: sandbox.stub().returnsThis(), json: sandbox.stub() };

    await controller.updateDeploymentTargets({ body: { backend: 'vercel', frontend: 'cloudflare-tunnel' } }, res);

    expect(update.called).to.equal(false);
    expect(res.status.calledWith(400)).to.equal(true);
    expect(res.json.firstCall.args[0].code).to.equal('DEPLOYMENT_TARGETS_INVALID');
  });
});
