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
    paymentService.vnpayCheckoutEnabled = false;
    sandbox.stub(paymentService, 'refreshVnpayAdapter').resolves(false);
    sandbox.stub(paymentService, 'refreshPayPalAdapter').resolves(false);
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
        { code: 'paypal', isEnabled: true, isDeleted: false },
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

  it('uses the runtime checkout switch and requires a configured VNPay adapter', async () => {
    sandbox.stub(PaymentMethod, 'findOne').returns({
      lean: () => Promise.resolve({ code: 'vnpay', isEnabled: true, isDeleted: false }),
    });
    sandbox.stub(paymentService, 'isGatewaySupported').withArgs('vnpay').returns(false);
    paymentService.vnpayCheckoutEnabled = true;

    expect(await paymentMethodService.isPaymentMethodAvailable('vnpay')).to.equal(false);
  });

  it('allows VNPay when runtime checkout is enabled and the adapter is configured', async () => {
    sandbox.stub(PaymentMethod, 'findOne').returns({
      lean: () => Promise.resolve({ code: 'vnpay', isEnabled: false, isDeleted: false }),
    });
    sandbox.stub(paymentService, 'isGatewaySupported').withArgs('vnpay').returns(true);
    paymentService.vnpayCheckoutEnabled = true;

    expect(await paymentMethodService.isPaymentMethodAvailable('vnpay')).to.equal(true);
  });

  it('exposes PayPal only when both the method toggle and runtime configuration are ready', async () => {
    const findOne = sandbox.stub(PaymentMethod, 'findOne');
    findOne.onFirstCall().returns({ lean: () => Promise.resolve({ code: 'paypal', isEnabled: true, isDeleted: false }) });
    findOne.onSecondCall().returns({ lean: () => Promise.resolve({ code: 'paypal', isEnabled: false, isDeleted: false }) });
    sandbox.stub(paymentService, 'isGatewaySupported').withArgs('paypal').returns(true);
    paymentService.paypalCheckoutEnabled = true;

    expect(await paymentMethodService.isPaymentMethodAvailable('paypal')).to.equal(true);
    expect(await paymentMethodService.isPaymentMethodAvailable('paypal')).to.equal(false);
  });

  it('creates default records only when missing', async () => {
    const bulkWrite = sandbox.stub(PaymentMethod, 'bulkWrite').resolves();

    await paymentMethodService.ensurePaymentMethods();

    const writes = bulkWrite.firstCall.args[0];
    expect(writes).to.have.length(3);
    expect(writes.map(write => write.updateOne.filter.code)).to.deep.equal(['cod', 'vnpay', 'paypal']);
    expect(writes.filter(write => write.updateOne.filter.code !== 'paypal')
      .every(write => write.updateOne.update.$setOnInsert.isEnabled)).to.equal(true);
    expect(writes.find(write => write.updateOne.filter.code === 'paypal').updateOne.update.$setOnInsert.isEnabled).to.equal(false);
    expect(writes.every(write => write.updateOne.update.$setOnInsert.isDeleted)).to.equal(false);
  });
});
