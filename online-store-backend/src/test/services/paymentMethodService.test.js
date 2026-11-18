const chai = require('chai');
const expect = chai.expect;
const sinon = require('sinon');
const PaymentMethod = require('../../models/PaymentMethod');
const paymentService = require('../../services/paymentService');
const paymentMethodService = require('../../services/paymentMethodService');

describe('paymentMethodService', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('returns only enabled methods with implemented gateways', async () => {
    const query = {
      sort: sandbox.stub().returnsThis(),
      lean: sandbox.stub().resolves([
        { code: 'cod', isEnabled: true, isDeleted: false },
        { code: 'vnpay', isEnabled: true, isDeleted: false },
      ]),
    };
    sandbox.stub(PaymentMethod, 'find').returns(query);
    sandbox.stub(paymentService, 'isGatewaySupported').withArgs('vnpay').returns(false);

    const methods = await paymentMethodService.listAvailablePaymentMethods();

    expect(methods.map(method => method.code)).to.deep.equal(['cod']);
  });

  it('rejects disabled, deleted, and unknown methods', async () => {
    const findOne = sandbox.stub(PaymentMethod, 'findOne');
    findOne.onFirstCall().returns({ lean: () => Promise.resolve({ code: 'cod', isEnabled: false, isDeleted: false }) });
    findOne.onSecondCall().returns({ lean: () => Promise.resolve({ code: 'cod', isEnabled: true, isDeleted: true }) });

    expect(await paymentMethodService.isPaymentMethodAvailable('cod')).to.equal(false);
    expect(await paymentMethodService.isPaymentMethodAvailable('cod')).to.equal(false);
    expect(await paymentMethodService.isPaymentMethodAvailable('momo')).to.equal(false);
    expect(findOne.calledTwice).to.equal(true);
  });

  it('requires both an enabled record and a configured VNPay adapter', async () => {
    sandbox.stub(PaymentMethod, 'findOne').returns({
      lean: () => Promise.resolve({ code: 'vnpay', isEnabled: true, isDeleted: false }),
    });
    sandbox.stub(paymentService, 'isGatewaySupported').withArgs('vnpay').returns(false);

    expect(await paymentMethodService.isPaymentMethodAvailable('vnpay')).to.equal(false);
  });

  it('creates default records only when missing', async () => {
    const bulkWrite = sandbox.stub(PaymentMethod, 'bulkWrite').resolves();

    await paymentMethodService.ensurePaymentMethods();

    const writes = bulkWrite.firstCall.args[0];
    expect(writes).to.have.length(2);
    expect(writes.map(write => write.updateOne.filter.code)).to.deep.equal(['cod', 'vnpay']);
    expect(writes.every(write => write.updateOne.update.$setOnInsert.isEnabled)).to.equal(true);
    expect(writes.every(write => write.updateOne.update.$setOnInsert.isDeleted)).to.equal(false);
  });
});
