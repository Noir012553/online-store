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

  it('accepts only registry keys and exposes secrets only as configured flags', () => {
    const settings = getRuntimeSettings(process.env);
    const byKey = Object.fromEntries(settings.map(setting => [setting.key, setting]));

    expect(runtimeSettingRegistry.EMAIL_PASSWORD).to.deep.equal({ secret: true });
    expect(byKey.EMAIL_PASSWORD).to.deep.equal({ key: 'EMAIL_PASSWORD', secret: true, configured: true });
    expect(byKey.R2_ACCESS_KEY_ID).to.deep.equal({ key: 'R2_ACCESS_KEY_ID', secret: true, configured: true });
    expect(byKey.CLOUDFLARE_API_TOKEN_1).to.deep.equal({ key: 'CLOUDFLARE_API_TOKEN_1', secret: true, configured: true });
    expect(byKey.EMAIL_HOST).to.deep.equal({ key: 'EMAIL_HOST', secret: false, value: 'smtp.example.test' });
    expect(byKey).not.to.have.property('CLOUDFLARE_API_TOKEN_14');
    expect(byKey).not.to.have.property('JWT_SECRET');
    expect(byKey).not.to.have.property('R2_ACCOUNT_ROLE_UNREVIEWED');
    expect(JSON.stringify(settings)).not.to.include('test-secret');
  });

  it('requires authentication and rejects non-super-admin roles', async () => {
    const anonymous = await request(app).get('/api/admin/settings/values');
    expect(anonymous.status).to.equal(401);

    const token = authenticateAs('admin');
    const adminResponse = await request(app)
      .get('/api/admin/settings/values')
      .set('Authorization', `Bearer ${token}`);
    expect(adminResponse.status).to.equal(403);
  });

  it('returns the allowlisted status without secret values and disables caching', async () => {
    const token = authenticateAs('super-admin');
    const response = await request(app)
      .get('/api/admin/settings/values')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).to.equal(200);
    expect(response.headers['cache-control']).to.equal('no-store');
    expect(response.body.data.settings).to.deep.include({
      key: 'EMAIL_PASSWORD',
      secret: true,
      configured: true,
    });
    expect(response.text).not.to.include('email-test-secret');
    expect(response.text).not.to.include('sendgrid-test-secret');
    expect(response.text).not.to.include('vnpay-test-secret');
    expect(response.text).not.to.include('r2-access-test-secret');
    expect(response.text).not.to.include('r2-secret-test-secret');
    expect(response.text).not.to.include('cloudflare-test-secret');
    expect(response.text).not.to.include('unapproved-cloudflare-test-secret');
    expect(response.text).not.to.include('jwt-test-secret');
  });
});
