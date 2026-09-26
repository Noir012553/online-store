const chai = require('chai');
const expect = chai.expect;
const sinon = require('sinon');
const axios = require('axios');
const cloudflareAiService = require('../services/cloudflareAiService');

const createConfig = (index) => ({
  index,
  accountId: `account-${index}`,
  apiToken: `token-${index}`,
  model: '@cf/meta/llama-3-8b-instruct',
  baseUrl: `https://example.invalid/${index}`,
  requestCount: 0,
  errorCount: 0,
  lastError: null,
  lastErrorTime: null,
});

const providerError = ({ status, message = 'Provider request failed' } = {}) => Object.assign(
  new Error(message),
  status === undefined ? {} : { response: { status, data: { errors: [{ message }] } } },
);

describe('Cloudflare AI rotation', () => {
  let sandbox;
  let originalConfigs;
  let originalConfigIndex;
  let originalLastConfigIndex;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    originalConfigs = cloudflareAiService.configs;
    originalConfigIndex = cloudflareAiService.configIndex;
    originalLastConfigIndex = cloudflareAiService.lastConfigIndex;
    cloudflareAiService.configs = [createConfig(1), createConfig(2)];
    cloudflareAiService.configIndex = 0;
    cloudflareAiService.lastConfigIndex = null;
    cloudflareAiService.configs.forEach((config) => Object.assign(config, {
      cooldownUntil: 0,
      rateLimitCount: 0,
      runningRequests: 0,
    }));
    sandbox.stub(cloudflareAiService, 'throttle').resolves();
  });

  afterEach(() => {
    sandbox.restore();
    cloudflareAiService.configs = originalConfigs;
    cloudflareAiService.configIndex = originalConfigIndex;
    cloudflareAiService.lastConfigIndex = originalLastConfigIndex;
  });

  it('fails closed when the free-tier AI guard is not explicitly enabled and budgeted', async () => {
    const original = {
      CLOUDFLARE_AI_ENABLED: process.env.CLOUDFLARE_AI_ENABLED,
      CLOUDFLARE_AI_MAX_REQUESTS_PER_DAY: process.env.CLOUDFLARE_AI_MAX_REQUESTS_PER_DAY,
      CLOUDFLARE_AI_MAX_INPUT_CHARS_PER_DAY: process.env.CLOUDFLARE_AI_MAX_INPUT_CHARS_PER_DAY,
    };
    delete process.env.CLOUDFLARE_AI_ENABLED;
    delete process.env.CLOUDFLARE_AI_MAX_REQUESTS_PER_DAY;
    delete process.env.CLOUDFLARE_AI_MAX_INPUT_CHARS_PER_DAY;
    try {
      await cloudflareAiService.translate('Nội dung', 'vi', 'en');
      expect.fail('Expected Cloudflare AI to be disabled');
    } catch (error) {
      expect(error.message).to.equal('CLOUDFLARE_AI_DISABLED');
    } finally {
      Object.entries(original).forEach(([key, value]) => {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      });
    }
  });

  it('sends an explicit output token limit to prevent truncated translations', async () => {
    const original = {
      CLOUDFLARE_AI_ENABLED: process.env.CLOUDFLARE_AI_ENABLED,
      CLOUDFLARE_AI_MAX_REQUESTS_PER_DAY: process.env.CLOUDFLARE_AI_MAX_REQUESTS_PER_DAY,
      CLOUDFLARE_AI_MAX_INPUT_CHARS_PER_DAY: process.env.CLOUDFLARE_AI_MAX_INPUT_CHARS_PER_DAY,
      CLOUDFLARE_AI_MAX_TOKENS: process.env.CLOUDFLARE_AI_MAX_TOKENS,
    };
    process.env.CLOUDFLARE_AI_ENABLED = 'true';
    process.env.CLOUDFLARE_AI_MAX_REQUESTS_PER_DAY = '1';
    process.env.CLOUDFLARE_AI_MAX_INPUT_CHARS_PER_DAY = '10000';
    process.env.CLOUDFLARE_AI_MAX_TOKENS = '1536';
    sandbox.stub(axios, 'post').resolves({
      data: { success: true, result: { response: 'Bản dịch đầy đủ.' } },
    });

    try {
      await cloudflareAiService._doTranslate('Nội dung', 'vi', 'en', null, 0, 0, new Set(), true);
      expect(axios.post.firstCall.args[1].max_tokens).to.equal(1536);
    } finally {
      Object.entries(original).forEach(([key, value]) => {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      });
    }
  });

  it('tries each configuration once then stops on HTTP 420', async () => {
    const error = providerError({ status: 420, message: 'Rate limit exceeded' });
    sandbox.stub(axios, 'post').rejects(error);

    try {
      await cloudflareAiService._doTranslate('Nội dung', 'vi', 'en', null, 0, 0);
      expect.fail('Expected the provider error to be thrown');
    } catch (caughtError) {
      expect(caughtError).to.equal(error);
    }

    expect(axios.post.callCount).to.equal(2);
    expect(cloudflareAiService.configs.map(({ errorCount }) => errorCount)).to.deep.equal([1, 1]);
  });

  it('stops retrying after every key has been rate limited', async () => {
    const error = providerError({ status: 429, message: 'Rate limit exceeded' });
    sandbox.stub(axios, 'post').rejects(error);
    sandbox.stub(global, 'setTimeout').callsFake((callback) => {
      callback();
      return 0;
    });

    try {
      await cloudflareAiService._doTranslate('Nội dung', 'vi', 'en', null, 3, 1);
      expect.fail('Expected all Cloudflare keys to be cooling down');
    } catch (caughtError) {
      expect(caughtError).to.equal(error);
      expect(caughtError.cloudflarePoolExhausted).to.equal(true);
    }

    expect(axios.post.callCount).to.equal(2);
    expect(cloudflareAiService.configs.map(({ errorCount }) => errorCount)).to.deep.equal([1, 1]);
  });

  it('uses the next healthy key without retrying the limited key', async () => {
    const error = providerError({ status: 429, message: 'Rate limit exceeded' });
    sandbox.stub(axios, 'post')
      .onFirstCall().rejects(error)
      .onSecondCall().resolves({ data: { success: true, result: { response: 'Translated' } } });

    const translated = await cloudflareAiService._doTranslate('Nội dung', 'vi', 'en', null, 0, 0);

    expect(translated).to.equal('Translated');
    expect(axios.post.firstCall.args[0]).to.equal('https://example.invalid/1');
    expect(axios.post.secondCall.args[0]).to.equal('https://example.invalid/2');
    expect(cloudflareAiService.configs.map(({ errorCount }) => errorCount)).to.deep.equal([1, 0]);
    expect(cloudflareAiService.configs.map(({ requestCount }) => requestCount)).to.deep.equal([0, 1]);
    expect(cloudflareAiService.configs[0].cooldownUntil).to.be.greaterThan(Date.now());
  });

  it('rotates when the provider reports exhausted quota without an HTTP status', async () => {
    const error = providerError({ message: 'Monthly quota exhausted' });
    sandbox.stub(axios, 'post').rejects(error);

    try {
      await cloudflareAiService._doTranslate('Nội dung', 'vi', 'en', null, 0, 0);
      expect.fail('Expected the provider error to be thrown');
    } catch (caughtError) {
      expect(caughtError).to.equal(error);
    }

    expect(axios.post.callCount).to.equal(2);
  });

  it('does not rotate credentials for authentication failures', async () => {
    const error = providerError({ status: 401, message: 'Unauthorized' });
    sandbox.stub(axios, 'post').rejects(error);

    try {
      await cloudflareAiService._doTranslate('Nội dung', 'vi', 'en', null, 0, 0);
      expect.fail('Expected the provider error to be thrown');
    } catch (caughtError) {
      expect(caughtError).to.equal(error);
    }

    expect(axios.post.calledOnce).to.equal(true);
    expect(cloudflareAiService.lastConfigIndex).to.equal(1);
  });
});
