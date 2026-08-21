const assert = require('node:assert/strict');
const ghnService = require('../services/ghnService');

describe('GHN insurance value normalization', () => {
  const originalValue = process.env.GHN_MAX_INSURANCE_VALUE;

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env.GHN_MAX_INSURANCE_VALUE;
    } else {
      process.env.GHN_MAX_INSURANCE_VALUE = originalValue;
    }
  });

  it('uses the GHN default limit when no environment value is configured', () => {
    delete process.env.GHN_MAX_INSURANCE_VALUE;
    assert.equal(ghnService.normalizeInsuranceValue(50000000), 5000000);
  });

  it('uses the configured limit without changing payment amounts', () => {
    process.env.GHN_MAX_INSURANCE_VALUE = '300000000';
    assert.equal(ghnService.normalizeInsuranceValue(50000000), 50000000);
  });

  it('normalizes negative and invalid values to zero', () => {
    process.env.GHN_MAX_INSURANCE_VALUE = '5000000';
    assert.equal(ghnService.normalizeInsuranceValue(-100), 0);
    assert.equal(ghnService.normalizeInsuranceValue('invalid'), 0);
  });
});
