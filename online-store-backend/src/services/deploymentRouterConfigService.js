const ProviderRuntimeConfiguration = require('../models/ProviderRuntimeConfiguration');
const { encryptSecret, decryptSecret } = require('./vnpayRuntimeConfigService');

const PROVIDER_CODE = 'deployment_router';
const ROUTER_TOKEN_MIN_LENGTH = 32;

const normalizeRouterOrigin = (value) => {
  if (typeof value !== 'string' || !value.trim() || value.length > 2048) throw new Error('INVALID_DEPLOYMENT_ROUTER_URL');
  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error('INVALID_DEPLOYMENT_ROUTER_URL');
  }
  const allowLocalHttp = process.env.NODE_ENV !== 'production'
    && ['localhost', '127.0.0.1'].includes(parsed.hostname);
  if ((parsed.protocol !== 'https:' && !(allowLocalHttp && parsed.protocol === 'http:'))
    || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('INVALID_DEPLOYMENT_ROUTER_URL');
  }
  return parsed.origin;
};

const getDeploymentRouterConfig = async () => {
  const stored = await ProviderRuntimeConfiguration.findOne({ providerCode: PROVIDER_CODE }).lean();
  const encryptedSecrets = stored?.encryptedSecrets || {};
  const storeAvailable = /^[a-f0-9]{64}$/i.test(process.env.PROVIDER_CONFIG_ENCRYPTION_KEY || '');
  if (Object.keys(encryptedSecrets).length && !storeAvailable) throw new Error('DEPLOYMENT_ROUTER_CONFIG_STORE_UNAVAILABLE');
  const storedRouterUrl = encryptedSecrets.DEPLOYMENT_ROUTER_URL
    ? decryptSecret(encryptedSecrets.DEPLOYMENT_ROUTER_URL)
    : '';
  const storedControlToken = encryptedSecrets.DEPLOYMENT_CONTROL_TOKEN
    ? decryptSecret(encryptedSecrets.DEPLOYMENT_CONTROL_TOKEN)
    : '';
  const routerUrl = storedRouterUrl || process.env.DEPLOYMENT_ROUTER_URL || '';
  const controlToken = storedControlToken || process.env.DEPLOYMENT_CONTROL_TOKEN || '';

  return {
    routerUrl,
    controlToken,
    routerUrlSource: storedRouterUrl ? 'database' : process.env.DEPLOYMENT_ROUTER_URL ? 'environment' : 'unset',
    controlTokenSource: storedControlToken ? 'database' : process.env.DEPLOYMENT_CONTROL_TOKEN ? 'environment' : 'unset',
    version: stored?.version || 0,
    storeAvailable: /^[a-f0-9]{64}$/i.test(process.env.PROVIDER_CONFIG_ENCRYPTION_KEY || ''),
  };
};

const getDeploymentRouterConfigStatus = async () => {
  const config = await getDeploymentRouterConfig();
  return {
    routerUrl: config.routerUrl,
    routerUrlSource: config.routerUrlSource,
    controlTokenConfigured: Boolean(config.controlToken),
    controlTokenValid: config.controlToken.length >= ROUTER_TOKEN_MIN_LENGTH && config.controlToken.length <= 2048,
    controlTokenSource: config.controlTokenSource,
    version: config.version,
    storeAvailable: config.storeAvailable,
  };
};

const saveDeploymentRouterConfig = async ({ routerUrl, controlToken, updatedBy }) => {
  if (!/^[a-f0-9]{64}$/i.test(process.env.PROVIDER_CONFIG_ENCRYPTION_KEY || '')) {
    throw new Error('DEPLOYMENT_ROUTER_CONFIG_STORE_UNAVAILABLE');
  }
  const normalizedOrigin = normalizeRouterOrigin(routerUrl);
  const current = await getDeploymentRouterConfig();
  const submittedToken = typeof controlToken === 'string' ? controlToken.trim() : '';
  const effectiveToken = submittedToken || current.controlToken;
  if (!effectiveToken) throw new Error('DEPLOYMENT_CONTROL_TOKEN_REQUIRED');
  if (effectiveToken.length < ROUTER_TOKEN_MIN_LENGTH || effectiveToken.length > 2048) {
    throw new Error('INVALID_DEPLOYMENT_CONTROL_TOKEN');
  }

  const existing = await ProviderRuntimeConfiguration.findOne({ providerCode: PROVIDER_CODE }).lean();
  const encryptedSecrets = { ...(existing?.encryptedSecrets || {}) };
  encryptedSecrets.DEPLOYMENT_ROUTER_URL = encryptSecret(normalizedOrigin);
  if (submittedToken) encryptedSecrets.DEPLOYMENT_CONTROL_TOKEN = encryptSecret(submittedToken);
  const version = (existing?.version || 0) + 1;

  await ProviderRuntimeConfiguration.findOneAndUpdate(
    { providerCode: PROVIDER_CODE },
    { $set: { providerCode: PROVIDER_CODE, values: {}, encryptedSecrets, version, updatedBy } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  );

  return { version, routerUrl: normalizedOrigin, controlTokenUpdated: Boolean(submittedToken) };
};

module.exports = {
  getDeploymentRouterConfig,
  getDeploymentRouterConfigStatus,
  normalizeRouterOrigin,
  ROUTER_TOKEN_MIN_LENGTH,
  saveDeploymentRouterConfig,
};
