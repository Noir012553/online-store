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

  const fallbackServers = dnsServers;
  if (fallbackServers.length > 0) {
    dns.setServers(fallbackServers);
  }

  try {
    await dns.promises.resolveSrv(srvRecord);
    configured = true;
    if (fallbackServers.length > 0) {
      console.warn(`[DB_DNS] Using configured DNS servers: ${fallbackServers.join(', ')}`);
    }
    return;
  } catch (resolverError) {
    if (fallbackServers.length > 0) {
      throw new Error(`MongoDB SRV DNS lookup failed with configured resolver (${resolverError.message})`);
    }

    throw new Error(`MongoDB SRV DNS lookup failed with system resolver: ${resolverError.message}`);
  }
};

module.exports = { configureMongoDns };
