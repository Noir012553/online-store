const test = require('node:test');
const assert = require('node:assert/strict');
const { splitText, translateProduct } = require('../src/productTranslator');

test('splitText keeps all content and prefers word boundaries', () => {
  const source = 'one two three four five six seven eight';
  const chunks = splitText(source, 12);
  assert.equal(chunks.join(''), source);
  assert.ok(chunks.every((chunk) => chunk.length <= 12 || chunk === chunks.at(-1)));
});

test('translateProduct translates all configured product fields', async () => {
  const calls = [];
  const client = {
    async translate(text, source, target) {
      calls.push({ text, source, target });
      return `[${target}] ${text}`;
    },
  };
  const product = {
    name: 'Tên máy',
    description: 'Mô tả',
    technicalDescription: 'Thông số kỹ thuật',
    specs: { RAM: '16GB' },
    descriptionImages: [{ alt: 'Ảnh sản phẩm', url: '/image.jpg' }],
    promotions: [{ title: 'Khuyến mãi', giftProductName: 'Chuột' }],
  };

  const translated = await translateProduct(product, {
    client,
    sourceLang: 'vi',
    targetLang: 'en',
    descriptionChunkSize: 6000,
  });

  assert.equal(translated.name, '[en] Tên máy');
  assert.equal(translated.description, '[en] Mô tả');
  assert.equal(translated.technicalDescription, '[en] Thông số kỹ thuật');
  assert.equal(translated.specs.RAM, '[en] 16GB');
  assert.equal(translated.descriptionImages[0].alt, '[en] Ảnh sản phẩm');
  assert.equal(translated.promotions[0].title, '[en] Khuyến mãi');
  assert.equal(translated.promotions[0].giftProductName, '[en] Chuột');
  assert.equal(translated.descriptionImages[0].url, '/image.jpg');
  assert.equal(calls.length, 7);
});
