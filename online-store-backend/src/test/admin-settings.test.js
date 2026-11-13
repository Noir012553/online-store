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
const { getRuntimeSettings, runtimeSettingRegistry } = require('../services/adminSettingsRegistry');
const adminSettingsRoutes = require('../routes/adminSettingsRoutes');

const app = express();
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

  it('validates typed settings and exposes secrets only as configured flags', () => {
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

  it('requires authentication and rejects non-super-admin roles', async () => {
    const anonymous = await request(app).get('/api/admin/settings/values');
    expect(anonymous.status).to.equal(401);
    const anonymousSecret = await request(app).get('/api/admin/settings/secrets/EMAIL_PASSWORD');
    expect(anonymousSecret.status).to.equal(401);

    const token = authenticateAs('admin');
    const adminResponse = await request(app)
      .get('/api/admin/settings/values')
      .set('Authorization', `Bearer ${token}`);
    expect(adminResponse.status).to.equal(403);
    const adminSecret = await request(app)
      .get('/api/admin/settings/secrets/EMAIL_PASSWORD')
      .set('Authorization', `Bearer ${token}`);
    expect(adminSecret.status).to.equal(403);
  });

  it('returns the allowlisted status without secret values and disables caching', async () => {
    const token = authenticateAs('super-admin');
    const response = await request(app)
      .get('/api/admin/settings/values')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).to.equal(200);
    expect(response.headers['cache-control']).to.equal('no-store');
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

  it('reveals only a requested configured secret to super admins without caching', async () => {
    const token = authenticateAs('super-admin');
    const response = await request(app)
      .get('/api/admin/settings/secrets/EMAIL_PASSWORD')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).to.equal(200);
    expect(response.headers['cache-control']).to.equal('no-store, private');
    expect(response.body).to.deep.equal({ success: true, data: { value: 'email-test-secret' } });
    expect(response.text).not.to.include('sendgrid-test-secret');

    const nonSecret = await request(app)
      .get('/api/admin/settings/secrets/EMAIL_HOST')
      .set('Authorization', `Bearer ${token}`);
    expect(nonSecret.status).to.equal(404);

    const unapproved = await request(app)
      .get('/api/admin/settings/secrets/CLOUDFLARE_API_TOKEN_14')
      .set('Authorization', `Bearer ${token}`);
    expect(unapproved.status).to.equal(404);
  });
});
