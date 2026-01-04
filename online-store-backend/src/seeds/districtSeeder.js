const District = require('../models/District');

const VIETNAM_API_URL = 'https://provinces.open-api.vn/api/v1';

/**
 * Seed districts từ external API
 * Chiến lược:
 * 1. Check database trước - nếu đã có thì return
 * 2. Fetch tất cả provinces từ external API
 * 3. Với mỗi province, fetch chi tiết (depth=2) để lấy districts
 * 4. Transform & lưu vào database
 * 
 * Ghi chú: Nếu gặp lỗi khi fetch, sẽ không throw error,
 * để system có thể tiếp tục chạy (graceful degradation)
 */
const seedDistricts = async () => {
  try {
    // Check if districts already exist
    const existingCount = await District.countDocuments();
    if (existingCount > 0) {
      return;
    }

    let allDistricts = [];

    try {
      // Fetch all provinces first
      const provincesResponse = await fetch(`${VIETNAM_API_URL}/p/`, {
        timeout: 10000,
        headers: { 'User-Agent': 'Node.js' }
      });

      if (!provincesResponse.ok) {
        throw new Error(`Provinces API returned ${provincesResponse.status}`);
      }

      const provinces = await provincesResponse.json();
      const provinceList = Array.isArray(provinces) ? provinces : (provinces.data || []);

      // Fetch districts for each province
      for (const province of provinceList) {
        try {
          const districtResponse = await fetch(
            `${VIETNAM_API_URL}/p/${province.code}?depth=2`,
            { timeout: 5000, headers: { 'User-Agent': 'Node.js' } }
          );

          if (districtResponse.ok) {
            const provinceData = await districtResponse.json();
            const districts = provinceData.districts || [];

            const cleanDistricts = districts.map(d => ({
              code: String(d.code),
              name: d.name,
              nameEN: d.name_en,
              fullName: d.full_name,
              fullNameEN: d.full_name_en,
              codeName: d.code_name,
              provinceCode: String(province.code),
            }));

            allDistricts = allDistricts.concat(cleanDistricts);
          }
        } catch (error) {
          // Continue to next province if one fails
          continue;
        }
      }

      // Insert all districts if we have data
      if (allDistricts.length > 0) {
        await District.insertMany(allDistricts);
      }
    } catch (fetchError) {
      // If API fetch completely fails, don't throw
      // Let system continue without districts
      return [];
    }

    return allDistricts;
  } catch (error) {
    // Don't throw - let system continue without districts if all fail
    return [];
  }
};

module.exports = seedDistricts;
