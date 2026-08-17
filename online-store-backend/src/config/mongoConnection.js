const mongoose = require('mongoose');
const { configureMongoDns } = require('./mongoDns');
const { mongooseOptions } = require('./mongoConfig');

const isMongoDebugEnabled = ['1', 'true', 'yes'].includes(
  String(process.env.MONGO_DEBUG || '').toLowerCase(),
);

const getMongoState = () => ({
  readyState: mongoose.connection.readyState,
  readyStateName: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown',
  name: mongoose.connection.name || null,
  host: mongoose.connection.host || null,
  port: mongoose.connection.port || null,
});

const mongoDebug = (event, details = {}) => {
  if (isMongoDebugEnabled) {
    console.log(`[MONGO_DEBUG] ${event}`, { ...getMongoState(), ...details });
  }
};

let mongoDebugListenersAttached = false;
const attachMongoDebugListeners = () => {
  if (!isMongoDebugEnabled || mongoDebugListenersAttached) return;
  mongoDebugListenersAttached = true;
  mongoose.connection.on('connected', () => mongoDebug('event:connected'));
  mongoose.connection.on('reconnected', () => mongoDebug('event:reconnected'));
  mongoose.connection.on('disconnected', () => mongoDebug('event:disconnected'));
  mongoose.connection.on('error', error => mongoDebug('event:error', {
    errorName: error.name,
    errorMessage: error.message,
  }));
};

const connectMongo = async mongoUri => {
  const uri = mongoUri || process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MONGO_URI environment variable is not set');
  }

  attachMongoDebugListeners();
  mongoDebug('connect:start', { hasUri: Boolean(uri) });
  await configureMongoDns(uri);
  mongoDebug('connect:dns-ready');
  await mongoose.connect(uri, mongooseOptions);
  mongoDebug('connect:mongoose-resolved');
  await mongoose.connection.asPromise();
  mongoDebug('connect:ready');
  return mongoose.connection;
};

module.exports = { connectMongo, getMongoState, mongoDebug };
