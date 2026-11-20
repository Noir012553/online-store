const { expect } = require('chai');
const sinon = require('sinon');
const ProviderRuntimeConfiguration = require('../../models/ProviderRuntimeConfiguration');
const PaymentMethod = require('../../models/PaymentMethod');
const { encryptSecret, loadVnpayRuntimeConfig } = require('../../services/vnpayRuntimeConfigService');

describe('vnpayRuntimeConfigService', () => {
  let sandbox;
  let originalEnvironment;
  let storedConfig;
  const query = (value) => ({ lean: () => Promise.resolve(value) });

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    originalEnvironment = Object.fromEntries(['PROVIDER_CONFIG_ENCRYPTION_KEY', 'VNPAY_TMN_CODE', 'VNPAY_HASH_SECRET'].map((key) => [key, process.env[key]]));
    process.env.PROVIDER_CONFIG_ENCRYPTION_KEY = 'a'.repeat(64);
    storedConfig = null;
    sandbox.stub(ProviderRuntimeConfiguration, 'findOne').callsFake(() => query(storedConfig));
    sandbox.stub(PaymentMethod, 'findOne').returns({ select: () => query({ isEnabled: true }) });
  });

  afterEach(() => {
    sandbox.restore();
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('encrypts and resolves saved VNPay settings before environment values', async () => {
    const secret = 'stored-hash-secret';
    const encryptedSecret = encryptSecret(secret);
    process.env.VNPAY_TMN_CODE = 'ENV123';
    storedConfig = {
      values: { VNPAY_TMN_CODE: 'DB123', VNPAY_ENDPOINT: 'https://pay.vnpay.vn/vpcpay.html', VNPAY_CHECKOUT_ENABLED: false },
      encryptedSecrets: { VNPAY_HASH_SECRET: encryptedSecret },
      version: 4,
    };

    const runtime = await loadVnpayRuntimeConfig();

    expect(runtime.config.partnerId).to.equal('DB123');
    expect(runtime.config.partnerKey).to.equal(secret);
    expect(runtime.config.endpoint).to.equal('https://pay.vnpay.vn/vpcpay.html');
    expect(runtime.checkoutEnabled).to.equal(false);
    expect(runtime.version).to.equal(4);
    expect(JSON.stringify(encryptedSecret)).not.to.contain(secret);
  });

  it('falls back to environment and PaymentMethod before a runtime override exists', async () => {
    process.env.VNPAY_TMN_CODE = 'ENV123';
    process.env.VNPAY_HASH_SECRET = 'environment-secret';

    const runtime = await loadVnpayRuntimeConfig();

    expect(runtime.config.partnerId).to.equal('ENV123');
    expect(runtime.config.partnerKey).to.equal('environment-secret');
    expect(runtime.checkoutEnabled).to.equal(true);
    expect(runtime.values.VNPAY_TMN_CODE.source).to.equal('environment');
  });
});
