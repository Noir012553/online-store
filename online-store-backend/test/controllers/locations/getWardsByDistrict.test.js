/**
 * Bộ test cho controller getWardsByDistrict
 * Kiểm tra lấy phường/xã cho một quận/huyện cụ thể
 * Vị trí: test/controllers/locations/getWardsByDistrict.test.js
 */
const chai = require('chai');
const expect = chai.expect;
const sinon = require('sinon');
const { getWardsByDistrict } = require('../../../src/controllers/locationController');

describe('Location Controller - getWardsByDistrict', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    global.fetch = sandbox.stub();
  });

  afterEach(() => {
    sandbox.restore();
    delete global.fetch;
  });

  it('should fetch wards by district code', async () => {
    const mockWards = [
      { code: 1, name: 'Phường Trần Hưng Đạo', division_type: 'phường' },
      { code: 2, name: 'Phường Tràng Tiền', division_type: 'phường' },
    ];

    global.fetch.resolves({
      ok: true,
      json: sandbox.stub().resolves({
        code: 1,
        name: 'Quận Ba Đình',
        wards: mockWards,
      }),
    });

    const req = { params: { districtCode: '1' } };
    const res = {
      json: sandbox.spy(),
    };

    await getWardsByDistrict(req, res);

    expect(res.json.calledOnce).to.be.true;
    expect(res.json.getCall(0).args[0]).to.deep.equal(mockWards);
  });

  it('should throw error if district not found', async () => {
    global.fetch.resolves({
      ok: false,
      status: 404,
    });

    const req = { params: { districtCode: '999' } };
    const res = {
      status: sandbox.stub().returnsThis(),
    };

    try {
      await getWardsByDistrict(req, res);
      expect.fail('Should have thrown an error');
    } catch (error) {
      expect(error.message).to.include('District not found');
    }
  });
});
