const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const axios = require('axios');
const mongoose = require('mongoose');
const User = require('../models/User');
const Category = require('../models/Category');
const Product = require('../models/Product');

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const getFreePort = () => new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const { port } = probe.address();
    probe.close((error) => (error ? reject(error) : resolve(port)));
  });
});

const getDatabaseName = () => `online_store_test_${process.pid}_${Date.now()}`;

const buildIsolatedMongoUri = (sourceUri) => {
  const uri = new URL(sourceUri);
  uri.pathname = `/${getDatabaseName()}`;
  return uri.toString();
};

const isReady = async (baseUrl, timeoutMs) => {
  try {
    const response = await axios.get(`${baseUrl}/readyz`, {
      timeout: Math.min(timeoutMs, 1500),
      validateStatus: () => true,
    });
    return response.status === 200;
  } catch (error) {
    return false;
  }
};

const waitForReady = async (baseUrl, timeoutMs) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isReady(baseUrl, timeoutMs)) return;
    await wait(250);
  }
  throw new Error(`Backend did not become ready at ${baseUrl} within ${timeoutMs}ms`);
};

const createAdminSession = async ({ baseUrl, email, password, timeoutMs }) => {
  if (!email || !password) {
    throw new Error('Missing TEST_ADMIN_EMAIL or TEST_ADMIN_PASSWORD for admin login setup');
  }

  let user = await User.findOne({ email: email.trim().toLowerCase() });
  let createdUser = false;
  if (!user) {
    user = await User.create({
      username: `integration-admin-${process.pid}-${Date.now()}`,
      name: 'Integration Test Admin',
      email,
      role: 'admin',
      password,
      provider: 'local',
      isDeleted: false,
    });
    createdUser = true;
  } else if (!['admin', 'super-admin'].includes(user.role)) {
    throw new Error(`TEST_ADMIN_EMAIL must belong to an admin account, received role ${user.role}`);
  }

  let response;
  try {
    response = await axios.post(
      `${baseUrl}/api/users/login`,
      { email, password },
      { timeout: timeoutMs, validateStatus: () => true },
    );
  } catch (error) {
    if (createdUser) await User.deleteOne({ _id: user._id });
    throw error;
  }
  if (response.status !== 200) {
    if (createdUser) await User.deleteOne({ _id: user._id });
    throw new Error(`Admin login failed with status ${response.status}`);
  }

  const token = response.data.accessToken || response.data.token;
  if (!token) {
    if (createdUser) await User.deleteOne({ _id: user._id });
    throw new Error('Admin login response did not include an access token');
  }

  return {
    token,
    userId: user._id,
    email: user.email,
    createdUser,
  };
};

const createProductFixture = async (ownerId) => {
  let fixtureOwnerId = ownerId;
  let ownedUserId = null;
  if (!fixtureOwnerId) {
    const email = `integration-owner-${process.pid}-${Date.now()}@test.invalid`;
    const owner = await User.create({
      username: email,
      name: 'Integration Fixture Owner',
      email,
      role: 'user',
      password: null,
      provider: 'local',
      isDeleted: false,
    });
    fixtureOwnerId = owner._id;
    ownedUserId = owner._id;
  }

  const suffix = `${process.pid}-${Date.now()}`;
  const category = await Category.create({
    name: `Integration Category ${suffix}`,
    key: `integration-category-${suffix}`,
    description: 'Integration test category',
    icon: 'Laptop',
  });
  const product = await Product.create({
    user: fixtureOwnerId,
    name: `Integration Product ${suffix}`,
    image: '/uploads/integration-test.jpg',
    brand: 'Integration Brand',
    category: category._id,
    description: 'Integration test product',
    specs: {},
    price: 100000,
    baseCurrencyCode: 'VND',
    countInStock: 10,
    featured: true,
    storefrontReady: true,
  });

  return {
    productId: product._id.toString(),
    cleanup: async () => {
      await Product.deleteOne({ _id: product._id });
      await Category.deleteOne({ _id: category._id });
      if (ownedUserId) await User.deleteOne({ _id: ownedUserId });
    },
  };
};

const startIntegrationEnvironment = async ({
  configuredBaseUrl,
  configuredMongoUri,
  configuredAdminToken,
  configuredAdminEmail = process.env.TEST_ADMIN_EMAIL,
  configuredAdminPassword = process.env.TEST_ADMIN_PASSWORD,
  timeoutMs = 30_000,
} = {}) => {
  if (!configuredMongoUri) {
    throw new Error('Missing TEST_MONGO_URI or MONGO_URI for integration setup');
  }

  const existingBaseUrl = configuredBaseUrl || 'http://127.0.0.1:5000';
  if (await isReady(existingBaseUrl, timeoutMs)) {
    if (!process.env.TEST_MONGO_URI) {
      throw new Error('TEST_MONGO_URI is required when using an existing backend server');
    }
    await mongoose.connect(configuredMongoUri);
    try {
      const admin = configuredAdminToken
        ? { token: configuredAdminToken, userId: null, createdUser: false }
        : await createAdminSession({
          baseUrl: existingBaseUrl,
          email: configuredAdminEmail,
          password: configuredAdminPassword,
          timeoutMs,
        });
      const fixture = await createProductFixture(admin.userId);
      return {
        baseUrl: existingBaseUrl,
        mongoUri: configuredMongoUri,
        adminToken: admin.token,
        productId: fixture.productId,
        cleanup: async () => {
          await fixture.cleanup();
          if (admin.createdUser) await User.deleteOne({ _id: admin.userId });
          await mongoose.disconnect();
        },
      };
    } catch (error) {
      await mongoose.disconnect();
      throw error;
    }
  }

  const isolatedMongoUri = buildIsolatedMongoUri(configuredMongoUri);
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const accessSecret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
  const refreshSecret = process.env.JWT_REFRESH_SECRET;
  if (!accessSecret || !refreshSecret) {
    throw new Error('Missing JWT_ACCESS_SECRET/JWT_REFRESH_SECRET for isolated backend setup');
  }
  const childEnv = {
    ...process.env,
    NODE_ENV: 'test',
    PORT: String(port),
    MONGO_URI: isolatedMongoUri,
    TEST_MONGO_URI: isolatedMongoUri,
    JWT_ACCESS_SECRET: accessSecret,
    JWT_REFRESH_SECRET: refreshSecret,
    EXPORT_STORAGE: 'local',
    EXPORT_JOB_DIR: path.join(process.cwd(), '.test-export-jobs'),
  };
  const child = spawn(process.execPath, [path.resolve(__dirname, '../app.js')], {
    cwd: path.resolve(__dirname, '..', '..'),
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });

  try {
    await waitForReady(baseUrl, timeoutMs);
    await mongoose.connect(isolatedMongoUri);
    const admin = await createAdminSession({
      baseUrl,
      email: configuredAdminEmail,
      password: configuredAdminPassword,
      timeoutMs,
    });
    const fixture = await createProductFixture(admin.userId);

    return {
      baseUrl,
      mongoUri: isolatedMongoUri,
      adminToken: admin.token,
      productId: fixture.productId,
      cleanup: async () => {
        await fixture.cleanup();
        if (mongoose.connection.readyState === 1) {
          await mongoose.connection.dropDatabase();
          await mongoose.disconnect();
        }
        if (!child.killed) child.kill('SIGTERM');
      },
    };
  } catch (error) {
    if (!child.killed) child.kill('SIGTERM');
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
    const details = output.trim().split(/\r?\n/).slice(-12).join('\n');
    throw new Error(`${error.message}${details ? `\n${details}` : ''}`);
  }
};

module.exports = {
  startIntegrationEnvironment,
};
