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

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    originalConfigs = cloudflareAiService.configs;
    originalConfigIndex = cloudflareAiService.configIndex;
    cloudflareAiService.configs = [createConfig(1), createConfig(2)];
    cloudflareAiService.configIndex = 0;
    cloudflareAiService.updateCurrentConfig();
    sandbox.stub(cloudflareAiService, 'throttle').resolves();
  });

  afterEach(() => {
    sandbox.restore();
    cloudflareAiService.configs = originalConfigs;
    cloudflareAiService.configIndex = originalConfigIndex;
    cloudflareAiService.updateCurrentConfig();
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
    expect(cloudflareAiService.currentConfig.index).to.equal(1);
  });
});
