/**
 * Bộ test cho controller getDistrictsByProvince
 * Kiểm tra lấy quận/huyện cho một tỉnh cụ thể từ API
 * Vị trí: test/controllers/locations/getDistrictsByProvince.test.js
 */
const chai = require('chai');
const expect = chai.expect;
const sinon = require('sinon');
const { getDistrictsByProvince } = require('../../../src/controllers/locationController');

describe('Location Controller - getDistrictsByProvince', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    global.fetch = sandbox.stub();
  });

  afterEach(() => {
    sandbox.restore();
    delete global.fetch;
  });

  it('should fetch districts by province code', async () => {
    const mockDistricts = [
      { code: 1, name: 'Quận Ba Đình', division_type: 'quận' },
      { code: 2, name: 'Quận Hoàn Kiếm', division_type: 'quận' },
    ];

    global.fetch.resolves({
      ok: true,
      json: sandbox.stub().resolves({
        code: 1,
        name: 'Thành phố Hà Nội',
        districts: mockDistricts,
      }),
    });

    const req = { params: { provinceCode: '1' } };
    const res = {
      json: sandbox.spy(),
    };

    await getDistrictsByProvince(req, res);

    expect(res.json.calledOnce).to.be.true;
    expect(res.json.getCall(0).args[0]).to.deep.equal(mockDistricts);
  });

  it('should throw error if province not found', async () => {
    global.fetch.resolves({
      ok: false,
      status: 404,
    });

    const req = { params: { provinceCode: '999' } };
    const res = {
      status: sandbox.stub().returnsThis(),
    };

    try {
      await getDistrictsByProvince(req, res);
      expect.fail('Should have thrown an error');
    } catch (error) {
      expect(error.message).to.include('Province not found');
    }
  });
});
