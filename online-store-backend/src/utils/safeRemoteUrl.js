const net = require('net');
const dns = require('dns').promises;

const MAX_REDIRECTS = 3;

const createRemoteUrlError = (code, details = {}) => {
  const error = new Error(code);
  error.errorCode = code;
  error.statusCode = 502;
  error.details = details;
  return error;
};

const normalizeIp = value => value.replace(/^\[|\]$/g, '').split('%')[0].toLowerCase();

const isBlockedIpv4 = value => {
  const octets = value.split('.').map(Number);
  if (octets.length !== 4 || octets.some(octet => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }
  const [first, second] = octets;
  return first === 0
    || first === 10
    || first === 127
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168);
};

const isBlockedIp = value => {
  const normalized = normalizeIp(value);
  const mappedIpv4 = normalized.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mappedIpv4) return isBlockedIpv4(mappedIpv4[1]);
  if (net.isIP(normalized) === 4) return isBlockedIpv4(normalized);
  if (net.isIP(normalized) !== 6) return false;

  return normalized === '::'
    || normalized === '::1'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || /^(?:fe[89ab])/.test(normalized)
    || normalized.startsWith('ff');
};

const isBlockedHostname = hostname => {
  const normalized = hostname.toLowerCase().replace(/\.$/, '');
  return normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized.endsWith('.local')
    || normalized.endsWith('.internal')
    || normalized === 'metadata.google.internal'
    || normalized === 'host.docker.internal';
};

const shouldResolveDns = () => process.env.NODE_ENV === 'production'
  || process.env.ENFORCE_EXPORT_IMAGE_DNS_SECURITY === 'true';

const validateSafeRemoteUrl = async source => {
  let parsedUrl;
  try {
    parsedUrl = source instanceof URL ? new URL(source.toString()) : new URL(String(source));
  } catch {
    throw createRemoteUrlError('EXPORT_IMAGE_URL_INVALID');
  }

  const allowHttp = process.env.EXPORT_IMAGE_ALLOW_HTTP === 'true' && process.env.NODE_ENV !== 'production';
  if ((parsedUrl.protocol !== 'https:' && !(allowHttp && parsedUrl.protocol === 'http:'))
    || parsedUrl.username
    || parsedUrl.password
    || isBlockedHostname(parsedUrl.hostname)
    || isBlockedIp(parsedUrl.hostname)) {
    throw createRemoteUrlError('EXPORT_IMAGE_URL_INVALID', { host: parsedUrl.hostname });
  }

  if (shouldResolveDns() && net.isIP(parsedUrl.hostname) === 0) {
    let addresses;
    try {
      addresses = await dns.lookup(parsedUrl.hostname, { all: true, verbatim: true });
    } catch {
      throw createRemoteUrlError('EXPORT_IMAGE_HOST_UNRESOLVED', { host: parsedUrl.hostname });
    }
    if (!addresses.length || addresses.some(address => isBlockedIp(address.address))) {
      throw createRemoteUrlError('EXPORT_IMAGE_URL_INVALID', { host: parsedUrl.hostname });
    }
  }

  return parsedUrl;
};

const fetchSafeRemoteImage = async (source, options = {}) => {
  let currentUrl = await validateSafeRemoteUrl(source);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const response = await fetch(currentUrl, {
      ...options,
      redirect: 'manual',
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;

    if (response.body) await response.body.cancel().catch(() => {});
    const location = response.headers.get('location');
    if (!location || redirectCount === MAX_REDIRECTS) {
      throw createRemoteUrlError('EXPORT_IMAGE_REDIRECT_INVALID', { host: currentUrl.hostname });
    }
    try {
      currentUrl = await validateSafeRemoteUrl(new URL(location, currentUrl));
    } catch (error) {
      if (error.errorCode) throw error;
      throw createRemoteUrlError('EXPORT_IMAGE_REDIRECT_INVALID');
    }
  }

  throw createRemoteUrlError('EXPORT_IMAGE_REDIRECT_INVALID');
};

module.exports = {
  MAX_REDIRECTS,
  isBlockedIp,
  isBlockedHostname,
  validateSafeRemoteUrl,
  fetchSafeRemoteImage,
};
