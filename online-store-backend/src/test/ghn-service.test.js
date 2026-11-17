const assert = require('node:assert/strict');
const sinon = require('sinon');
const axios = require('axios');
const ShippingProvider = require('../models/ShippingProvider');
const ghnService = require('../services/ghnService');

describe('GHN encrypted runtime configuration', () => {
  const originalToken = process.env.GHN_API_TOKEN;
  const originalShopId = process.env.GHN_SHOP_ID;

  afterEach(() => {
    sinon.restore();
    if (originalToken === undefined) delete process.env.GHN_API_TOKEN;
    else process.env.GHN_API_TOKEN = originalToken;
    if (originalShopId === undefined) delete process.env.GHN_SHOP_ID;
    else process.env.GHN_SHOP_ID = originalShopId;
  });

  it('prefers encrypted runtime token and shop ID over legacy provider values', async () => {
    process.env.GHN_API_TOKEN = 'managed-runtime-token';
    process.env.GHN_SHOP_ID = '12345';
    sinon.stub(ShippingProvider, 'getByCode').resolves({
      apiKey: 'legacy-database-token',
      token: 'legacy-database-shop',
      apiUrl: 'https://sandbox.example.test',
    });
    const create = sinon.stub(axios, 'create').returns({});

    await ghnService.getGhnClient();

    assert.equal(create.firstCall.args[0].baseURL, 'https://sandbox.example.test');
    assert.equal(create.firstCall.args[0].headers.Token, 'managed-runtime-token');
    assert.equal(create.firstCall.args[0].headers.ShopId, '12345');
  });
});

describe('GHN insurance value normalization', () => {
  const originalValue = process.env.GHN_MAX_INSURANCE_VALUE;

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env.GHN_MAX_INSURANCE_VALUE;
    } else {
      process.env.GHN_MAX_INSURANCE_VALUE = originalValue;
    }
  });

  it('uses the default limit when no environment value is configured', () => {
    delete process.env.GHN_MAX_INSURANCE_VALUE;
    const defaultLimit = ghnService.getMaxInsuranceValue();
    const valueAboveLimit = defaultLimit + Math.max(defaultLimit, 1);

    assert.equal(ghnService.normalizeInsuranceValue(valueAboveLimit), defaultLimit);
  });

  it('uses the configured limit without changing payment amounts', () => {
    const configuredLimit = ghnService.getMaxInsuranceValue() + 1;
    process.env.GHN_MAX_INSURANCE_VALUE = String(configuredLimit);
    const valueAboveLimit = configuredLimit + 1;

    assert.equal(ghnService.normalizeInsuranceValue(valueAboveLimit), configuredLimit);
  });

  it('normalizes negative and invalid values to zero', () => {
    process.env.GHN_MAX_INSURANCE_VALUE = String(ghnService.getMaxInsuranceValue());

    assert.equal(ghnService.normalizeInsuranceValue(-1), 0);
    assert.equal(ghnService.normalizeInsuranceValue('invalid'), 0);
  });
});
