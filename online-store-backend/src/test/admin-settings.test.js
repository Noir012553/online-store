'use strict';

const chai = require('chai');
const expect = chai.expect;
const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const sinon = require('sinon');

const originalAccessSecret = process.env.JWT_ACCESS_SECRET;
const originalRefreshSecret = process.env.JWT_REFRESH_SECRET;
process.env.JWT_ACCESS_SECRET ||= 'admin-settings-test-access-secret';
process.env.JWT_REFRESH_SECRET ||= 'admin-settings-test-refresh-secret';

const User = require('../models/User');
const TokenBlacklist = require('../models/TokenBlacklist');
const { ACCESS_TOKEN_SECRET, JWT_ALGORITHM } = require('../utils/generateToken');
const { errorHandler } = require('../middleware/errorMiddleware');
const { getRuntimeSettings, runtimeSettingRegistry, editableSettingRegistry } = require('../services/adminSettingsRegistry');
const settingsDraftStore = require('../services/adminSettingsDraftStore');
const adminSettingsRoutes = require('../routes/adminSettingsRoutes');

const app = express();
app.use(express.json());
app.use('/api/admin/settings', adminSettingsRoutes);
app.use(errorHandler);

const secretEnvironmentKeys = [
  'EMAIL_PASSWORD',
  'SENDGRID_API_KEY',
  'VNPAY_HASH_SECRET',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'CLOUDFLARE_API_TOKEN_1',
  'CLOUDFLARE_API_TOKEN_14',
  'JWT_SECRET',
  'EMAIL_HOST',
];
let originalEnvironment;

const createToken = userId => jwt.sign({ id: userId, type: 'access' }, ACCESS_TOKEN_SECRET, {
  algorithm: JWT_ALGORITHM,
  expiresIn: '5m',
});

const authenticateAs = role => {
  const user = { _id: 'settings-test-user', role, isDeleted: false };
  sinon.stub(User, 'findById').returns({ select: sinon.stub().resolves(user) });
  sinon.stub(TokenBlacklist, 'findOne').resolves(null);
  return createToken(user._id);
};

describe('Super-admin settings boundary', () => {
  beforeEach(() => {
    originalEnvironment = Object.fromEntries(secretEnvironmentKeys.map(key => [key, process.env[key]]));
    Object.assign(process.env, {
      EMAIL_PASSWORD: 'email-test-secret',
      SENDGRID_API_KEY: 'sendgrid-test-secret',
      VNPAY_HASH_SECRET: 'vnpay-test-secret',
      R2_ACCESS_KEY_ID: 'r2-access-test-secret',
      R2_SECRET_ACCESS_KEY: 'r2-secret-test-secret',
      CLOUDFLARE_API_TOKEN_1: 'cloudflare-test-secret',
      CLOUDFLARE_API_TOKEN_14: 'unapproved-cloudflare-test-secret',
      JWT_SECRET: 'jwt-test-secret',
      EMAIL_HOST: 'smtp.example.test',
    });
  });

  afterEach(() => {
    sinon.restore();
    secretEnvironmentKeys.forEach(key => {
      if (originalEnvironment[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnvironment[key];
    });
    if (originalAccessSecret === undefined) delete process.env.JWT_ACCESS_SECRET;
    else process.env.JWT_ACCESS_SECRET = originalAccessSecret;
    if (originalRefreshSecret === undefined) delete process.env.JWT_REFRESH_SECRET;
    else process.env.JWT_REFRESH_SECRET = originalRefreshSecret;
  });

  it('validates typed runtime settings without exposing secret values', () => {
    const settings = getRuntimeSettings({
      EMAIL_PASSWORD: 'test-secret',
      EMAIL_HOST: 'smtp.example.test',
      EMAIL_PORT: '70000',
      EMAIL_SERVICE: 'unsupported',
      CLOUDFLARE_API_TOKEN_1: 'token-test-secret',
      CLOUDFLARE_API_TOKEN_14: 'unapproved',
      JWT_SECRET: 'jwt-test-secret',
      R2_ACCOUNT_ROLE_UNREVIEWED: '1',
      R2_ACCOUNT_ROLE_PRODUCT: '10',
    });
    const byKey = Object.fromEntries(settings.map(setting => [setting.key, setting]));

    expect(runtimeSettingRegistry.EMAIL_PASSWORD).to.include({ group: 'email', type: 'secret', secret: true, restartRequired: true });
    expect(byKey.EMAIL_PASSWORD).to.include({ secret: true, configured: true, valid: true });
    expect(byKey.CLOUDFLARE_API_TOKEN_1).to.include({ group: 'cloudflare-ai', secret: true, configured: true, valid: true });
    expect(byKey.EMAIL_HOST).to.include({ group: 'email', type: 'string', value: 'smtp.example.test', valid: true });
    expect(byKey.EMAIL_PORT).to.include({ type: 'integer', valid: false, restartRequired: true });
    expect(byKey.EMAIL_SERVICE).to.include({ type: 'enum', valid: false });
    expect(byKey).not.to.have.property('CLOUDFLARE_API_TOKEN_14');
    expect(byKey).not.to.have.property('JWT_SECRET');
    expect(byKey).not.to.have.property('R2_ACCOUNT_ROLE_UNREVIEWED');
    expect(byKey.R2_ACCOUNT_ROLE_PRODUCT).to.include({ type: 'enum', valid: false });
    expect(JSON.stringify(settings)).not.to.include('test-secret');
  });

  it('only allows explicitly editable setting groups and validates request values', () => {
    expect(editableSettingRegistry).to.have.property('EMAIL_PASSWORD');
    expect(editableSettingRegistry).to.have.property('VNPAY_HASH_SECRET');
    expect(editableSettingRegistry).to.have.property('R2_MAX_UPLOAD_BYTES');
    expect(editableSettingRegistry).to.have.property('R2_ACCOUNT_ID');
    expect(editableSettingRegistry).to.have.property('R2_BUCKET_NAME_2');
    expect(editableSettingRegistry).to.have.property('R2_PUBLIC_BASE_URL');
    expect(editableSettingRegistry).to.have.property('CLOUDFLARE_AI_MODEL_1');
    expect(editableSettingRegistry).not.to.have.property('R2_ACCESS_KEY_ID');
    expect(editableSettingRegistry).not.to.have.property('CLOUDFLARE_API_TOKEN_1');
    expect(editableSettingRegistry).not.to.have.property('CLOUDFLARE_ACCOUNT_ID_1');
    expect(editableSettingRegistry).not.to.have.property('JWT_SECRET');

    const normalized = settingsDraftStore.normalizeSettings({
      EMAIL_PORT: '587',
      VNPAY_ENDPOINT: 'https://sandbox.vnpayment.vn/paygate',
      EMAIL_PASSWORD: '',
      SENDGRID_API_KEY: null,
      VNPAY_CALLBACK_URL: null,
      R2_MAX_UPLOAD_BYTES: '2048',
    });
    expect(normalized).to.deep.equal({
      EMAIL_PORT: '587',
      VNPAY_ENDPOINT: 'https://sandbox.vnpayment.vn/paygate',
      SENDGRID_API_KEY: null,
      VNPAY_CALLBACK_URL: null,
      R2_MAX_UPLOAD_BYTES: '2048',
    });
    expect(() => settingsDraftStore.normalizeSettings({ JWT_SECRET: 'nope' })).to.throw(/not editable/);
    expect(() => settingsDraftStore.normalizeSettings({ CLOUDFLARE_API_TOKEN_1: 'nope' })).to.throw(/not editable/);
    expect(() => settingsDraftStore.normalizeSettings({ EMAIL_PORT: '99999' })).to.throw(/invalid value/);
    expect(() => settingsDraftStore.normalizeSettings({ VNPAY_ENDPOINT: 'http://example.test' })).to.throw(/invalid value/);
    expect(() => settingsDraftStore.normalizeSettings({ R2_BUCKET_NAME: 'ab..cd' })).to.throw(/invalid value/);
    expect(() => settingsDraftStore.normalizeSettings({ R2_BUCKET_NAME: '192.168.1.1' })).to.throw(/invalid value/);
    expect(settingsDraftStore.normalizeSettings({ R2_BUCKET_NAME: 'laptop-assets' })).to.deep.equal({ R2_BUCKET_NAME: 'laptop-assets' });
  });

  it('requires authentication and rejects non-super-admin roles', async () => {
    const anonymous = await request(app).get('/api/admin/settings/values');
    expect(anonymous.status).to.equal(401);
    const deletedSecretEndpoint = await request(app).get('/api/admin/settings/secrets/EMAIL_PASSWORD');
    expect(deletedSecretEndpoint.status).to.equal(404);

    const token = authenticateAs('admin');
    const adminResponse = await request(app)
      .get('/api/admin/settings/values')
      .set('Authorization', `Bearer ${token}`);
    expect(adminResponse.status).to.equal(403);
  });

  it('removes the plaintext secret endpoint and keeps secret flags only', async () => {
    const token = authenticateAs('super-admin');
    const removedSecretEndpoint = await request(app)
      .get('/api/admin/settings/secrets/EMAIL_PASSWORD')
      .set('Authorization', `Bearer ${token}`);
    expect(removedSecretEndpoint.status).to.equal(404);

    const response = await request(app)
      .get('/api/admin/settings/values')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).to.equal(200);
    expect(response.headers['cache-control']).to.equal('no-store, private');
    const passwordSetting = response.body.data.settings.find(setting => setting.key === 'EMAIL_PASSWORD');
    expect(passwordSetting).to.include({ secret: true, configured: true, valid: true });
    expect(response.text).not.to.include('email-test-secret');
    expect(response.text).not.to.include('sendgrid-test-secret');
    expect(response.text).not.to.include('vnpay-test-secret');
    expect(response.text).not.to.include('r2-access-test-secret');
    expect(response.text).not.to.include('r2-secret-test-secret');
    expect(response.text).not.to.include('cloudflare-test-secret');
    expect(response.text).not.to.include('unapproved-cloudflare-test-secret');
    expect(response.text).not.to.include('jwt-test-secret');
  });

  it('returns storage unavailable instead of persisting on an unverified host', async () => {
    const token = authenticateAs('super-admin');
    const availability = settingsDraftStore.getAvailability();
    if (process.platform === 'win32') this.skip();
    expect(availability).to.include({ available: false, reason: 'windows-host-required' });

    const draft = await request(app)
      .get('/api/admin/settings/draft')
      .set('Authorization', `Bearer ${token}`);
    expect(draft.status).to.equal(503);

    const save = await request(app)
      .put('/api/admin/settings/draft')
      .set('Authorization', `Bearer ${token}`)
      .send({ expectedVersion: 0, settings: { EMAIL_PASSWORD: 'write-only-test-secret' } });
    expect(save.status).to.equal(503);
    expect(save.text).not.to.include('write-only-test-secret');

    const invalidKey = await request(app)
      .put('/api/admin/settings/draft')
      .set('Authorization', `Bearer ${token}`)
      .send({ expectedVersion: 0, settings: { CLOUDFLARE_API_TOKEN_1: 'forbidden' } });
    expect(invalidKey.status).to.equal(400);
    expect(invalidKey.text).not.to.include('forbidden');
  });

  it('returns 503 and does not enqueue an apply request when no fresh authenticated worker is present', async () => {
    const token = authenticateAs('super-admin');
    const created = await request(app)
      .post('/api/admin/settings/apply-jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({ expectedVersion: 2 });
    expect(created.status).to.equal(503);
    expect(created.body.code).to.equal('SETTINGS_APPLY_WORKER_UNAVAILABLE');
    expect(created.text).not.to.include('EMAIL_PASSWORD');
  });

  it('reports the apply worker as unavailable in status', async () => {
    const token = authenticateAs('super-admin');
    const response = await request(app)
      .get('/api/admin/settings/status')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).to.equal(200);
    expect(response.body.data.security).to.include({ secretsWriteOnly: true, applyWorkerAvailable: false });
    expect(response.body.data.security.applyWorkerUnavailableReason).to.be.a('string');
  });
});
