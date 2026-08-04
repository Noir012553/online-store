const mongoose = require('mongoose');
const { configureMongoDns } = require('./mongoDns');
const { mongooseOptions } = require('./mongoConfig');

const connectMongo = async mongoUri => {
  const uri = mongoUri || process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MONGO_URI environment variable is not set');
  }

  await configureMongoDns(uri);
  return mongoose.connect(uri, mongooseOptions);
};

module.exports = { connectMongo };
