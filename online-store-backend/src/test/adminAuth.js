const axios = require('axios');
const { adminToken, adminEmail, adminPassword } = require('./test-config');

let cachedToken = adminToken;

const getAdminToken = async (baseUrl, timeoutMs = 30_000) => {
  if (cachedToken) return cachedToken;
  if (!adminEmail || !adminPassword) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD or TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD are required');
  }

  const response = await axios.post(
    `${baseUrl.replace(/\/+$/, '')}/api/users/login`,
    { email: adminEmail, password: adminPassword },
    { timeout: timeoutMs, validateStatus: () => true },
  );

  if (response.status !== 200) {
    throw new Error(`Admin login failed with status ${response.status}`);
  }

  cachedToken = response.data?.accessToken || response.data?.token;
  if (!cachedToken) throw new Error('Admin login response did not include an access token');
  return cachedToken;
};

const getAuthHeaders = token => ({ Authorization: `Bearer ${token}` });

module.exports = { getAdminToken, getAuthHeaders };
