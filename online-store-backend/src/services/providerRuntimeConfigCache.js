const ProviderRuntimeConfiguration = require('../models/ProviderRuntimeConfiguration');
const { decryptSecret } = require('./vnpayRuntimeConfigService');

const runtimeValues = new Map();

const loadProviderRuntimeConfigCache = async () => {
  const configurations = await ProviderRuntimeConfiguration.find({}).lean();
  runtimeValues.clear();
  for (const configuration of configurations) {
    const values = { ...(configuration.values || {}) };
    for (const [key, encrypted] of Object.entries(configuration.encryptedSecrets || {})) {
      values[key] = decryptSecret(encrypted);
    }
    runtimeValues.set(configuration.providerCode, values);
  }
};

const getProviderRuntimeValues = (providerCode) => ({
  ...(runtimeValues.get(providerCode === 'smtp' || providerCode === 'sendgrid' ? 'email' : providerCode) || {}),
});

const getProviderRuntimeValue = (providerCode, key) => (
  runtimeValues.get(providerCode === 'smtp' || providerCode === 'sendgrid' ? 'email' : providerCode)?.[key]
);

const setProviderRuntimeValues = (providerCode, values, encryptedSecrets = {}) => {
  const nextValues = { ...values };
  for (const [key, encrypted] of Object.entries(encryptedSecrets)) {
    nextValues[key] = decryptSecret(encrypted);
  }
  runtimeValues.set(providerCode, nextValues);
};

module.exports = {
  loadProviderRuntimeConfigCache,
  getProviderRuntimeValues,
  getProviderRuntimeValue,
  setProviderRuntimeValues,
};
