const test = require('node:test');
const assert = require('node:assert/strict');
const { parseProductId } = require('../utils/retranslateProductFilter');

test('accepts and normalizes a MongoDB product ID', () => {
  assert.equal(parseProductId('6AC654F40069AECE85A13500'), '6ac654f40069aece85a13500');
});

test('rejects an invalid product ID', () => {
  assert.throws(() => parseProductId('not-a-product-id'), /24-character MongoDB product ID/);
});
