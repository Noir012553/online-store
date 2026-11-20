const crypto = require('crypto');
const ProviderRuntimeConfiguration = require('../models/ProviderRuntimeConfiguration');
const PaymentMethod = require('../models/PaymentMethod');

const DEFAULT_ENDPOINT = 'https://sandbox.vnpayment.vn/paygate';

const encryptionKey = () => {
  const value = process.env.PROVIDER_CONFIG_ENCRYPTION_KEY;
  if (!value || !/^[a-f0-9]{64}$/i.test(value)) throw new Error('PROVIDER_CONFIG_STORE_UNAVAILABLE');
  return Buffer.from(value, 'hex');
};

const encryptSecret = (value) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return { iv: iv.toString('base64'), ciphertext: ciphertext.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
};

const decryptSecret = (value) => {
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(value.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(value.ciphertext, 'base64')), decipher.final()]).toString('utf8');
};

const loadVnpayRuntimeConfig = async () => {
  const stored = await ProviderRuntimeConfiguration.findOne({ providerCode: 'vnpay' }).lean();
  const storedValues = stored?.values || {};
  const encryptedSecrets = stored?.encryptedSecrets || {};
  const paymentMethod = await PaymentMethod.findOne({ code: 'vnpay' }).select('isEnabled').lean();
  const resolve = (key, envKey = key, fallback = '') => {
    if (Object.hasOwn(storedValues, key)) return { value: String(storedValues[key]), source: 'database' };
    if (process.env[envKey]) return { value: process.env[envKey], source: 'environment' };
    return { value: fallback, source: fallback ? 'runtime-default' : 'unset' };
  };
  const resolveSecret = (key, envKey = key) => {
    if (encryptedSecrets[key]) return { value: decryptSecret(encryptedSecrets[key]), source: 'database' };
    if (process.env[envKey]) return { value: process.env[envKey], source: 'environment' };
    return { value: '', source: 'unset' };
  };

  const values = {
    VNPAY_TMN_CODE: resolve('VNPAY_TMN_CODE'),
    VNPAY_HASH_SECRET: resolveSecret('VNPAY_HASH_SECRET'),
    VNPAY_ENDPOINT: resolve('VNPAY_ENDPOINT', 'VNPAY_ENDPOINT', DEFAULT_ENDPOINT),
    VNPAY_RETURN_URL: resolve('VNPAY_RETURN_URL'),
    VNPAY_CALLBACK_URL: resolve('VNPAY_CALLBACK_URL'),
    VNPAY_CHECKOUT_ENABLED: Object.hasOwn(storedValues, 'VNPAY_CHECKOUT_ENABLED')
      ? { value: Boolean(storedValues.VNPAY_CHECKOUT_ENABLED), source: 'database' }
      : { value: Boolean(paymentMethod?.isEnabled), source: 'database' },
  };

  return {
    config: {
      partnerId: values.VNPAY_TMN_CODE.value,
      partnerKey: values.VNPAY_HASH_SECRET.value,
      endpoint: values.VNPAY_ENDPOINT.value,
      returnUrl: values.VNPAY_RETURN_URL.value,
      callbackUrl: values.VNPAY_CALLBACK_URL.value,
    },
    values,
    checkoutEnabled: values.VNPAY_CHECKOUT_ENABLED.value,
    version: stored?.version || 0,
    storeAvailable: /^[a-f0-9]{64}$/i.test(process.env.PROVIDER_CONFIG_ENCRYPTION_KEY || ''),
    configuredSecrets: encryptedSecrets.VNPAY_HASH_SECRET || process.env.VNPAY_HASH_SECRET ? ['VNPAY_HASH_SECRET'] : [],
  };
};

module.exports = { encryptSecret, loadVnpayRuntimeConfig };
