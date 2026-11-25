const ROUTER_TOKEN_MIN_LENGTH = 16;

const { getDeploymentRouterConfig } = require('./deploymentRouterConfigService');

const getRouterOrigin = (value) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error('DEPLOYMENT_ROUTER_NOT_CONFIGURED');
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('DEPLOYMENT_ROUTER_NOT_CONFIGURED');
  }
  const allowLocalHttp = process.env.NODE_ENV !== 'production'
    && ['localhost', '127.0.0.1'].includes(parsed.hostname);
  if ((parsed.protocol !== 'https:' && !(allowLocalHttp && parsed.protocol === 'http:'))
    || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('DEPLOYMENT_ROUTER_NOT_CONFIGURED');
  }
  return parsed.origin;
};

const callDeploymentRouter = async (path, options = {}) => {
  const config = await getDeploymentRouterConfig();
  const token = config.controlToken;
  if (typeof token !== 'string' || token.length < ROUTER_TOKEN_MIN_LENGTH) {
    throw new Error('DEPLOYMENT_ROUTER_NOT_CONFIGURED');
  }

  const response = await fetch(`${getRouterOrigin(config.routerUrl)}${path}`, {
    method: options.method || 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(8000),
    redirect: 'error',
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error('DEPLOYMENT_ROUTER_AUTH_FAILED');
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('DEPLOYMENT_ROUTER_BAD_RESPONSE');
  }
  return { status: response.status, data };
};

module.exports = { callDeploymentRouter };
