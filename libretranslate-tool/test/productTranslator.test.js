const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { splitText, translateProduct } = require('../src/productTranslator');
const { LibreTranslateClient } = require('../src/libretranslateClient');

test('splitText keeps all content and prefers word boundaries', () => {
  const source = 'one two three four five six seven eight';
  const chunks = splitText(source, 12);
  assert.equal(chunks.join(''), source);
  assert.ok(chunks.every((chunk) => chunk.length <= 12 || chunk === chunks.at(-1)));
});

test('translateProduct preserves whitespace between translated chunks', async () => {
  const client = {
    async translate(text) {
      return text.trim();
    },
  };
  const translated = await translateProduct({
    name: 'Tên',
    description: 'one two three four five six',
  }, {
    client,
    sourceLang: 'vi',
    targetLang: 'en',
    descriptionChunkSize: 12,
  });

  assert.equal(translated.description, 'one two three four five six');
});

test('LibreTranslateClient supports local HTTP endpoints', async () => {
  const server = http.createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ translatedText: JSON.parse(body).q.toUpperCase() }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const { port } = server.address();
    const client = new LibreTranslateClient({
      baseUrl: `http://127.0.0.1:${port}`,
      timeoutMs: 1000,
      retries: 0,
    });
    assert.equal(await client.translate('hello', 'en', 'vi'), 'HELLO');
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('LibreTranslateClient opens a cooldown after 429 and recovers with one probe', async () => {
  let requestCount = 0;
  const server = http.createServer((request, response) => {
    requestCount += 1;
    response.setHeader('content-type', 'application/json');
    if (requestCount === 1) {
      response.statusCode = 429;
      response.end(JSON.stringify({ error: 'Too many requests' }));
      return;
    }
    response.end(JSON.stringify({ translatedText: 'HELLO' }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const { port } = server.address();
    const client = new LibreTranslateClient({
      baseUrl: `http://127.0.0.1:${port}`,
      timeoutMs: 1000,
      retries: 2,
      maxParallelRequests: 4,
      rateLimitCooldownMs: 30,
    });

    await assert.rejects(client.translate('hello', 'en', 'vi'), (error) => error.statusCode === 429);
    assert.equal(client.currentParallelRequests, 2);
    await assert.rejects(client.translate('hello', 'en', 'vi'), (error) => error.code === 'LIBRETRANSLATE_CIRCUIT_OPEN');
    assert.equal(requestCount, 1);
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(await client.translate('hello', 'en', 'vi'), 'HELLO');
    for (let index = 0; index < 19; index += 1) {
      await client.translate('hello', 'en', 'vi');
    }
    assert.equal(client.currentParallelRequests, 3);
    assert.equal(requestCount, 21);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('LibreTranslateClient backs off parallel requests after a timeout', async () => {
  const server = http.createServer(() => {});
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const { port } = server.address();
    const client = new LibreTranslateClient({
      baseUrl: `http://127.0.0.1:${port}`,
      timeoutMs: 20,
      retries: 0,
      maxParallelRequests: 4,
    });

    await assert.rejects(client.translate('hello', 'en', 'vi'), /timed out after 20ms/);
    assert.equal(client.currentParallelRequests, 2);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('LibreTranslateClient limits parallel requests', async () => {
  let activeRequests = 0;
  let maxActiveRequests = 0;
  const server = http.createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      activeRequests++;
      maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
      setTimeout(() => {
        activeRequests--;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ translatedText: JSON.parse(body).q.toUpperCase() }));
      }, 15);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const { port } = server.address();
    const client = new LibreTranslateClient({
      baseUrl: `http://127.0.0.1:${port}`,
      timeoutMs: 1000,
      retries: 0,
      maxParallelRequests: 2,
    });
    const results = await Promise.all([
      client.translate('one', 'en', 'vi'),
      client.translate('two', 'en', 'vi'),
      client.translate('three', 'en', 'vi'),
      client.translate('four', 'en', 'vi'),
    ]);

    assert.deepEqual(results, ['ONE', 'TWO', 'THREE', 'FOUR']);
    assert.equal(maxActiveRequests, 2);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
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
