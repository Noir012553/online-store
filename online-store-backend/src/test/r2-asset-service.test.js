const chai = require('chai');
const expect = chai.expect;
const {
  getR2Accounts,
  selectR2Account,
  inferMimeType,
  validateAssetBuffer,
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

  it('builds content-addressed keys and rejects unsafe references', () => {
    const hash = 'a'.repeat(64);
    expect(buildStorageKey({ contentHash: hash, mimeType: 'image/jpeg', role: 'main' }))
      .to.equal(`assets/main/${hash}.jpg`);
    expect(isSafeStorageKey('assets/main/file.jpg')).to.equal(true);
    expect(isSafeStorageKey('../outside.jpg')).to.equal(false);
  });
});
