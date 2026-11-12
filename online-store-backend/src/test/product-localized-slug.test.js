const { expect } = require('chai');
const { getSlugCandidates, slugifyProductName } = require('../services/productLocalizedSlugService');

describe('Product localized slug service', () => {
  it('normalizes Vietnamese accents and punctuation into stable ASCII slugs', () => {
    expect(slugifyProductName('Bàn phím Razer BlackWidow V4 - Yellow Switch'))
      .to.equal('ban-phim-razer-blackwidow-v4-yellow-switch');
    expect(slugifyProductName('Đặng’s Écran & Cảm ứng'))
      .to.equal('dang-s-ecran-cam-ung');
  });

  it('creates deterministic locale, SKU, and product ID collision candidates', () => {
    const candidates = getSlugCandidates(
      'Bàn phím Razer',
      'en',
      'RBW V4',
      '65a0d73a0069aece85a8c903',
    );

    expect(candidates).to.deep.equal([
      'ban-phim-razer',
      'ban-phim-razer-en',
      'ban-phim-razer-rbw-v4',
      'ban-phim-razer-85a8c903',
      'ban-phim-razer-65a0d73a0069aece85a8c903',
    ]);
  });

  it('does not return duplicate collision candidates', () => {
    const candidates = getSlugCandidates('Mouse', 'en', 'mouse', 'a'.repeat(24));
    expect(new Set(candidates).size).to.equal(candidates.length);
  });
});
