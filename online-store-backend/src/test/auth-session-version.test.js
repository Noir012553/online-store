const assert = require('node:assert/strict');
process.env.JWT_SECRET ||= 'auth_session_version_test_secret';
process.env.JWT_ACCESS_SECRET ||= process.env.JWT_SECRET;
process.env.JWT_REFRESH_SECRET ||= 'auth_session_version_refresh_test_secret';
const jwt = require('jsonwebtoken');
const { generateAccessToken, generateTokenPair, ACCESS_TOKEN_SECRET, REFRESH_TOKEN_SECRET } = require('../utils/generateToken');

test('new access and refresh tokens carry the account session version', () => {
  const pair = generateTokenPair('user-1', 'admin', 'version-2');
  const access = jwt.verify(pair.accessToken, ACCESS_TOKEN_SECRET);
  const refresh = jwt.verify(pair.refreshToken, REFRESH_TOKEN_SECRET);

  assert.equal(access.authVersion, 'version-2');
  assert.equal(refresh.authVersion, 'version-2');
  assert.equal(access.role, undefined);
});

test('legacy access tokens cannot match the current session version', () => {
  const legacyToken = generateAccessToken('user-1');
  const decoded = jwt.verify(legacyToken, ACCESS_TOKEN_SECRET);

  assert.equal(decoded.authVersion, '0');
  assert.notEqual(decoded.authVersion, 'version-2');
});
