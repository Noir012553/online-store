/**
 * Database Seeder - Khởi tạo nhà vận chuyển
 * Seed GHN (Giao Hàng Nhanh) từ environment variables
 */

const ShippingProvider = require('../models/ShippingProvider');

/**
 * Seed dữ liệu nhà vận chuyển
 * Sử dụng GHN_TOKEN từ .env file
 */
const seedShippingProviders = async () => {
  // Xóa toàn bộ providers cũ (nếu cần, có thể bỏ dòng này để giữ lại config)
  // await ShippingProvider.deleteMany({});

  // Kiểm tra GHN_API_TOKEN từ environment (hoặc GHN_TOKEN cho backward compatibility)
  const ghnToken = process.env.GHN_API_TOKEN || process.env.GHN_TOKEN;

  if (!ghnToken) {
    console.warn(
      '⚠️ GHN_API_TOKEN not found in .env file. Skipping GHN seeding.\n' +
      '   Please add GHN_API_TOKEN to your .env file to enable shipping integration.'
    );
    return [];
  }

  // Kiểm tra xem GHN provider đã tồn tại chưa
  const existingGhn = await ShippingProvider.findOne({ code: 'ghn', isDeleted: false });

  if (existingGhn) {
    console.log(`ℹ️  GHN provider already configured. Skipping creation.`);
    return [existingGhn];
  }

  // Tạo GHN provider
  const ghnProvider = new ShippingProvider({
    name: 'GHN',
    code: 'ghn',
    logo: 'https://www.ghnsmart.com/favicon.ico',
    description: 'Giao Hàng Nhanh - Vietnam fastest delivery service',
    apiUrl: 'https://api.ghn.vn/v2',
    apiKey: ghnToken,
    serviceTypes: [
      {
        code: 'standard',
        name: 'Giao hàng tiêu chuẩn',
        estimatedDays: '2-3',
      },
      {
        code: 'fast',
        name: 'Giao hàng nhanh',
        estimatedDays: '1-2',
      },
      {
        code: 'express',
        name: 'Giao hàng thành phố',
        estimatedDays: '1-3',
      },
    ],
    isActive: true,
  });

  const createdProviders = [];

  try {
    const savedGhn = await ghnProvider.save();
    createdProviders.push(savedGhn);
    console.log(`🚚 ✅ Successfully created GHN shipping provider`);
  } catch (error) {
    console.error(`❌ Failed to create GHN provider: ${error.message}`);
  }

  return createdProviders;
};

module.exports = seedShippingProviders;
