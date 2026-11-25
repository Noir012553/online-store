const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === './deploymentRouterConfigService' && parent?.filename.endsWith('/deploymentRouterService.js')) {
    return { getDeploymentRouterConfig: async () => ({
      routerUrl: process.env.DEPLOYMENT_ROUTER_URL || '',
      controlToken: process.env.DEPLOYMENT_CONTROL_TOKEN || '',
    }) };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const { callDeploymentRouter } = require('../services/deploymentRouterService');
Module._load = originalLoad;
const originalUrl = process.env.DEPLOYMENT_ROUTER_URL;
const originalToken = process.env.DEPLOYMENT_CONTROL_TOKEN;
const originalNodeEnv = process.env.NODE_ENV;
const originalFetch = global.fetch;

test.after(() => {
  if (originalUrl === undefined) delete process.env.DEPLOYMENT_ROUTER_URL;
  else process.env.DEPLOYMENT_ROUTER_URL = originalUrl;
  if (originalToken === undefined) delete process.env.DEPLOYMENT_CONTROL_TOKEN;
  else process.env.DEPLOYMENT_CONTROL_TOKEN = originalToken;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  global.fetch = originalFetch;
});

test('deployment router requests require a configured HTTPS origin and strong token', async () => {
  delete process.env.DEPLOYMENT_ROUTER_URL;
  process.env.DEPLOYMENT_CONTROL_TOKEN = 'a-control-token-that-is-long-enough';
  await assert.rejects(callDeploymentRouter('/__deployment/status'), { message: 'DEPLOYMENT_ROUTER_NOT_CONFIGURED' });

  process.env.DEPLOYMENT_ROUTER_URL = 'https://user:password@router.example';
  await assert.rejects(callDeploymentRouter('/__deployment/status'), { message: 'DEPLOYMENT_ROUTER_NOT_CONFIGURED' });
});

test('deployment router adapter keeps token server-side and sends fixed JSON requests', async () => {
  process.env.NODE_ENV = 'production';
  process.env.DEPLOYMENT_ROUTER_URL = 'https://router.example';
  process.env.DEPLOYMENT_CONTROL_TOKEN = 'a-control-token-that-is-long-enough';
  global.fetch = async (url, options) => {
    assert.equal(url, 'https://router.example/__deployment/preflight');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.authorization, `Bearer ${process.env.DEPLOYMENT_CONTROL_TOKEN}`);
    assert.deepEqual(JSON.parse(options.body), { mode: 'vercel-render' });
    return Response.json({ mode: 'vercel-render', passed: true });
  };

  const result = await callDeploymentRouter('/__deployment/preflight', {
    method: 'POST', body: { mode: 'vercel-render' },
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.data, { mode: 'vercel-render', passed: true });
});
