const chai = require('chai');
const expect = chai.expect;
const {
  getR2Accounts,
  getR2UploadPolicy,
  selectR2Account,
  inferMimeType,
  validateAssetBuffer,
  isTransientR2Error,
  uploadBuffer,
  buildStorageKey,
  isSafeStorageKey,
} = require('../services/r2AssetService');

describe('R2 asset service helpers', () => {
  it('loads only complete numbered account groups', () => {
    const accounts = getR2Accounts({
      R2_ACCOUNT_ID: 'account-one',
      R2_ACCESS_KEY_ID: 'access-one',
      R2_SECRET_ACCESS_KEY: 'secret-one',
      R2_BUCKET_NAME: 'bucket-one',
      R2_PUBLIC_BASE_URL: 'https://cdn.one.example',
      R2_ACCOUNT_ID_2: 'account-two',
      R2_ACCESS_KEY_ID_2: 'access-two',
      R2_SECRET_ACCESS_KEY_2: 'secret-two',
      R2_BUCKET_NAME_2: 'bucket-two',
      R2_PUBLIC_BASE_URL_2: 'https://cdn.two.example',
    });

    expect(accounts.map(account => account.id)).to.deep.equal(['1', '2']);
    expect(accounts[0]).not.to.have.property('secretAccessKey', undefined);
  });

  it('rejects partial account groups instead of silently using incomplete credentials', () => {
    expect(() => getR2Accounts({
      R2_ACCOUNT_ID: 'account-one',
      R2_ACCESS_KEY_ID: 'access-one',
    })).to.throw('R2_ACCOUNT_GROUP_INCOMPLETE');
  });

  it('rejects gaps in numbered account groups', () => {
    expect(() => getR2Accounts({
      R2_ACCOUNT_ID: 'account-one',
      R2_ACCESS_KEY_ID: 'access-one',
      R2_SECRET_ACCESS_KEY: 'secret-one',
      R2_BUCKET_NAME: 'bucket-one',
      R2_PUBLIC_BASE_URL: 'https://cdn.one.example',
      R2_ACCOUNT_ID_3: 'account-three',
      R2_ACCESS_KEY_ID_3: 'access-three',
      R2_SECRET_ACCESS_KEY_3: 'secret-three',
      R2_BUCKET_NAME_3: 'bucket-three',
      R2_PUBLIC_BASE_URL_3: 'https://cdn.three.example',
    })).to.throw('R2_ACCOUNT_GROUP_GAP');
  });

  it('selects an account deterministically from a stable key', () => {
    const environment = {
      R2_ACCOUNT_ID: 'account-one',
      R2_ACCESS_KEY_ID: 'access-one',
      R2_SECRET_ACCESS_KEY: 'secret-one',
      R2_BUCKET_NAME: 'bucket-one',
      R2_PUBLIC_BASE_URL: 'https://cdn.one.example',
      R2_ACCOUNT_ID_2: 'account-two',
      R2_ACCESS_KEY_ID_2: 'access-two',
      R2_SECRET_ACCESS_KEY_2: 'secret-two',
      R2_BUCKET_NAME_2: 'bucket-two',
      R2_PUBLIC_BASE_URL_2: 'https://cdn.two.example',
    };
    const original = { ...process.env };
    Object.assign(process.env, environment);
    try {
      expect(selectR2Account({ stableKey: 'product-1', role: 'gallery' }).id)
        .to.equal(selectR2Account({ stableKey: 'product-1', role: 'gallery' }).id);
    } finally {
      Object.keys(process.env).forEach(key => {
        if (!(key in original)) delete process.env[key];
      });
      Object.assign(process.env, original);
    }
  });

  it('fails closed when R2 upload policy is not explicitly enabled and budgeted', async () => {
    const original = {
      R2_UPLOAD_ENABLED: process.env.R2_UPLOAD_ENABLED,
      R2_MAX_UPLOAD_COUNT: process.env.R2_MAX_UPLOAD_COUNT,
      R2_MAX_UPLOAD_BYTES: process.env.R2_MAX_UPLOAD_BYTES,
    };
    delete process.env.R2_UPLOAD_ENABLED;
    delete process.env.R2_MAX_UPLOAD_COUNT;
    delete process.env.R2_MAX_UPLOAD_BYTES;
    try {
      expect(getR2UploadPolicy()).to.deep.include({ enabled: false, maxAssets: 0, maxBytes: 0 });
      try {
        await uploadBuffer(Buffer.from([0xff, 0xd8, 0xff]), { mimeType: 'image/jpeg' });
        expect.fail('Expected R2 upload to be disabled');
      } catch (error) {
        expect(error.code).to.equal('R2_UPLOAD_DISABLED');
      }
    } finally {
      Object.entries(original).forEach(([key, value]) => {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      });
    }
  });

  it('classifies only retryable R2 transport/provider failures as transient', () => {
    expect(isTransientR2Error({ $metadata: { httpStatusCode: 429 } })).to.equal(true);
    expect(isTransientR2Error({ $metadata: { httpStatusCode: 503 } })).to.equal(true);
    expect(isTransientR2Error({ $metadata: { httpStatusCode: 403 } })).to.equal(false);
    expect(isTransientR2Error({ code: 'ETIMEDOUT' })).to.equal(true);
  });

  it('validates MIME type and magic bytes at the asset boundary', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
    expect(inferMimeType(jpeg)).to.equal('image/jpeg');
    expect(validateAssetBuffer(jpeg, { mimeType: 'image/jpeg' })).to.deep.equal({
      mimeType: 'image/jpeg',
      bytes: 4,
    });
    expect(() => validateAssetBuffer(jpeg, { mimeType: 'image/png' }))
      .to.throw('R2_ASSET_CONTENT_INVALID');
  });

  it('builds content-addressed keys under a managed storage prefix', () => {
    const hash = 'a'.repeat(64);
    expect(buildStorageKey({ contentHash: hash, mimeType: 'image/jpeg', role: 'main', storagePrefix: 'products/identity/main' }))
      .to.equal(`products/identity/main/${hash}.jpg`);
    expect(buildStorageKey({ contentHash: hash, mimeType: 'image/jpeg', role: 'main' }))
      .to.equal(`assets/main/${hash}.jpg`);
    expect(isSafeStorageKey('assets/main/file.jpg')).to.equal(true);
    expect(isSafeStorageKey('../outside.jpg')).to.equal(false);
    expect(() => buildStorageKey({ contentHash: hash, mimeType: 'image/jpeg', storagePrefix: '../outside' }))
      .to.throw('R2_STORAGE_PREFIX_INVALID');
  });
});
