const assert = require('node:assert/strict');
const test = require('node:test');
const { createDeploymentCandidateReadOnlyMiddleware } = require('../middleware/deploymentCandidateReadOnly');

function runMiddleware(candidateReadOnly, method, path) {
  const response = { headers: {}, statusCode: 200, body: null };
  response.set = (name, value) => { response.headers[name] = value; return response; };
  response.status = (statusCode) => { response.statusCode = statusCode; return response; };
  response.json = (body) => { response.body = body; return response; };
  let continued = false;

  createDeploymentCandidateReadOnlyMiddleware(candidateReadOnly)(
    { method, path },
    response,
    () => { continued = true; },
  );

  return { response, continued };
}

for (const [method, path] of [
  ['POST', '/contact'],
  ['POST', '/health/cloudflare/stats/reset'],
  ['GET', '/payments/webhook/vnpay'],
  ['POST', '/payments/webhook/vnpay'],
  ['GET', '/payments/vnpay-api/webhook/vnpay'],
  ['POST', '/payments/vnpay-api/webhook/vnpay'],
]) {
  test(`candidate mode blocks ${method} ${path}`, () => {
    const { response, continued } = runMiddleware(true, method, path);

    assert.equal(continued, false);
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.body, { success: false, code: 'CANDIDATE_READ_ONLY' });
  });
}

test('candidate mode allows deployment control POSTs and ordinary reads', () => {
  for (const [method, path] of [
    ['POST', '/admin/deployment/preflight'],
    ['GET', '/products'],
    ['HEAD', '/products'],
    ['OPTIONS', '/products'],
  ]) {
    const { response, continued } = runMiddleware(true, method, path);
    assert.equal(continued, true);
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['Cache-Control'], 'no-store');
  }
});

test('normal deployments continue through the API middleware', () => {
  const { continued } = runMiddleware(false, 'POST', '/payments/webhook/vnpay');
  assert.equal(continued, true);
});
