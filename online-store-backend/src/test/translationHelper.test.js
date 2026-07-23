const assert = require('node:assert/strict');
const {
  overlayTranslation,
  overlayTranslationBatchWithFallback,
  getTranslationWithFallback,
  TRANSLATABLE_FIELDS,
  CACHE_MODELS,
  overlayCouponTranslations,
  overlayOrderTranslations,
  overlayBannerTranslations,
  overlayTestimonialTranslations,
} = require('../services/translationHelper');
const LiveTranslationCache = require('../models/LiveTranslationCache');

function createQueryMock() {
  const mock = (query) => {
    mock.calls.push(query);
    return { lean: () => mock.result };
  };

  mock.calls = [];
  mock.result = Promise.resolve(null);
  return mock;
}

describe('translationHelper - Entity Type Support', () => {
  describe('CACHE_MODELS and TRANSLATABLE_FIELDS', () => {
    it('should support 8+ entity types', () => {
      const expectedTypes = ['product', 'brand', 'userContent', 'coupon', 'order', 'banner', 'testimonial'];
      expectedTypes.forEach(type => {
        assert.notStrictEqual(CACHE_MODELS[type], undefined);
        assert.notStrictEqual(TRANSLATABLE_FIELDS[type], undefined);
      });
    });

    it('should have correct translatable fields for coupon', () => {
      assert.ok(['name', 'description', 'codeDescription', 'termsAndConditions'].every(field =>
        TRANSLATABLE_FIELDS.coupon.includes(field)
      ));
    });

    it('should have correct translatable fields for order', () => {
      assert.ok(['customerNotes', 'shippingNotes', 'adminNotes', 'statusMessage'].every(field =>
        TRANSLATABLE_FIELDS.order.includes(field)
      ));
    });

    it('should have correct translatable fields for banner', () => {
      assert.ok(['title', 'description', 'ctaText', 'altText'].every(field =>
        TRANSLATABLE_FIELDS.banner.includes(field)
      ));
    });

    it('should have correct translatable fields for testimonial', () => {
      assert.ok(['content', 'authorName', 'authorTitle', 'authorCompany'].every(field =>
        TRANSLATABLE_FIELDS.testimonial.includes(field)
      ));
    });
  });
});

describe('translationHelper - Exact-language overlays', () => {
  let mockCouponCache;
  let originalCouponCache;

  beforeEach(() => {
    originalCouponCache = CACHE_MODELS.coupon;
    mockCouponCache = {
      findOne: createQueryMock(),
      find: createQueryMock(),
    };
    CACHE_MODELS.coupon = mockCouponCache;
  });

  afterEach(() => {
    CACHE_MODELS.coupon = originalCouponCache;
  });

  describe('getTranslationWithFallback', () => {
    it('should return null when no translation exists for the requested language', async () => {
      mockCouponCache.findOne.result = Promise.resolve(null);

      const result = await getTranslationWithFallback('123', 'coupon', 'vi');

      assert.deepStrictEqual(mockCouponCache.findOne.calls, [{
        entityId: '123',
        targetLang: 'vi',
        status: 'success',
      }]);
      assert.strictEqual(result, null);
    });

    it('should query only the requested language', async () => {
      mockCouponCache.findOne.result = Promise.resolve({
        entityId: '123',
        targetLang: 'fr',
        name: 'Coupon français',
      });

      const result = await getTranslationWithFallback('123', 'coupon', 'fr');

      assert.deepStrictEqual(mockCouponCache.findOne.calls, [{
        entityId: '123',
        targetLang: 'fr',
        status: 'success',
      }]);
      assert.strictEqual(result.appliedLang, 'fr');
      assert.strictEqual(result.fallbackUsed, false);
    });

    it('should return null when the requested-language query fails', async () => {
      mockCouponCache.findOne.result = Promise.reject(new Error('DB error'));

      const result = await getTranslationWithFallback('123', 'coupon', 'fr');

      assert.strictEqual(result, null);
    });

    it('should return null for unknown entity type', async () => {
      const result = await getTranslationWithFallback('123', 'unknownType', 'fr');
      assert.strictEqual(result, null);
    });

    it('should return null for missing entityId', async () => {
      const result = await getTranslationWithFallback(null, 'coupon', 'fr');
      assert.strictEqual(result, null);
    });
  });

  describe('overlayTranslationBatchWithFallback', () => {
    it('should keep source entities when no exact-language translation exists', async () => {
      const entities = [{ _id: '1', name: 'Item' }];
      mockCouponCache.find.result = Promise.resolve([]);

      const result = await overlayTranslationBatchWithFallback(entities, 'coupon', 'vi');

      assert.deepStrictEqual(result, entities);
    });

    it('should overlay only exact-language translations', async () => {
      const entities = [
        { _id: '1', name: 'Original Name' },
        { _id: '2', name: 'Original Name 2' },
      ];
      mockCouponCache.find.result = Promise.resolve([
        { entityId: '1', targetLang: 'fr', name: 'Nom français' },
      ]);

      const result = await overlayTranslationBatchWithFallback(entities, 'coupon', 'fr');

      assert.deepStrictEqual(mockCouponCache.find.calls, [{
        entityId: { $in: ['1', '2'] },
        targetLang: 'fr',
        status: 'success',
      }]);
      assert.strictEqual(result[0].name, 'Nom français');
      assert.strictEqual(result[1].name, 'Original Name 2');
    });

    it('should return original entities on error', async () => {
      const entities = [{ _id: '1', name: 'Item' }];
      mockCouponCache.find.result = Promise.reject(new Error('DB error'));

      const result = await overlayTranslationBatchWithFallback(entities, 'coupon', 'fr');

      assert.deepStrictEqual(result, entities);
    });
  });
});

describe('translationHelper - Product legacy cache fallback', () => {
  let mockProductCache;
  let originalProductCache;
  let mockLegacyFind;
  let originalLegacyFind;

  beforeEach(() => {
    originalProductCache = CACHE_MODELS.product;
    mockProductCache = {
      findOne: createQueryMock(),
      find: createQueryMock(),
    };
    CACHE_MODELS.product = mockProductCache;
    originalLegacyFind = LiveTranslationCache.find;
    mockLegacyFind = createQueryMock();
    LiveTranslationCache.find = mockLegacyFind;
  });

  afterEach(() => {
    CACHE_MODELS.product = originalProductCache;
    LiveTranslationCache.find = originalLegacyFind;
  });

  it('uses legacy translations for a product missing from the catalog cache', async () => {
    mockProductCache.find.result = Promise.resolve([]);
    mockLegacyFind.result = Promise.resolve([
      { entityId: '1', entityType: 'product_name', translatedText: 'Tên legacy' },
      { entityId: '1', entityType: 'product_spec', specKey: 'CPU', translatedText: 'Bộ xử lý' },
    ]);

    const result = await overlayTranslationBatchWithFallback([
      { _id: '1', name: 'Original', specs: { CPU: 'Processor' } },
    ], 'product', 'en');

    assert.strictEqual(result[0].name, 'Tên legacy');
    assert.deepStrictEqual(result[0].specs, { CPU: 'Bộ xử lý' });
    assert.deepStrictEqual(mockLegacyFind.calls, [{
      entityId: { $in: ['1'] },
      targetLang: 'en',
      entityType: { $in: ['product_name', 'product_description', 'product_brand', 'product_spec', 'product_feature'] },
      status: 'success',
      qualityStatus: { $nin: ['needs_retranslate', 'rejected'] },
    }]);
  });

  it('prefers the catalog cache over legacy translations', async () => {
    mockProductCache.find.result = Promise.resolve([
      { entityId: '1', name: 'Tên catalog' },
    ]);

    const result = await overlayTranslationBatchWithFallback([
      { _id: '1', name: 'Original' },
    ], 'product', 'en');

    assert.strictEqual(result[0].name, 'Tên catalog');
    assert.deepStrictEqual(mockLegacyFind.calls, []);
  });

  it('uses legacy translations for a product detail missing from the catalog cache', async () => {
    mockProductCache.findOne.result = Promise.resolve(null);
    mockLegacyFind.result = Promise.resolve([
      { entityId: '1', entityType: 'product_description', translatedText: 'Mô tả legacy' },
    ]);

    const result = await overlayTranslation({ _id: '1', description: 'Original' }, 'product', 'en');

    assert.strictEqual(result.description, 'Mô tả legacy');
  });
});

describe('translationHelper - Entity Type Batch Overlays', () => {
  it('should have batch helper for coupon', () => {
    assert.strictEqual(typeof overlayCouponTranslations, 'function');
  });

  it('should have batch helper for order', () => {
    assert.strictEqual(typeof overlayOrderTranslations, 'function');
  });

  it('should have batch helper for banner', () => {
    assert.strictEqual(typeof overlayBannerTranslations, 'function');
  });

  it('should have batch helper for testimonial', () => {
    assert.strictEqual(typeof overlayTestimonialTranslations, 'function');
  });
});
