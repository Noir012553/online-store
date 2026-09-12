const chai = require('chai');
const expect = chai.expect;
const cloudinary = require('cloudinary').v2;

const envKeys = [...new Set([
  ...Object.keys(process.env).filter(key => /^CLOUDINARY_(CLOUD_NAME|API_KEY|API_SECRET)(?:_\d+)?$/.test(key)),
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'CLOUDINARY_CLOUD_NAME_2',
  'CLOUDINARY_API_KEY_2',
  'CLOUDINARY_API_SECRET_2',
  'CLOUDINARY_REMOTE_IMAGE_RETRIES',
  'CLOUDINARY_UPLOAD_RETRIES',
])];
const originalEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
envKeys.forEach(key => delete process.env[key]);
const originalUploadStream = cloudinary.uploader.upload_stream;
const originalUsage = cloudinary.api.usage;
const originalFetch = global.fetch;

process.env.CLOUDINARY_CLOUD_NAME = 'cloud-one';
process.env.CLOUDINARY_API_KEY = 'key-one';
process.env.CLOUDINARY_API_SECRET = 'secret-one';
process.env.CLOUDINARY_CLOUD_NAME_2 = 'cloud-two';
process.env.CLOUDINARY_API_KEY_2 = 'key-two';
process.env.CLOUDINARY_API_SECRET_2 = 'secret-two';

delete require.cache[require.resolve('../services/cloudinaryService')];
const {
  getCloudinaryUploadAccount,
  getCloudinaryAccountIdForUrl,
  uploadToCloudinary,
  downloadRemoteImage,
  resetCloudinaryRuntimeState,
} = require('../services/cloudinaryService');

describe('Cloudinary account rotation', () => {
  beforeEach(() => {
    resetCloudinaryRuntimeState();
    cloudinary.api.usage = async () => ({
      credits: { usage: 0.1, limit: 25 },
    });
  });

  after(() => {
    cloudinary.uploader.upload_stream = originalUploadStream;
    cloudinary.api.usage = originalUsage;
    global.fetch = originalFetch;
    envKeys.forEach(key => {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    });
  });

  it('selects the next configured account when the first is excluded', async () => {
    const account = await getCloudinaryUploadAccount(['1']);
    expect(account).to.include({ id: '2', cloudName: 'cloud-two' });
  });

  it('resolves an account from a Cloudinary delivery URL', () => {
    expect(getCloudinaryAccountIdForUrl(
      'https://res.cloudinary.com/cloud-two/image/upload/laptop-store/users/example.jpg',
    )).to.equal('2');
  });

  it('retries transient upload failures on the same account', async () => {
    process.env.CLOUDINARY_UPLOAD_RETRIES = '1';
    let attempts = 0;
    cloudinary.uploader.upload_stream = (options, callback) => {
      attempts += 1;
      const account = cloudinary.config().cloud_name;
      queueMicrotask(() => {
        if (attempts === 1) {
          callback(Object.assign(new TypeError('fetch failed'), {
            cause: { code: 'ECONNRESET' },
          }));
          return;
        }
        callback(null, {
          resource_type: 'image',
          width: 50,
          height: 50,
          bytes: 12,
          format: 'jpg',
          public_id: 'laptop-store/users/network-retry',
          secure_url: `https://res.cloudinary.com/${account}/image/upload/laptop-store/users/network-retry.jpg`,
        });
      });
      return { end: () => {} };
    };

    const buffer = Buffer.alloc(12);
    buffer.set([0xff, 0xd8, 0xff]);
    const result = await uploadToCloudinary(buffer, 'users');

    expect(attempts).to.equal(2);
    expect(result).to.include({ cloudinaryAccountId: '1', cloudName: 'cloud-one' });
  });

  it('retries an upload after a rate-limit response', async () => {
    let attempts = 0;
    cloudinary.uploader.upload_stream = (options, callback) => {
      attempts += 1;
      const account = cloudinary.config().cloud_name;
      queueMicrotask(() => {
        if (attempts === 1) {
          callback({ http_code: 429, message: 'Rate limit exceeded' });
          return;
        }
        callback(null, {
          resource_type: 'image',
          width: 50,
          height: 50,
          bytes: 12,
          format: 'jpg',
          public_id: 'laptop-store/users/test',
          secure_url: `https://res.cloudinary.com/${account}/image/upload/laptop-store/users/test.jpg`,
        });
      });
      return { end: () => {} };
    };

    const buffer = Buffer.alloc(12);
    buffer.set([0xff, 0xd8, 0xff]);
    const result = await uploadToCloudinary(buffer, 'users');

    expect(attempts).to.equal(2);
    expect(result).to.include({ cloudinaryAccountId: '2', cloudName: 'cloud-two' });
  });

  it('retries transient source image fetch failures without rotating accounts', async () => {
    process.env.CLOUDINARY_REMOTE_IMAGE_RETRIES = '2';
    let attempts = 0;
    global.fetch = async () => {
      attempts += 1;
      if (attempts < 3) {
        const error = new TypeError('fetch failed');
        error.cause = { code: 'ECONNRESET' };
        throw error;
      }

      let consumed = false;
      const chunk = Buffer.from([0xff, 0xd8, 0xff]);
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        body: {
          getReader: () => ({
            read: async () => {
              if (consumed) return { done: true };
              consumed = true;
              return { done: false, value: chunk };
            },
            cancel: async () => {},
          }),
        },
      };
    };

    const result = await downloadRemoteImage('https://example.com/image.jpg');

    expect(attempts).to.equal(3);
    expect(result).to.deep.equal(Buffer.from([0xff, 0xd8, 0xff]));
  });

  it('skips an account at the configured quota threshold', async () => {
    cloudinary.api.usage = async () => ({
      credits: {
        usage: cloudinary.config().cloud_name === 'cloud-one' ? 20 : 0.1,
        limit: 25,
      },
    });

    const account = await getCloudinaryUploadAccount();
    expect(account).to.include({ id: '2', cloudName: 'cloud-two' });
  });

  it('does not upload to an account at the quota threshold', async () => {
    let uploadedAccount;
    cloudinary.api.usage = async () => ({
      credits: {
        usage: cloudinary.config().cloud_name === 'cloud-one' ? 20 : 0.1,
        limit: 25,
      },
    });
    cloudinary.uploader.upload_stream = (options, callback) => {
      uploadedAccount = cloudinary.config().cloud_name;
      queueMicrotask(() => callback(null, {
        resource_type: 'image',
        width: 50,
        height: 50,
        bytes: 12,
        format: 'jpg',
        public_id: 'laptop-store/users/quota-test',
        secure_url: `https://res.cloudinary.com/${uploadedAccount}/image/upload/laptop-store/users/quota-test.jpg`,
      }));
      return { end: () => {} };
    };

    const buffer = Buffer.alloc(12);
    buffer.set([0xff, 0xd8, 0xff]);
    const result = await uploadToCloudinary(buffer, 'users');

    expect(uploadedAccount).to.equal('cloud-two');
    expect(result.cloudinaryAccountId).to.equal('2');
  });
});
