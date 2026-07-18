/**
 * Seed exchangeRateHistory với dữ liệu lịch sử demo
 * Để xem lịch sử và thống kê tỷ giá hoạt động như thế nào
 * Chạy: npm run seed -- --only-module=exchange-rate-history
 */

const mongoose = require('mongoose');
const ExchangeRateHistory = require('../models/ExchangeRateHistory');
const SeedStatus = require('../models/SeedStatus');

const DEMO_HISTORY = [
  // VND <-> USD history (10 entries, 3 days back)
  {
    fromCode: 'VND',
    toCode: 'USD',
    oldRate: null,
    newRate: 0.000041,
    rateChange: null,
    changeType: 'init',
    source: 'manual',
    recordedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
  },
  {
    fromCode: 'VND',
    toCode: 'USD',
    oldRate: 0.000041,
    newRate: 0.0000412,
    rateChange: 4.88,
    changeType: 'increase',
    source: 'api',
    recordedAt: new Date(Date.now() - 2.5 * 24 * 60 * 60 * 1000),
  },
  {
    fromCode: 'VND',
    toCode: 'USD',
    oldRate: 0.0000412,
    newRate: 0.0000408,
    rateChange: -2.91,
    changeType: 'decrease',
    source: 'api',
    recordedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
  },
  {
    fromCode: 'VND',
    toCode: 'USD',
    oldRate: 0.0000408,
    newRate: 0.000041,
    rateChange: 2.45,
    changeType: 'increase',
    source: 'api',
    recordedAt: new Date(Date.now() - 1.5 * 24 * 60 * 60 * 1000),
  },
  {
    fromCode: 'VND',
    toCode: 'USD',
    oldRate: 0.000041,
    newRate: 0.000041,
    rateChange: 0,
    changeType: 'init', // No change
    source: 'api',
    recordedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
  },

  // USD <-> EUR history (10 entries, 7 days back)
  {
    fromCode: 'USD',
    toCode: 'EUR',
    oldRate: null,
    newRate: 0.92,
    rateChange: null,
    changeType: 'init',
    source: 'manual',
    recordedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
  },
  {
    fromCode: 'USD',
    toCode: 'EUR',
    oldRate: 0.92,
    newRate: 0.918,
    rateChange: -2.17,
    changeType: 'decrease',
    source: 'api',
    recordedAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
  },
  {
    fromCode: 'USD',
    toCode: 'EUR',
    oldRate: 0.918,
    newRate: 0.92,
    rateChange: 2.18,
    changeType: 'increase',
    source: 'api',
    recordedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
  },
  {
    fromCode: 'USD',
    toCode: 'EUR',
    oldRate: 0.92,
    newRate: 0.925,
    rateChange: 5.43,
    changeType: 'increase',
    source: 'api',
    recordedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
  },
  {
    fromCode: 'USD',
    toCode: 'EUR',
    oldRate: 0.925,
    newRate: 0.92,
    rateChange: -5.41,
    changeType: 'decrease',
    source: 'api',
    recordedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
  },
  {
    fromCode: 'USD',
    toCode: 'EUR',
    oldRate: 0.92,
    newRate: 0.92,
    rateChange: 0,
    changeType: 'init',
    source: 'api',
    recordedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
  },
  {
    fromCode: 'USD',
    toCode: 'EUR',
    oldRate: 0.92,
    newRate: 0.918,
    rateChange: -2.17,
    changeType: 'decrease',
    source: 'api',
    recordedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
  },
  {
    fromCode: 'USD',
    toCode: 'EUR',
    oldRate: 0.918,
    newRate: 0.92,
    rateChange: 2.18,
    changeType: 'increase',
    source: 'api',
    recordedAt: new Date(Date.now()),
  },

  // EUR <-> SEK history (8 entries, 5 days back)
  {
    fromCode: 'EUR',
    toCode: 'SEK',
    oldRate: null,
    newRate: 10.85,
    rateChange: null,
    changeType: 'init',
    source: 'manual',
    recordedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
  },
  {
    fromCode: 'EUR',
    toCode: 'SEK',
    oldRate: 10.85,
    newRate: 10.90,
    rateChange: 4.61,
    changeType: 'increase',
    source: 'api',
    recordedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
  },
  {
    fromCode: 'EUR',
    toCode: 'SEK',
    oldRate: 10.90,
    newRate: 10.83,
    rateChange: -6.42,
    changeType: 'decrease',
    source: 'api',
    recordedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
  },
  {
    fromCode: 'EUR',
    toCode: 'SEK',
    oldRate: 10.83,
    newRate: 10.85,
    rateChange: 1.85,
    changeType: 'increase',
    source: 'api',
    recordedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
  },
  {
    fromCode: 'EUR',
    toCode: 'SEK',
    oldRate: 10.85,
    newRate: 10.85,
    rateChange: 0,
    changeType: 'init',
    source: 'api',
    recordedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
  },
  {
    fromCode: 'EUR',
    toCode: 'SEK',
    oldRate: 10.85,
    newRate: 10.87,
    rateChange: 1.84,
    changeType: 'increase',
    source: 'api',
    recordedAt: new Date(Date.now()),
  },
];

async function seedExchangeRateHistory() {
  try {
    console.log('[ExchangeRateHistorySeeder] Bắt đầu seed...');

    // Check if already seeded
    const status = await SeedStatus.findOne({ module: 'exchangeRateHistory' });
    if (status && status.isCompleted) {
      console.log('[ExchangeRateHistorySeeder] Đã seed trước đó, skip...');
      return;
    }

    // Clear old data
    await ExchangeRateHistory.deleteMany({});

    // Insert demo data
    const result = await ExchangeRateHistory.insertMany(DEMO_HISTORY);
    console.log(`[ExchangeRateHistorySeeder] Đã tạo ${result.length} lịch sử tỷ giá`);

    // Mark as completed
    await SeedStatus.updateOne(
      { module: 'exchangeRateHistory' },
      {
        module: 'exchangeRateHistory',
        isCompleted: true,
        completedAt: new Date(),
      },
      { upsert: true }
    );

    console.log('[ExchangeRateHistorySeeder] ✅ Hoàn thành');
  } catch (error) {
    console.error('[ExchangeRateHistorySeeder] ❌ Lỗi:', error);
    throw error;
  }
}

module.exports = seedExchangeRateHistory;
