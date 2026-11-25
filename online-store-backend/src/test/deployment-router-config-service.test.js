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
