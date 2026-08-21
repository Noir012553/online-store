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
