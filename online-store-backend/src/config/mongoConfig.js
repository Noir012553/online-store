const parseDnsServers = value => value
  ?.split(',')
  .map(server => server.trim())
  .filter(Boolean) || [];

const getMongoTimeout = (environmentKey, fallback) => {
  const configured = Number(process.env[environmentKey]);
  return Number.isFinite(configured) && configured > 0 ? configured : fallback;
};

const mongooseOptions = Object.freeze({
  maxPoolSize: 10,
  minPoolSize: 5,
  serverSelectionTimeoutMS: getMongoTimeout('MONGO_SERVER_SELECTION_TIMEOUT_MS', 30000),
  socketTimeoutMS: getMongoTimeout('MONGO_SOCKET_TIMEOUT_MS', 180000),
  connectTimeoutMS: getMongoTimeout('MONGO_CONNECT_TIMEOUT_MS', 30000),
  retryWrites: true,
  w: 'majority',
  family: 4,
});

module.exports = {
  dnsServers: parseDnsServers(process.env.MONGO_DNS_SERVERS),
  mongooseOptions,
};
