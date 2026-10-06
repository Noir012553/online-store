'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(projectRoot, '.env') });

const args = new Map();
for (let index = 0; index < process.argv.slice(2).length; index += 1) {
  const item = process.argv.slice(2)[index];
  if (!item.startsWith('--')) throw new Error(`Tham số không hợp lệ: ${item}`);
  const key = item.slice(2);
  const value = process.argv.slice(2)[index + 1];
  if (value && !value.startsWith('--')) {
    args.set(key, value);
    index += 1;
  } else {
    args.set(key, true);
  }
}

const provinceId = Number(args.get('province-id') || 0);
const districtIdArg = Number(args.get('district-id') || 0);
const baseUrl = process.env.GHN_API_URL || 'https://dev-online-gateway.ghn.vn/shiip/public-api';
const token = process.env.GHN_API_TOKEN;
const shopId = process.env.GHN_SHOP_ID;

if (!token) throw new Error(`GHN_API_TOKEN is missing in ${path.join(projectRoot, '.env')}`);
if (!Number.isInteger(provinceId) || provinceId < 0) throw new Error('--province-id must be a non-negative integer');
if (!Number.isInteger(districtIdArg) || districtIdArg < 0) throw new Error('--district-id must be a non-negative integer');

const headers = { Token: token, Accept: 'application/json', 'Content-Type': 'application/json' };
if (shopId) headers.ShopId = shopId;

const request = async (method, url, body) => {
  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
    return { success: response.ok, statusCode: response.status, body: parsed, error: null };
  } catch (error) {
    return { success: false, statusCode: null, body: null, error: error.message };
  }
};

const asList = payload => {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  for (const key of ['data', 'districts', 'items']) {
    if (payload[key] !== undefined) {
      const nested = asList(payload[key]);
      if (nested.length) return nested;
    }
  }
  const idKey = Object.keys(payload).find(key => /^district_?id$/i.test(key));
  return idKey && payload[idKey] ? [payload] : [];
};

const getWardList = payload => {
  const data = payload?.data;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.wards)) return data.wards;
  if (Array.isArray(data?.data)) return data.data;
  if (data?.WardCode || data?.wardCode) return [data];
  return [];
};

(async () => {
  console.log(`GHN base URL: ${baseUrl}`);
  console.log('Token: configured');
  console.log(`ShopId: ${shopId ? 'configured' : 'not configured'}`);

  const provinceResponse = await request('GET', `${baseUrl}/master-data/province`);
  const provinceBody = provinceResponse.body || {};
  console.log(`Province: HTTP ${provinceResponse.statusCode}, code=${provinceBody.code}, message=${provinceBody.message}, count=${Array.isArray(provinceBody.data) ? provinceBody.data.length : 0}`);
  if (!provinceResponse.success || provinceBody.code !== 200) throw new Error(`Province request failed: ${provinceResponse.error || provinceBody.message}`);

  const provinces = (provinceBody.data || []).filter(province => !provinceId || Number(province.ProvinceID) === provinceId);
  if (!provinces.length) throw new Error(`ProvinceId ${provinceId} was not found in GHN province response`);

  let selectedProvinceId;
  let selectedDistrictResponse;
  let districts = [];
  for (const province of provinces) {
    const candidateProvinceId = Number(province.ProvinceID);
    const response = await request('POST', `${baseUrl}/master-data/district`, { province_id: candidateProvinceId });
    const candidateDistricts = response.success && response.body?.code === 200 ? asList(response.body.data) : [];
    if (candidateDistricts.length) {
      selectedProvinceId = candidateProvinceId;
      selectedDistrictResponse = response;
      districts = candidateDistricts;
      break;
    }
  }
  if (!districts.length) throw new Error('GHN returned no districts for the tested provinces');

  const districtIdKey = Object.keys(districts[0]).find(key => /^district_?id$/i.test(key));
  const districtId = districtIdArg || Number(districts[0][districtIdKey]);
  console.log(`ProvinceId: ${selectedProvinceId}`);
  console.log(`District: HTTP ${selectedDistrictResponse.statusCode}, code=${selectedDistrictResponse.body?.code}, message=${selectedDistrictResponse.body?.message}, count=${districts.length}`);
  console.log(`DistrictId: ${districtId}`);

  const wardUrl = `${baseUrl}/master-data/ward?district_id=${encodeURIComponent(districtId)}`;
  const getWardResponse = await request('GET', wardUrl);
  const getWards = getWardList(getWardResponse.body);
  console.log(`Ward GET: HTTP ${getWardResponse.statusCode}, code=${getWardResponse.body?.code}, message=${getWardResponse.body?.message}, count=${getWards.length}`);
  console.table(getWards.slice(0, 3).map(({ WardCode, DistrictID, WardName, wardCode, districtId: nestedDistrictId, wardName }) => ({ WardCode: WardCode || wardCode, DistrictID: DistrictID || nestedDistrictId, WardName: WardName || wardName })));

  const postWardResponse = await request('POST', wardUrl, { district_id: districtId });
  const postWards = getWardList(postWardResponse.body);
  console.log(`Ward POST: HTTP ${postWardResponse.statusCode}, code=${postWardResponse.body?.code}, message=${postWardResponse.body?.message}, count=${postWards.length}`);
  console.table(postWards.slice(0, 3).map(({ WardCode, DistrictID, WardName, wardCode, districtId: nestedDistrictId, wardName }) => ({ WardCode: WardCode || wardCode, DistrictID: DistrictID || nestedDistrictId, WardName: WardName || wardName })));

  if (!getWards.length && !postWards.length) throw new Error('Both Ward requests returned no data');
  console.log('GHN Ward diagnostic passed.');
})().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
