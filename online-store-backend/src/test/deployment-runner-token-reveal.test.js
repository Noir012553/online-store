const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const request = require('supertest');
const bcrypt = require('bcryptjs');

process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.PROVIDER_CONFIG_ENCRYPTION_KEY = 'a'.repeat(64);

const User = require('../models/User');
const ProviderRuntimeConfiguration = require('../models/ProviderRuntimeConfiguration');
const ProviderRuntimeAudit = require('../models/ProviderRuntimeAudit');
const { encryptSecret } = require('../services/vnpayRuntimeConfigService');
const { generateAccessToken } = require('../utils/generateToken');
const deploymentRoutes = require('../routes/deploymentRoutes');
const { errorHandler } = require('../middleware/errorMiddleware');

const userId = '507f1f77bcf86cd799439011';
const password = 'correct-password';
const runnerToken = 'runner-token-that-is-secret';
const controlToken = 'control-token-that-is-also-secret';
const authToken = generateAccessToken(userId);
const path = '/api/admin/deployment/config/runner-token/reveal';
const app = express();
app.use(express.json());
app.use('/api/admin/deployment', deploymentRoutes);
app.use(errorHandler);

let user;
let stored;
let audits;
let lookupCount;
let auditError;
const originals = {
  findUser: User.findById,
  findConfig: ProviderRuntimeConfiguration.findOne,
  createAudit: ProviderRuntimeAudit.create,
};

test.beforeEach(() => {
  process.env.PROVIDER_CONFIG_ENCRYPTION_KEY = 'a'.repeat(64);
  user = new User({ _id: userId, username: 'super', role: 'super-admin', password: bcrypt.hashSync(password, 4), authVersion: '0' });
  stored = {
    encryptedSecrets: {
      DEPLOYMENT_RUNNER_TOKEN: encryptSecret(runnerToken),
      DEPLOYMENT_CONTROL_TOKEN: encryptSecret(controlToken),
      DEPLOYMENT_ROUTER_URL: encryptSecret('https://router.example.test'),
    },
  };
  audits = [];
  lookupCount = 0;
  auditError = null;
  User.findById = () => ({
    select: async () => user,
    then: (resolve, reject) => Promise.resolve(user).then(resolve, reject),
  });
  ProviderRuntimeConfiguration.findOne = (filter) => {
    assert.deepEqual(filter, { providerCode: 'deployment_router' });
    lookupCount += 1;
    return { lean: async () => stored };
  };
  ProviderRuntimeAudit.create = async (entry) => {
    if (auditError) throw auditError;
    audits.push(entry);
  };
});

test.after(() => {
  User.findById = originals.findUser;
  ProviderRuntimeConfiguration.findOne = originals.findConfig;
  ProviderRuntimeAudit.create = originals.createAudit;
});

const authorized = () => request(app).post(path).set('Authorization', `Bearer ${authToken}`);
const noStore = (response) => assert.match(response.headers['cache-control'], /no-store/);

test('reveals only the stored runner token after password verification and audits without secrets', async () => {
  const response = await authorized().send({ password });
  assert.equal(response.status, 200);
  noStore(response);
  assert.deepEqual(response.body, { success: true, data: { key: 'DEPLOYMENT_RUNNER_TOKEN', value: runnerToken } });
  assert.deepEqual(audits, [{
    providerCode: 'deployment_router', action: 'reveal', changedFields: ['DEPLOYMENT_RUNNER_TOKEN'],
    userId: user._id, userName: 'super',
  }]);
  assert.equal(JSON.stringify(audits).includes(runnerToken), false);
  assert.equal(JSON.stringify(audits).includes(controlToken), false);
  assert.equal(JSON.stringify(audits).includes(password), false);
});

test('normal config remains redacted and no-store', async () => {
  const response = await request(app).get('/api/admin/deployment/config').set('Authorization', `Bearer ${authToken}`);
  assert.equal(response.status, 200);
  noStore(response);
  assert.equal(response.body.data.runnerTokenConfigured, true);
  assert.equal(JSON.stringify(response.body).includes(runnerToken), false);
  assert.equal(JSON.stringify(response.body).includes(controlToken), false);
  assert.equal(Object.hasOwn(response.body.data, 'runnerToken'), false);
});

test('rejects incorrect or unavailable passwords before looking up the token', async () => {
  let response = await authorized().send({ password: 'wrong' });
  assert.equal(response.status, 401);
  assert.equal(response.body.code, 'REAUTHENTICATION_FAILED');
  noStore(response);
  user.password = null;
  response = await authorized().send({ password });
  assert.equal(response.status, 401);
  assert.equal(response.body.code, 'REAUTHENTICATION_FAILED');
  noStore(response);
  assert.equal(lookupCount, 0);
  assert.deepEqual(audits, []);
});

test('requires exactly a password field', async () => {
  for (const body of [{}, { password, extra: true }, { password: 5 }, [password], null]) {
    const response = await authorized().send(body);
    assert.equal(response.status, 400);
    noStore(response);
  }
  assert.equal(lookupCount, 0);
  assert.deepEqual(audits, []);
});

test('requires authentication and super-admin authorization', async () => {
  let response = await request(app).post(path).send({ password });
  assert.equal(response.status, 401);
  noStore(response);
  user.role = 'admin';
  response = await authorized().send({ password });
  assert.equal(response.status, 403);
  noStore(response);
  assert.equal(lookupCount, 0);
  assert.deepEqual(audits, []);
});

test('reports a missing token without falling back to environment values', async () => {
  stored.encryptedSecrets = {};
  process.env.DEPLOYMENT_RUNNER_TOKEN = 'environment-runner-token';
  try {
    const response = await authorized().send({ password });
    assert.equal(response.status, 404);
    assert.equal(response.body.code, 'DEPLOYMENT_RUNNER_TOKEN_NOT_CONFIGURED');
    noStore(response);
    assert.deepEqual(audits, []);
  } finally {
    delete process.env.DEPLOYMENT_RUNNER_TOKEN;
  }
});

test('handles unavailable encryption and corrupt ciphertext without exposing secrets', async () => {
  delete process.env.PROVIDER_CONFIG_ENCRYPTION_KEY;
  let response = await authorized().send({ password });
  assert.equal(response.status, 503);
  assert.equal(response.body.code, 'DEPLOYMENT_ROUTER_CONFIG_STORE_UNAVAILABLE');
  noStore(response);
  process.env.PROVIDER_CONFIG_ENCRYPTION_KEY = 'b'.repeat(64);
  response = await authorized().send({ password });
  assert.equal(response.status, 500);
  assert.equal(response.body.code, 'DEPLOYMENT_RUNNER_TOKEN_REVEAL_FAILED');
  noStore(response);
  assert.equal(JSON.stringify(response.body).includes(runnerToken), false);
  assert.deepEqual(audits, []);
});

test('does not decrypt unrelated secrets and does not reveal when audit fails', async () => {
  stored.encryptedSecrets.DEPLOYMENT_CONTROL_TOKEN = { ciphertext: 'broken' };
  let response = await authorized().send({ password });
  assert.equal(response.status, 200);
  assert.equal(response.body.data.value, runnerToken);
  auditError = new Error('audit unavailable');
  response = await authorized().send({ password });
  assert.equal(response.status, 500);
  noStore(response);
  assert.equal(JSON.stringify(response.body).includes(runnerToken), false);
});
