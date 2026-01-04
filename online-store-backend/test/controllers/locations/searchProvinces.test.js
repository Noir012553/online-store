/**
 * Bộ test cho controller searchProvinces
 * Kiểm tra tìm kiếm tỉnh/thành phố theo từ khóa
 * Vị trí: test/controllers/locations/searchProvinces.test.js
 */
const chai = require('chai');
const expect = chai.expect;
const sinon = require('sinon');
const { searchProvinces } = require('../../../src/controllers/locationController');

describe('Location Controller - searchProvinces', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    global.fetch = sandbox.stub();
  });

  afterEach(() => {
    sandbox.restore();
    delete global.fetch;
  });

  it('should search provinces by keyword', async () => {
    const mockResults = [
      { code: 1, name: 'Thành phố Hà Nội', division_type: 'thành phố' },
    ];

    global.fetch.resolves({
      ok: true,
      json: sandbox.stub().resolves(mockResults),
    });

    const req = { query: { q: 'hà nội' } };
    const res = {
      json: sandbox.spy(),
    };

    await searchProvinces(req, res);

    expect(res.json.calledOnce).to.be.true;
    expect(res.json.getCall(0).args[0]).to.deep.equal(mockResults);
  });

  it('should throw error if query is empty', async () => {
    const req = { query: {} };
    const res = {
      status: sandbox.stub().returnsThis(),
    };

    try {
      await searchProvinces(req, res);
      expect.fail('Should have thrown an error');
    } catch (error) {
      expect(error.message).to.include('Search query is required');
    }
  });

  it('should throw error if search fails', async () => {
    global.fetch.resolves({
      ok: false,
      status: 500,
    });

    const req = { query: { q: 'test' } };
    const res = {
      status: sandbox.stub().returnsThis(),
    };

    try {
      await searchProvinces(req, res);
      expect.fail('Should have thrown an error');
    } catch (error) {
      expect(error.message).to.include('Search failed');
    }
  });
});
