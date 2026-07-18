const {
  overlayTranslationBatch,
  overlayTranslationBatchWithFallback,
  getTranslationWithFallback,
  TRANSLATABLE_FIELDS,
  CACHE_MODELS,
} = require('../src/services/translationHelper');

describe('translationHelper - Entity Type Support', () => {
  describe('CACHE_MODELS and TRANSLATABLE_FIELDS', () => {
    it('should support 8+ entity types', () => {
      const expectedTypes = ['product', 'brand', 'userContent', 'coupon', 'order', 'banner', 'testimonial'];
      expectedTypes.forEach(type => {
        expect(CACHE_MODELS[type]).toBeDefined();
        expect(TRANSLATABLE_FIELDS[type]).toBeDefined();
      });
    });

    it('should have correct translatable fields for coupon', () => {
      expect(TRANSLATABLE_FIELDS.coupon).toEqual(
        expect.arrayContaining(['name', 'description', 'codeDescription', 'termsAndConditions'])
      );
    });

    it('should have correct translatable fields for order', () => {
      expect(TRANSLATABLE_FIELDS.order).toEqual(
        expect.arrayContaining(['customerNotes', 'shippingNotes', 'adminNotes', 'statusMessage'])
      );
    });

    it('should have correct translatable fields for banner', () => {
      expect(TRANSLATABLE_FIELDS.banner).toEqual(
        expect.arrayContaining(['title', 'description', 'ctaText', 'altText'])
      );
    });

    it('should have correct translatable fields for testimonial', () => {
      expect(TRANSLATABLE_FIELDS.testimonial).toEqual(
        expect.arrayContaining(['content', 'authorName', 'authorTitle', 'authorCompany'])
      );
    });
  });
});

describe('translationHelper - Exact-language overlays', () => {
  let mockCouponCache;

  beforeEach(() => {
    mockCouponCache = {
      findOne: jest.fn(),
      find: jest.fn(),
    };
    CACHE_MODELS.coupon = mockCouponCache;
  });

  describe('getTranslationWithFallback', () => {
    it('should return null when no translation exists for the requested language', async () => {
      mockCouponCache.findOne.mockReturnValue({ lean: jest.fn().resolves(null) });

      const result = await getTranslationWithFallback('123', 'coupon', 'vi');

      expect(mockCouponCache.findOne).toHaveBeenCalledWith({
        entityId: '123',
        targetLang: 'vi',
        status: 'success',
      });
      expect(result).toBeNull();
    });

    it('should query only the requested language', async () => {
      mockCouponCache.findOne.mockReturnValue({
        lean: jest.fn().resolves({
          entityId: '123',
          targetLang: 'fr',
          name: 'Coupon français',
        }),
      });

      const result = await getTranslationWithFallback('123', 'coupon', 'fr');

      expect(mockCouponCache.findOne).toHaveBeenCalledTimes(1);
      expect(mockCouponCache.findOne).toHaveBeenCalledWith({
        entityId: '123',
        targetLang: 'fr',
        status: 'success',
      });
      expect(result.appliedLang).toBe('fr');
      expect(result.fallbackUsed).toBe(false);
    });

    it('should return null when the requested-language query fails', async () => {
      mockCouponCache.findOne.mockReturnValue({ lean: jest.fn().rejects(new Error('DB error')) });

      const result = await getTranslationWithFallback('123', 'coupon', 'fr');

      expect(result).toBeNull();
    });

    it('should return null for unknown entity type', async () => {
      const result = await getTranslationWithFallback('123', 'unknownType', 'fr');
      expect(result).toBeNull();
    });

    it('should return null for missing entityId', async () => {
      const result = await getTranslationWithFallback(null, 'coupon', 'fr');
      expect(result).toBeNull();
    });
  });

  describe('overlayTranslationBatchWithFallback', () => {
    it('should keep source entities when no exact-language translation exists', async () => {
      const entities = [{ _id: '1', name: 'Item' }];
      mockCouponCache.find.mockReturnValue({ lean: jest.fn().resolves([]) });

      const result = await overlayTranslationBatchWithFallback(entities, 'coupon', 'vi');

      expect(result).toEqual(entities);
    });

    it('should overlay only exact-language translations', async () => {
      const entities = [
        { _id: '1', name: 'Original Name' },
        { _id: '2', name: 'Original Name 2' },
      ];
      mockCouponCache.find.mockReturnValue({
        lean: jest.fn().resolves([
          { entityId: '1', targetLang: 'fr', name: 'Nom français' },
        ]),
      });

      const result = await overlayTranslationBatchWithFallback(entities, 'coupon', 'fr');

      expect(mockCouponCache.find).toHaveBeenCalledWith({
        entityId: { $in: ['1', '2'] },
        targetLang: 'fr',
        status: 'success',
      });
      expect(result[0].name).toBe('Nom français');
      expect(result[1].name).toBe('Original Name 2');
    });

    it('should return original entities on error', async () => {
      const entities = [{ _id: '1', name: 'Item' }];
      mockCouponCache.find.mockReturnValue({ lean: jest.fn().rejects(new Error('DB error')) });

      const result = await overlayTranslationBatchWithFallback(entities, 'coupon', 'fr');

      expect(result).toEqual(entities);
    });
  });
});

describe('translationHelper - Entity Type Batch Overlays', () => {
  it('should have batch helper for coupon', () => {
    const { overlayCouponTranslations } = require('../src/services/translationHelper');
    expect(typeof overlayCouponTranslations).toBe('function');
  });

  it('should have batch helper for order', () => {
    const { overlayOrderTranslations } = require('../src/services/translationHelper');
    expect(typeof overlayOrderTranslations).toBe('function');
  });

  it('should have batch helper for banner', () => {
    const { overlayBannerTranslations } = require('../src/services/translationHelper');
    expect(typeof overlayBannerTranslations).toBe('function');
  });

  it('should have batch helper for testimonial', () => {
    const { overlayTestimonialTranslations } = require('../src/services/translationHelper');
    expect(typeof overlayTestimonialTranslations).toBe('function');
  });
});
