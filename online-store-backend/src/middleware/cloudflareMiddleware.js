const { sendApiError } = require('./errorMiddleware');

const validateCloudflareCredentials = (req, res, next) => {
  try {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;

    if (!accountId || !apiToken) {
      return sendApiError(
        res,
        req,
        503,
        'CLOUDFLARE_AI_NOT_CONFIGURED',
        'common.error_server_desc',
        { service: 'cloudflare-ai' }
      );
    }

    next();
  } catch (error) {
    sendApiError(res, req, 500, 'CLOUDFLARE_REQUEST_FAILED');
  }
};

module.exports = { validateCloudflareCredentials };
