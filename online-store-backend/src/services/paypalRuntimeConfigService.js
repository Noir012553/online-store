const ProviderCatalogEntry = require('../models/ProviderCatalogEntry');
const ProviderConfiguration = require('../models/ProviderConfiguration');
const { decryptSecret } = require('./vnpayRuntimeConfigService');

const loadPayPalRuntimeConfig = async () => {
  try {
    const catalogEntry = await ProviderCatalogEntry.findOne({
      providerCode: 'paypal',
      category: 'payment',
      isDeleted: false,
    }).select('_id').lean();
    if (!catalogEntry) return { config: {}, configured: false };

    const configuration = await ProviderConfiguration.findOne({ providerId: catalogEntry._id }).lean();
    if (!configuration) return { config: {}, configured: false };
    const values = configuration.values || {};
    const secrets = configuration.encryptedSecrets || {};
    const clientSecret = secrets.PAYPAL_CLIENT_SECRET
      ? decryptSecret(secrets.PAYPAL_CLIENT_SECRET)
      : '';
    const config = {
      clientId: String(values.PAYPAL_CLIENT_ID || ''),
      clientSecret,
      webhookId: String(values.PAYPAL_WEBHOOK_ID || ''),
      returnUrl: String(values.PAYPAL_RETURN_URL || ''),
      cancelUrl: String(values.PAYPAL_CANCEL_URL || ''),
      webhookUrl: String(values.PAYPAL_WEBHOOK_URL || ''),
    };
    const configured = Boolean(
      config.clientId && config.clientSecret && config.webhookId
      && config.returnUrl && config.cancelUrl && config.webhookUrl
    );
    return { config, configured };
  } catch {
    return { config: {}, configured: false };
  }
};

module.exports = { loadPayPalRuntimeConfig };
