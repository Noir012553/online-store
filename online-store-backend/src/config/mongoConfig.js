const parseDnsServers = value => value
  ?.split(',')
  .map(server => server.trim())
  .filter(Boolean) || [];

const mongooseOptions = Object.freeze({
  maxPoolSize: 10,
  minPoolSize: 5,
  serverSelectionTimeoutMS: 20000,
  socketTimeoutMS: 60000,
  connectTimeoutMS: 20000,
  retryWrites: true,
  w: 'majority',
  family: 4,
});

module.exports = {
  dnsServers: parseDnsServers(process.env.MONGO_DNS_SERVERS),
  mongooseOptions,
};
