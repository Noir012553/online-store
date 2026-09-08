const chai = require('chai');
const expect = chai.expect;
const cloudinary = require('cloudinary').v2;

const envKeys = [
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'CLOUDINARY_CLOUD_NAME_2',
  'CLOUDINARY_API_KEY_2',
  'CLOUDINARY_API_SECRET_2',
];
const originalEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
const originalUploadStream = cloudinary.uploader.upload_stream;

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
} = require('../services/cloudinaryService');

describe('Cloudinary account rotation', () => {
  after(() => {
    cloudinary.uploader.upload_stream = originalUploadStream;
    envKeys.forEach(key => {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    });
  });

  it('selects the next configured account when the first is excluded', () => {
    expect(getCloudinaryUploadAccount(['1'])).to.include({ id: '2', cloudName: 'cloud-two' });
  });

  it('resolves an account from a Cloudinary delivery URL', () => {
    expect(getCloudinaryAccountIdForUrl(
      'https://res.cloudinary.com/cloud-two/image/upload/laptop-store/users/example.jpg',
    )).to.equal('2');
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
});
