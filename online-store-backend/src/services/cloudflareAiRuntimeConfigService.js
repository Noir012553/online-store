const ProviderRuntimeConfiguration = require('../models/ProviderRuntimeConfiguration');
const { decryptSecret } = require('./vnpayRuntimeConfigService');

const loadCloudflareAiRuntimeConfiguration = async () => {
  const configuration = await ProviderRuntimeConfiguration.findOne({ providerCode: 'cloudflare_ai' }).lean();
  const values = { ...(configuration?.values || {}) };
  const encryptedSecrets = configuration?.encryptedSecrets || {};
  for (const [key, value] of Object.entries(encryptedSecrets)) values[key] = decryptSecret(value);
  return {
    values,
    databaseKeys: Object.keys(values),
    version: configuration?.version || 0,
    storeAvailable: /^[a-f0-9]{64}$/i.test(process.env.PROVIDER_CONFIG_ENCRYPTION_KEY || ''),
  };
};

module.exports = { loadCloudflareAiRuntimeConfiguration };
