const dns = require('dns');
const { dnsServers } = require('./mongoConfig');

let configured = false;

const isSrvUri = mongoUri => typeof mongoUri === 'string' && mongoUri.startsWith('mongodb+srv://');

const configureMongoDns = async mongoUri => {
  if (configured || !isSrvUri(mongoUri)) {
    return;
  }

  dns.setDefaultResultOrder('ipv4first');

  const hostname = new URL(mongoUri).hostname;
  const srvRecord = `_mongodb._tcp.${hostname}`;

  try {
    await dns.promises.resolveSrv(srvRecord);
    configured = true;
    return;
  } catch (systemResolverError) {
    const fallbackServers = dnsServers;
    if (fallbackServers.length === 0) {
      throw new Error(`MongoDB SRV DNS lookup failed with system resolver: ${systemResolverError.message}`);
    }

    dns.setServers(fallbackServers);

    try {
      await dns.promises.resolveSrv(srvRecord);
      configured = true;
      console.warn(`[DB_DNS] System DNS failed; using configured fallback DNS: ${fallbackServers.join(', ')}`);
    } catch (fallbackResolverError) {
      throw new Error(
        `MongoDB SRV DNS lookup failed with system resolver (${systemResolverError.message}) and fallback resolver (${fallbackResolverError.message})`
      );
    }
  }
};

module.exports = { configureMongoDns };
