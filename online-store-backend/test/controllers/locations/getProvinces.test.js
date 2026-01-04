/**
 * Bộ test cho controller getProvinces
 * Kiểm tra lấy tất cả tỉnh/thành phố Việt Nam từ API bên ngoài
 * Vị trí: test/controllers/locations/getProvinces.test.js
 */
const chai = require('chai');
const expect = chai.expect;
const sinon = require('sinon');
const { getProvinces } = require('../../../src/controllers/locationController');

describe('Location Controller - getProvinces', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    global.fetch = sandbox.stub();
  });

  afterEach(() => {
    sandbox.restore();
    delete global.fetch;
  });

  it('should fetch all provinces from API', async () => {
    const mockProvinces = [
      { code: 1, name: 'Thành phố Hà Nội', division_type: 'thành phố' },
      { code: 2, name: 'Tỉnh Hà Giang', division_type: 'tỉnh' },
    ];

    global.fetch.resolves({
      ok: true,
      json: sandbox.stub().resolves(mockProvinces),
    });

    const req = {};
    const res = {
      json: sandbox.spy(),
    };

    await getProvinces(req, res);

    expect(res.json.calledOnce).to.be.true;
    expect(res.json.getCall(0).args[0]).to.deep.equal(mockProvinces);
  });

  it('should throw error if API call fails', async () => {
    global.fetch.resolves({
      ok: false,
      status: 500,
    });

    const req = {};
    const res = {
      status: sandbox.stub().returnsThis(),
    };

    try {
      await getProvinces(req, res);
      expect.fail('Should have thrown an error');
    } catch (error) {
      expect(error.message).to.include('Failed to fetch provinces');
    }
  });
});
