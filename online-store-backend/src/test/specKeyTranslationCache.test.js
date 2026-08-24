const assert = require('node:assert/strict');
const { normalizeSpecs } = require('../utils/specNormalizer');
const {
  getCanonicalSpecKey,
  getSpecKeyLabels,
} = require('../services/specKeyTranslationService');
const { localizeProductSpecFields } = require('../services/translationHelper');
const specKeyCacheSeeder = require('../seeds/specKeyCacheSeeder');

describe('spec key translation rollout', () => {
  it('normalizes known Vietnamese and technical key variants', () => {
    assert.equal(getCanonicalSpecKey('Kích thước/Layout'), 'layout');
    assert.equal(getCanonicalSpecKey('keycap_material'), 'keycapMaterial');
    assert.equal(getCanonicalSpecKey('CPU'), 'cpu');
    assert.equal(getCanonicalSpecKey('mau_sac'), 'color');
    assert.equal(getCanonicalSpecKey('kieu_tai_nghe'), 'headphoneType');
    assert.equal(getCanonicalSpecKey('tuong_thich'), 'compatibility');
  });

  it('keeps sanitized unknown keys instead of dropping them', () => {
    assert.deepEqual(normalizeSpecs({ 'Màu sắc mới': 'Đen', '<script>': 'ignored' }), {
      mau_sac_moi: 'Đen',
    });
  });

  it('returns static labels when MongoDB is unavailable', async () => {
    const labels = await getSpecKeyLabels({ cpu: 'Core i7', layout: 'TKL' }, 'en');
    assert.deepEqual(labels, { cpu: 'Processor', layout: 'Layout' });
  });

  it('returns canonical specs separately from localized labels', async () => {
    const localized = await localizeProductSpecFields({
      specs: {
        'Kích thước/Layout': 'TKL',
        mau_sac: 'Đen',
        kieu_tai_nghe: 'Over-ear',
        tuong_thich: 'PC/Laptop',
      },
    }, 'en');
    assert.deepEqual(localized, {
      specs: {
        layout: 'TKL',
        color: 'Đen',
        headphoneType: 'Over-ear',
        compatibility: 'PC/Laptop',
      },
      specLabels: {
        layout: 'Layout',
        color: 'Color',
        headphoneType: 'Headphone Type',
        compatibility: 'Compatibility',
      },
    });
  });

  it('builds one static cache entry per canonical key and active language', () => {
    const entries = specKeyCacheSeeder.getStaticSeedEntries();
    const keys = new Set(entries.map(({ canonicalKey, targetLang }) => `${canonicalKey}:${targetLang}`));
    assert.equal(keys.size, entries.length);
    assert.ok(entries.some((entry) => (
      entry.canonicalKey === 'layout'
      && entry.targetLang === 'en'
      && entry.source === 'static'
      && entry.provider === 'static'
    )));
  });
});
