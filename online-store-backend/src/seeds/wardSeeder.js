const Ward = require('../models/Ward');
const District = require('../models/District');

const VIETNAM_API_URL = 'https://provinces.open-api.vn/api/v1';

/**
 * Seed wards từ external API
 * Chiến lược:
 * 1. Check database trước - nếu đã có thì return
 * 2. Lấy danh sách all districts từ DB (đã được seed trước đó)
 * 3. Với mỗi district, fetch chi tiết (depth=2) để lấy wards
 * 4. Transform & lưu vào database
 * 
 * Ghi chú: Nếu gặp lỗi khi fetch, sẽ không throw error,
 * để system có thể tiếp tục chạy (graceful degradation)
 */
const seedWards = async () => {
  try {
    // Check if wards already exist
    const existingCount = await Ward.countDocuments();
    if (existingCount > 0) {
      return;
    }

    let allWards = [];

    try {
      // Get all districts from DB (previously seeded)
      const districts = await District.find({}).lean();

      if (!districts || districts.length === 0) {
        // No districts to process
        return [];
      }

      // Fetch wards for each district
      for (const district of districts) {
        try {
          const wardResponse = await fetch(
            `${VIETNAM_API_URL}/d/${district.code}?depth=2`,
            { timeout: 5000, headers: { 'User-Agent': 'Node.js' } }
          );

          if (wardResponse.ok) {
            const districtData = await wardResponse.json();
            const wards = districtData.wards || [];

            const cleanWards = wards.map(w => ({
              code: String(w.code),
              name: w.name,
              nameEN: w.name_en,
              fullName: w.full_name,
              fullNameEN: w.full_name_en,
              codeName: w.code_name,
              districtCode: String(district.code),
              provinceCode: district.provinceCode,
            }));

            allWards = allWards.concat(cleanWards);
          }
        } catch (error) {
          // Continue to next district if one fails
          continue;
        }
      }

      // Insert all wards if we have data
      if (allWards.length > 0) {
        await Ward.insertMany(allWards);
      }
    } catch (fetchError) {
      // If API fetch completely fails, don't throw
      // Let system continue without wards
      return [];
    }

    return allWards;
  } catch (error) {
    // Don't throw - let system continue without wards if all fail
    return [];
  }
};

module.exports = seedWards;
