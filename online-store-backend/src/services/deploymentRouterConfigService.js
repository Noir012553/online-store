const ProviderRuntimeConfiguration = require('../models/ProviderRuntimeConfiguration');
const { encryptSecret, decryptSecret } = require('./vnpayRuntimeConfigService');

const PROVIDER_CODE = 'deployment_router';
const ROUTER_TOKEN_MIN_LENGTH = 32;
const RUNNER_TOKEN_MIN_LENGTH = 16;
const originKeys = ['TUNNEL_FRONTEND_ORIGIN', 'TUNNEL_BACKEND_ORIGIN', 'VERCEL_FRONTEND_ORIGIN', 'RENDER_BACKEND_ORIGIN'];
const checklistKeys = ['WORKER_DEPLOYED', 'RUNNER_CONFIGURED', 'STAGING_VERIFIED'];

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
  const storedRunnerToken = encryptedSecrets.DEPLOYMENT_RUNNER_TOKEN
    ? decryptSecret(encryptedSecrets.DEPLOYMENT_RUNNER_TOKEN)
    : '';
  const routerUrl = storedRouterUrl || process.env.DEPLOYMENT_ROUTER_URL || '';
  const controlToken = storedControlToken || process.env.DEPLOYMENT_CONTROL_TOKEN || '';
  const values = stored?.values || {};

  return {
    routerUrl,
    controlToken,
    runnerToken: storedRunnerToken,
    workerOrigins: Object.fromEntries(originKeys.map((key) => [key, String(values[key] || '')])),
    runnerId: String(values.DEPLOYMENT_RUNNER_ID || 'laptop-store-windows-01'),
    runnerTokenFilePath: String(values.DEPLOYMENT_RUNNER_TOKEN_DPAPI_FILE || ''),
    readinessChecklist: Object.fromEntries(checklistKeys.map((key) => [key, Boolean(values[key])])),
    routerUrlSource: storedRouterUrl ? 'database' : process.env.DEPLOYMENT_ROUTER_URL ? 'environment' : 'unset',
    controlTokenSource: storedControlToken ? 'database' : process.env.DEPLOYMENT_CONTROL_TOKEN ? 'environment' : 'unset',
    runnerTokenConfigured: Boolean(storedRunnerToken),
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
    workerOrigins: config.workerOrigins,
    runnerId: config.runnerId,
    runnerTokenConfigured: config.runnerTokenConfigured,
    runnerTokenFilePath: config.runnerTokenFilePath,
    readinessChecklist: config.readinessChecklist,
  };
};

const normalizeOptionalOrigin = (value) => {
  if (value === '') return '';
  if (typeof value !== 'string' || value.length > 2048) throw new Error('INVALID_DEPLOYMENT_ORIGIN');
  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error('INVALID_DEPLOYMENT_ORIGIN');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('INVALID_DEPLOYMENT_ORIGIN');
  }
  return parsed.origin;
};

const saveDeploymentRouterConfig = async ({ routerUrl, controlToken, workerOrigins = {}, runnerId, runnerToken, runnerTokenFilePath, readinessChecklist, updatedBy }) => {
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
  const values = { ...(existing?.values || {}) };
  encryptedSecrets.DEPLOYMENT_ROUTER_URL = encryptSecret(normalizedOrigin);
  if (submittedToken) encryptedSecrets.DEPLOYMENT_CONTROL_TOKEN = encryptSecret(submittedToken);

  const normalizedOrigins = {};
  for (const key of originKeys) {
    if (Object.hasOwn(workerOrigins, key)) {
      normalizedOrigins[key] = normalizeOptionalOrigin(workerOrigins[key]);
      values[key] = normalizedOrigins[key];
    }
  }
  if (runnerId !== undefined) {
    if (typeof runnerId !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(runnerId.trim())) throw new Error('INVALID_DEPLOYMENT_RUNNER_ID');
    values.DEPLOYMENT_RUNNER_ID = runnerId.trim();
  }
  if (runnerTokenFilePath !== undefined) {
    if (typeof runnerTokenFilePath !== 'string' || runnerTokenFilePath.length > 1024 || /[\u0000-\u001f]/.test(runnerTokenFilePath)) {
      throw new Error('INVALID_DEPLOYMENT_RUNNER_TOKEN_FILE');
    }
    values.DEPLOYMENT_RUNNER_TOKEN_DPAPI_FILE = runnerTokenFilePath.trim();
  }
  if (readinessChecklist !== undefined) {
    for (const key of checklistKeys) {
      if (Object.hasOwn(readinessChecklist, key)) {
        if (typeof readinessChecklist[key] !== 'boolean') throw new Error('INVALID_DEPLOYMENT_CHECKLIST');
        values[key] = readinessChecklist[key];
      }
    }
  }
  const submittedRunnerToken = typeof runnerToken === 'string' ? runnerToken.trim() : '';
  if (submittedRunnerToken && (submittedRunnerToken.length < RUNNER_TOKEN_MIN_LENGTH || submittedRunnerToken.length > 2048)) {
    throw new Error('INVALID_DEPLOYMENT_RUNNER_TOKEN');
  }
  if (submittedRunnerToken) encryptedSecrets.DEPLOYMENT_RUNNER_TOKEN = encryptSecret(submittedRunnerToken);
  const version = (existing?.version || 0) + 1;

  await ProviderRuntimeConfiguration.findOneAndUpdate(
    { providerCode: PROVIDER_CODE },
    { $set: { providerCode: PROVIDER_CODE, values, encryptedSecrets, version, updatedBy } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  );

  return {
    version,
    routerUrl: normalizedOrigin,
    controlTokenUpdated: Boolean(submittedToken),
    runnerTokenUpdated: Boolean(submittedRunnerToken),
    changedFields: [
      'DEPLOYMENT_ROUTER_URL',
      ...(submittedToken ? ['DEPLOYMENT_CONTROL_TOKEN'] : []),
      ...Object.keys(normalizedOrigins),
      ...(runnerId !== undefined ? ['DEPLOYMENT_RUNNER_ID'] : []),
      ...(runnerTokenFilePath !== undefined ? ['DEPLOYMENT_RUNNER_TOKEN_DPAPI_FILE'] : []),
      ...(readinessChecklist !== undefined ? checklistKeys.filter((key) => Object.hasOwn(readinessChecklist, key)) : []),
      ...(submittedRunnerToken ? ['DEPLOYMENT_RUNNER_TOKEN'] : []),
    ],
  };
};

module.exports = {
  getDeploymentRouterConfig,
  getDeploymentRouterConfigStatus,
  normalizeRouterOrigin,
  ROUTER_TOKEN_MIN_LENGTH,
  saveDeploymentRouterConfig,
};
