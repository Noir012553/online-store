const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const sinon = require('sinon');
const mongoose = require('mongoose');
const StoreSettings = require('../models/StoreSettings');
const Product = require('../models/Product');
const ProductLocalizedSlug = require('../models/ProductLocalizedSlug');
const ProductCatalogTranslationCache = require('../models/ProductCatalogTranslationCache');
const ProviderCatalogEntry = require('../models/ProviderCatalogEntry');
const ProviderConfiguration = require('../models/ProviderConfiguration');
const ProviderConfigurationAudit = require('../models/ProviderConfigurationAudit');
const { getDefaultLanguage } = require('../config/languageInventory');
const { getProductSitemap } = require('../controllers/productController');
const providerController = require('../controllers/providerConfigurationController');

const providerId = new mongoose.Types.ObjectId();
const productId = new mongoose.Types.ObjectId();
const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.user = { _id: providerId, name: 'Test' }; next(); });
app.get('/sitemap', getProductSitemap);
app.get('/schema/:providerCode', providerController.getSchema);
app.get('/config/:id', providerController.get);
app.put('/config/:id', providerController.save);
app.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));

let sandbox;
let originalEnv;
let settings;
let savedConfiguration;
const query = (value) => ({ select() { return this; }, sort() { return this; }, lean: async () => value });
const field = (response, key) => response.body.data.fields.find((item) => item.key === key);

test.beforeEach(() => {
  sandbox = sinon.createSandbox();
  originalEnv = { FRONTEND_URL: process.env.FRONTEND_URL, BACKEND_URL: process.env.BACKEND_URL };
  delete process.env.FRONTEND_URL;
  delete process.env.BACKEND_URL;
  settings = null;
  savedConfiguration = null;
  sandbox.stub(StoreSettings, 'findOne').callsFake(() => query(settings));
  sandbox.stub(ProductLocalizedSlug, 'find').returns(query([{ productId, locale: getDefaultLanguage().code, slug: 'test-product' }]));
  sandbox.stub(Product, 'find').returns(query([{ _id: productId, name: 'Test', updatedAt: new Date('2024-01-01T00:00:00Z') }]));
  sandbox.stub(ProductCatalogTranslationCache, 'find').returns(query([]));
  sandbox.stub(ProviderCatalogEntry, 'findOne').callsFake(() => query({ _id: providerId, providerCode: 'paypal' }));
  sandbox.stub(ProviderConfiguration, 'findOne').callsFake(() => Object.assign(Promise.resolve(savedConfiguration), { lean: async () => savedConfiguration }));
});

test.afterEach(() => {
  sandbox.restore();
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test('sitemap uses the current canonical storefront origin for URLs and disables caching', async () => {
  settings = { branding: { siteUrl: 'https://store.example.test' } };
  process.env.FRONTEND_URL = 'https://infrastructure.example.test';
  const first = await request(app).get('/sitemap').expect(200);
  assert.match(first.headers['cache-control'], /no-store/);
  assert.match(first.text, /<loc>https:\/\/store\.example\.test\/product\/test-product<\/loc>/);
  assert.match(first.text, /hreflang="x-default" href="https:\/\/store\.example\.test\/product\/test-product"/);
  settings.branding.siteUrl = 'https://new-store.example.test';
  const second = await request(app).get('/sitemap').expect(200);
  assert.match(second.text, /https:\/\/new-store\.example\.test\/product\/test-product/);
  assert.doesNotMatch(second.text, /https:\/\/store\.example\.test/);
  assert.deepEqual(StoreSettings.findOne.firstCall.args[0], { key: 'storefront' });
});

test('sitemap falls back to configured FRONTEND_URL and fails closed when absent or invalid', async () => {
  settings = { branding: { siteUrl: '' } };
  process.env.FRONTEND_URL = 'http://localhost:3000/some/path';
  const fallback = await request(app).get('/sitemap').expect(200);
  assert.match(fallback.text, /http:\/\/localhost:3000\/product\/test-product/);
  delete process.env.FRONTEND_URL;
  const missing = await request(app).get('/sitemap').expect(503);
  assert.equal(missing.body.code, 'STOREFRONT_URL_UNAVAILABLE');
  assert.match(missing.headers['cache-control'], /no-store/);
  process.env.FRONTEND_URL = 'not-a-url';
  await request(app).get('/sitemap').expect(503);
});

test('PayPal schema and saved configuration expose independently derived suggestions without replacing saved values', async () => {
  settings = { branding: { siteUrl: 'https://shop.example.test' } };
  process.env.FRONTEND_URL = 'https://not-the-store.example.test';
  process.env.BACKEND_URL = 'https://api.example.test/';
  savedConfiguration = { values: { PAYPAL_RETURN_URL: 'https://custom.example.test/return', PAYPAL_WEBHOOK_URL: 'https://custom.example.test/webhook' }, version: 3 };
  for (const path of ['/schema/paypal', `/config/${providerId}`]) {
    const response = await request(app).get(path).expect(200);
    assert.match(response.headers['cache-control'], /no-store/);
    assert.deepEqual(field(response, 'PAYPAL_RETURN_URL').options, ['https://shop.example.test/return?method=paypal']);
    assert.equal(field(response, 'PAYPAL_CANCEL_URL').placeholder, 'https://shop.example.test/return?method=paypal&status=cancelled');
    assert.deepEqual(field(response, 'PAYPAL_WEBHOOK_URL').options, ['https://api.example.test/api/payments/webhook/paypal']);
    if (response.body.data.values) assert.deepEqual(response.body.data.values, savedConfiguration.values);
  }
  settings.branding.siteUrl = 'https://changed.example.test';
  const changed = await request(app).get('/schema/paypal').expect(200);
  assert.deepEqual(field(changed, 'PAYPAL_RETURN_URL').options, ['https://changed.example.test/return?method=paypal']);
});

test('PayPal omits unavailable or invalid suggestions without leaking prior request schema state', async () => {
  settings = { branding: { siteUrl: 'https://shop.example.test' } };
  process.env.BACKEND_URL = 'https://api.example.test';
  await request(app).get('/schema/paypal').expect(200);
  delete process.env.BACKEND_URL;
  const storefrontOnly = await request(app).get('/schema/paypal').expect(200);
  assert.deepEqual(field(storefrontOnly, 'PAYPAL_RETURN_URL').options, ['https://shop.example.test/return?method=paypal']);
  assert.deepEqual(field(storefrontOnly, 'PAYPAL_WEBHOOK_URL').options, []);
  settings = null;
  process.env.FRONTEND_URL = 'https://fallback.example.test';
  for (const backend of ['', 'http://api.example.test', 'not-a-url', 'https://user:pass@api.example.test']) {
    process.env.BACKEND_URL = backend;
    for (const path of ['/schema/paypal', `/config/${providerId}`]) {
      const response = await request(app).get(path).expect(200);
      for (const key of ['PAYPAL_RETURN_URL', 'PAYPAL_CANCEL_URL', 'PAYPAL_WEBHOOK_URL']) {
        assert.deepEqual(field(response, key).options, []);
        assert.equal(field(response, key).placeholder, undefined);
      }
    }
  }
  process.env.BACKEND_URL = 'https://api.example.test';
  const backendOnly = await request(app).get('/schema/paypal').expect(200);
  assert.deepEqual(field(backendOnly, 'PAYPAL_RETURN_URL').options, []);
  assert.deepEqual(field(backendOnly, 'PAYPAL_WEBHOOK_URL').options, ['https://api.example.test/api/payments/webhook/paypal']);
  settings = { branding: { siteUrl: 'http://invalid.example.test' } };
  const invalidStore = await request(app).get('/schema/paypal').expect(200);
  assert.deepEqual(field(invalidStore, 'PAYPAL_RETURN_URL').options, []);
});

test('saving PayPal configuration still accepts custom HTTPS URLs without loading settings', async () => {
  savedConfiguration = { values: { PAYPAL_CLIENT_ID: 'client', PAYPAL_WEBHOOK_ID: 'webhook' }, encryptedSecrets: { PAYPAL_CLIENT_SECRET: { ciphertext: 'existing' } }, version: 1 };
  const update = sandbox.stub(ProviderConfiguration, 'findOneAndUpdate').resolves({ version: 2 });
  sandbox.stub(ProviderConfigurationAudit, 'create').resolves({});
  const response = await request(app).put(`/config/${providerId}`).send({ PAYPAL_RETURN_URL: 'https://custom.example.test/return' }).expect(200);
  assert.equal(response.body.data.values.PAYPAL_RETURN_URL, 'https://custom.example.test/return');
  assert.equal(update.firstCall.args[1].$set.values.PAYPAL_CLIENT_ID, 'client');
  assert.equal(StoreSettings.findOne.callCount, 0);
});
