const Province = require('../models/Province');
const vietnamProvinces = require('../data/vietnamProvinces.json');

const VIETNAM_API_URL = 'https://provinces.open-api.vn/api/v1';

/**
 * Seed provinces từ external API hoặc fallback data
 * Chiến lược:
 * 1. Check database trước - nếu đã có thì return
 * 2. Thử fetch từ external API
 * 3. Nếu fail, sử dụng fallback data (vietnamProvinces.json)
 */
const seedProvinces = async () => {
  try {
    // Check if provinces already exist
    const existingCount = await Province.countDocuments();
    if (existingCount > 0) {
      return;
    }

    let provinces = [];

    // Try external API first
    try {
      const response = await fetch(`${VIETNAM_API_URL}/p/`, { timeout: 5000 });
      if (response.ok) {
        const apiData = await response.json();
        provinces = Array.isArray(apiData) ? apiData : (apiData.data || []);
      } else {
        throw new Error(`API returned ${response.status}`);
      }
    } catch (fetchError) {
      provinces = vietnamProvinces;
    }

    // Transform data
    const cleanProvinces = provinces.map(p => ({
      code: String(p.code || p.id),
      name: p.name,
      nameEN: p.name_en,
      fullName: p.full_name,
      fullNameEN: p.full_name_en,
      codeName: p.code_name,
      adminCode: p.admin_code,
      adminCodeName: p.admin_code_name,
    }));

    // Insert into database
    const inserted = await Province.insertMany(cleanProvinces);

    return inserted;
  } catch (error) {
    // Don't throw - let system continue without provinces if all fail
    return [];
  }
};

module.exports = seedProvinces;
