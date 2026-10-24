const fs = require('fs');
const path = 'E:/dev-camp/24-9-26 copy 98/translation-workspace/data/import/assistant-batch-import-10-products.json';
let raw = fs.readFileSync(path, 'utf8');
if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
const parsed = JSON.parse(raw);
const all = parsed.records;
const CHUNK = 25;
(async () => {
  const login = await fetch('http://localhost:5000/api/users/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'superadmin@laptop.com', password: 'superadmin123' }),
  }).then((r) => r.json());
  const tok = login.accessToken || login.token;
  if (!tok) { console.log('LOGIN FAILED', JSON.stringify(login).slice(0, 300)); return; }
  for (let start = 0; start < all.length; start += CHUNK) {
    const recordsChunk = all.slice(start, start + CHUNK).map((r) => ({
      productId: r.productId, targetLang: r.targetLang, sourceHash: r.sourceHash, translations: r.translations,
    }));
    const payload = {
      records: recordsChunk,
      idempotencyKey: `assistant-batch-${Date.now()}-${start}`,
      assistantBatch: true,
      dryRun: true,
    };
    const res = await fetch('http://localhost:5000/api/translations/admin/products/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => null);
    console.log(`--- chunk ${start}..${start + recordsChunk.length - 1} -> HTTP ${res.status}`);
    if (!res.ok) {
      console.log(JSON.stringify(data).slice(0, 3000));
    } else {
      const d = data.data || {};
      console.log('total:', d.totalRecords, 'valid:', d.validRecords, 'insert:', d.wouldInsert, 'update:', d.wouldUpdate, 'skip:', d.wouldSkip);
      if (d.records) console.log('per-record:', JSON.stringify(d.records).slice(0, 2000));
      if (d.invalidRecords) console.log('invalid:', JSON.stringify(d.invalidRecords).slice(0, 2000));
    }
  }
})();
