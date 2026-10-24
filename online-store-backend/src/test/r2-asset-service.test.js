const chai = require('chai');
const expect = chai.expect;
const sinon = require('sinon');
const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const {
  getR2Accounts,
  findR2AssetByPrefix,
  getR2UploadPolicy,
  selectR2Account,
  inferMimeType,
  validateAssetBuffer,
  isTransientR2Error,
  uploadBuffer,
  buildStorageKey,
  isSafeStorageKey,
} = require('../services/r2AssetService');

describe('dynamic R2 asset discovery', () => {
  let originalR2Env;

  beforeEach(() => {
    originalR2Env = Object.fromEntries(Object.entries(process.env).filter(([key]) => (
      /^R2_(?:ACCOUNT_ID|ACCESS_KEY_ID|SECRET_ACCESS_KEY|BUCKET_NAME|PUBLIC_BASE_URL)(?:_\d+)?$/.test(key)
      || key === 'R2_MAX_RETRIES'
    )));
    Object.keys(originalR2Env).forEach(key => delete process.env[key]);
    Object.assign(process.env, {
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
      R2_MAX_RETRIES: '0',
    });
  });

  afterEach(() => {
    sinon.restore();
    Object.keys(process.env).filter(key => (
      /^R2_(?:ACCOUNT_ID|ACCESS_KEY_ID|SECRET_ACCESS_KEY|BUCKET_NAME|PUBLIC_BASE_URL)(?:_\d+)?$/.test(key)
      || key === 'R2_MAX_RETRIES'
    )).forEach(key => delete process.env[key]);
    Object.assign(process.env, originalR2Env);
  });

  it('finds the only matching image across configured accounts and reads its metadata', async () => {
    const contentHash = 'a'.repeat(64);
    const storageKey = `banners/seed-banner-1/${contentHash}.png`;
    const send = sinon.stub(S3Client.prototype, 'send').callsFake(async command => {
      if (command instanceof ListObjectsV2Command) {
        return { Contents: command.input.Bucket === 'bucket-two' ? [{ Key: storageKey }] : [] };
      }
      return {
        ContentType: 'image/png',
        ContentLength: 123,
        Metadata: { sha256: contentHash },
      };
    });

    const asset = await findR2AssetByPrefix('banners/seed-banner-1');

    expect(asset).to.include({
      storageAccount: '2',
      bucket: 'bucket-two',
      storageKey,
      contentHash,
      mimeType: 'image/png',
      bytes: 123,
      publicUrl: `https://cdn.two.example/${storageKey}`,
    });
    expect(send.callCount).to.equal(3);
  });

  it('fails when no object matches the requested prefix', async () => {
    sinon.stub(S3Client.prototype, 'send').resolves({ Contents: [] });

    try {
      await findR2AssetByPrefix('banners/seed-banner-0');
      expect.fail('Expected missing R2 asset to fail');
    } catch (error) {
      expect(error.code).to.equal('R2_ASSET_NOT_FOUND');
    }
  });

  it('fails when a prefix matches multiple objects', async () => {
    sinon.stub(S3Client.prototype, 'send').resolves({
      Contents: [
        { Key: 'banners/seed-banner-2/first.jpg' },
        { Key: 'banners/seed-banner-2/second.jpg' },
      ],
    });

    try {
      await findR2AssetByPrefix('banners/seed-banner-2');
      expect.fail('Expected ambiguous R2 assets to fail');
    } catch (error) {
      expect(error.code).to.equal('R2_ASSET_AMBIGUOUS');
    }
  });
});

const expectErrorCode = (callback, code) => {
  try {
    callback();
    expect.fail(`Expected error code ${code}`);
  } catch (error) {
    expect(error.code).to.equal(code);
  }
};

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
    expectErrorCode(() => getR2Accounts({
      R2_ACCOUNT_ID: 'account-one',
      R2_ACCESS_KEY_ID: 'access-one',
    }), 'R2_ACCOUNT_GROUP_INCOMPLETE');
  });

  it('rejects gaps in numbered account groups', () => {
    expectErrorCode(() => getR2Accounts({
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
    }), 'R2_ACCOUNT_GROUP_GAP');
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
    expectErrorCode(() => validateAssetBuffer(jpeg, { mimeType: 'image/png' }), 'R2_ASSET_CONTENT_INVALID');
  });

  it('builds content-addressed keys under a managed storage prefix', () => {
    const hash = 'a'.repeat(64);
    expect(buildStorageKey({ contentHash: hash, mimeType: 'image/jpeg', role: 'main', storagePrefix: 'products/identity/main' }))
      .to.equal(`products/identity/main/${hash}.jpg`);
    expect(buildStorageKey({ contentHash: hash, mimeType: 'image/jpeg', role: 'main' }))
      .to.equal(`assets/main/${hash}.jpg`);
    expect(isSafeStorageKey('assets/main/file.jpg')).to.equal(true);
    expect(isSafeStorageKey('../outside.jpg')).to.equal(false);
    expectErrorCode(() => buildStorageKey({ contentHash: hash, mimeType: 'image/jpeg', storagePrefix: '../outside' }), 'R2_STORAGE_PREFIX_INVALID');
  });
});
