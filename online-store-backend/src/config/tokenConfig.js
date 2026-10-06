const tokenConfig = {
  algorithm: process.env.JWT_ALGORITHM || 'HS256',
  access: {
    secret: process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET,
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '60m',
  },
  refresh: {
    secret: process.env.JWT_REFRESH_SECRET,
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    cookieMaxAgeMs: Number(process.env.JWT_REFRESH_COOKIE_MAX_AGE_MS) || 7 * 24 * 60 * 60 * 1000,
  },
};

if (!tokenConfig.access.secret) {
  throw new Error('JWT access secret is not configured');
}

if (!tokenConfig.refresh.secret) {
  throw new Error('JWT refresh secret is not configured');
}

if (tokenConfig.algorithm !== 'HS256') {
  throw new Error('Unsupported JWT algorithm');
}

module.exports = tokenConfig;
