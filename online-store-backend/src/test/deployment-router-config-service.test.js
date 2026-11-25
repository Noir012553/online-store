const assert = require('node:assert/strict');
const test = require('node:test');
const Module = require('node:module');
const originalLoad = Module._load;
const ProviderRuntimeConfiguration = {};
const query = (value) => ({ lean: async () => value });
ProviderRuntimeConfiguration.findOne = () => query(stored);
ProviderRuntimeConfiguration.findOneAndUpdate = async (_filter, update) => {
  saved = update.$set;
  stored = { ...saved };
  return stored;
};
Module._load = function (request, parent, isMain) {
  if (request === '../models/ProviderRuntimeConfiguration' && parent?.filename.endsWith('/deploymentRouterConfigService.js')) return ProviderRuntimeConfiguration;
  if (request === '../models/ProviderRuntimeConfiguration' && parent?.filename.endsWith('/vnpayRuntimeConfigService.js')) return ProviderRuntimeConfiguration;
  if (request === '../models/PaymentMethod' && parent?.filename.endsWith('/vnpayRuntimeConfigService.js')) return {};
  return originalLoad.call(this, request, parent, isMain);
};
const { encryptSecret } = require('../services/vnpayRuntimeConfigService');
const {
  getDeploymentRouterConfig,
  getDeploymentRouterConfigStatus,
  saveDeploymentRouterConfig,
} = require('../services/deploymentRouterConfigService');
Module._load = originalLoad;
const envKeys = ['PROVIDER_CONFIG_ENCRYPTION_KEY', 'DEPLOYMENT_ROUTER_URL', 'DEPLOYMENT_CONTROL_TOKEN', 'NODE_ENV'];
let originalEnvironment;
let stored;
let saved;

test.beforeEach(() => {
  originalEnvironment = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  process.env.PROVIDER_CONFIG_ENCRYPTION_KEY = 'a'.repeat(64);
  process.env.NODE_ENV = 'test';
  delete process.env.DEPLOYMENT_ROUTER_URL;
  delete process.env.DEPLOYMENT_CONTROL_TOKEN;
  stored = null;
  saved = null;
});

test.afterEach(() => {
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test('saves router URL and token encrypted and reports only secret state', async () => {
  const token = 'a-control-token-long-enough-for-production';
  const result = await saveDeploymentRouterConfig({
    routerUrl: 'https://router.example.test/',
    controlToken: token,
    updatedBy: 'admin-id',
  });

  assert.equal(result.routerUrl, 'https://router.example.test');
  assert.equal(result.controlTokenUpdated, true);
  assert.equal(saved.providerCode, 'deployment_router');
  assert.equal(JSON.stringify(saved.encryptedSecrets).includes(token), false);

  const config = await getDeploymentRouterConfig();
  assert.equal(config.routerUrl, 'https://router.example.test');
  assert.equal(config.controlToken, token);
  const status = await getDeploymentRouterConfigStatus();
  assert.equal(status.controlTokenConfigured, true);
  assert.equal(status.controlTokenSource, 'database');
  assert.equal(Object.hasOwn(status, 'controlToken'), false);
});

test('blank token updates the URL without replacing the encrypted token', async () => {
  const token = 'a-control-token-long-enough-for-production';
  await saveDeploymentRouterConfig({
    routerUrl: 'https://first-router.example.test',
    controlToken: token,
    updatedBy: 'admin-id',
  });
  const result = await saveDeploymentRouterConfig({
    routerUrl: 'https://second-router.example.test',
    controlToken: '',
    updatedBy: 'admin-id',
  });

  assert.equal(result.controlTokenUpdated, false);
  assert.equal((await getDeploymentRouterConfig()).controlToken, token);
  assert.equal((await getDeploymentRouterConfig()).routerUrl, 'https://second-router.example.test');
});

test('saves Worker origins, runner settings, encrypted runner token, and checklist state', async () => {
  const runnerToken = 'a-runner-token-long-enough';
  const savedResult = await saveDeploymentRouterConfig({
    routerUrl: 'https://router.example.test',
    controlToken: 'a-control-token-long-enough-for-production',
    workerOrigins: {
      TUNNEL_FRONTEND_ORIGIN: 'https://tunnel-frontend.example.test/',
      TUNNEL_BACKEND_ORIGIN: 'https://tunnel-backend.example.test',
      VERCEL_FRONTEND_ORIGIN: 'https://store.example.test',
      RENDER_BACKEND_ORIGIN: 'https://api.example.test',
    },
    runnerId: 'windows-runner-02',
    runnerToken,
    runnerTokenFilePath: 'C:\\\\runner\\\\secrets\\\\token.dpapi',
    readinessChecklist: { WORKER_DEPLOYED: true, RUNNER_CONFIGURED: false, STAGING_VERIFIED: true },
    updatedBy: 'admin-id',
  });

  assert.equal(savedResult.runnerTokenUpdated, true);
  assert.equal(saved.values.TUNNEL_FRONTEND_ORIGIN, 'https://tunnel-frontend.example.test');
  assert.equal(saved.values.DEPLOYMENT_RUNNER_ID, 'windows-runner-02');
  assert.equal(saved.values.DEPLOYMENT_RUNNER_TOKEN_DPAPI_FILE, 'C:\\\\runner\\\\secrets\\\\token.dpapi');
  assert.equal(JSON.stringify(saved.encryptedSecrets).includes(runnerToken), false);
  const status = await getDeploymentRouterConfigStatus();
  assert.equal(status.runnerTokenConfigured, true);
  assert.equal(status.runnerId, 'windows-runner-02');
  assert.equal(status.workerOrigins.RENDER_BACKEND_ORIGIN, 'https://api.example.test');
  assert.equal(status.readinessChecklist.STAGING_VERIFIED, true);
  assert.equal(Object.hasOwn(status, 'runnerToken'), false);
});

test('validates Worker origins and runner credentials', async () => {
  const config = {
    routerUrl: 'https://router.example.test',
    controlToken: 'a-control-token-long-enough-for-production',
    updatedBy: 'admin-id',
  };
  await assert.rejects(saveDeploymentRouterConfig({ ...config, workerOrigins: { TUNNEL_FRONTEND_ORIGIN: 'http://insecure.example.test' } }), { message: 'INVALID_DEPLOYMENT_ORIGIN' });
  await assert.rejects(saveDeploymentRouterConfig({ ...config, runnerId: 'bad id' }), { message: 'INVALID_DEPLOYMENT_RUNNER_ID' });
  await assert.rejects(saveDeploymentRouterConfig({ ...config, runnerToken: 'too-short' }), { message: 'INVALID_DEPLOYMENT_RUNNER_TOKEN' });
  await assert.rejects(saveDeploymentRouterConfig({ ...config, readinessChecklist: { WORKER_DEPLOYED: 'yes' } }), { message: 'INVALID_DEPLOYMENT_CHECKLIST' });
});

test('database configuration takes precedence over environment values', async () => {
  process.env.DEPLOYMENT_ROUTER_URL = 'https://env-router.example.test';
  process.env.DEPLOYMENT_CONTROL_TOKEN = 'environment-control-token-that-is-long-enough';
  stored = {
    encryptedSecrets: {
      DEPLOYMENT_ROUTER_URL: encryptSecret('https://db-router.example.test'),
      DEPLOYMENT_CONTROL_TOKEN: encryptSecret('database-control-token-that-is-long-enough'),
    },
    version: 3,
  };

  const config = await getDeploymentRouterConfig();

  assert.equal(config.routerUrl, 'https://db-router.example.test');
  assert.equal(config.controlToken, 'database-control-token-that-is-long-enough');
  assert.equal(config.routerUrlSource, 'database');
  assert.equal(config.controlTokenSource, 'database');
});

test('environment values remain the fallback when no saved configuration exists', async () => {
  process.env.DEPLOYMENT_ROUTER_URL = 'https://env-router.example.test';
  process.env.DEPLOYMENT_CONTROL_TOKEN = 'environment-control-token-that-is-long-enough';

  const status = await getDeploymentRouterConfigStatus();

  assert.equal(status.routerUrlSource, 'environment');
  assert.equal(status.controlTokenConfigured, true);
  assert.equal(status.controlTokenSource, 'environment');
});

test('rejects non-origin URLs and control tokens shorter than 32 characters', async () => {
  await assert.rejects(
    saveDeploymentRouterConfig({ routerUrl: 'https://router.example.test/path', controlToken: 'a'.repeat(32), updatedBy: 'admin-id' }),
    { message: 'INVALID_DEPLOYMENT_ROUTER_URL' },
  );
  await assert.rejects(
    saveDeploymentRouterConfig({ routerUrl: 'https://router.example.test', controlToken: 'too-short', updatedBy: 'admin-id' }),
    { message: 'INVALID_DEPLOYMENT_CONTROL_TOKEN' },
  );
  assert.equal(saved, null);
});

test('requires the encryption key before saving secrets', async () => {
  delete process.env.PROVIDER_CONFIG_ENCRYPTION_KEY;

  await assert.rejects(
    saveDeploymentRouterConfig({ routerUrl: 'https://router.example.test', controlToken: 'a'.repeat(32), updatedBy: 'admin-id' }),
    { message: 'DEPLOYMENT_ROUTER_CONFIG_STORE_UNAVAILABLE' },
  );
});
