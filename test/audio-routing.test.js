'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const config = JSON.parse(readFileSync(new URL('../vercel.json', `file://${__filename}`), 'utf8'));
const sha = '987cd1dba5ba14198c77596e855caa960921c74a5a6f0fa12679b068f06ead08';
const path = `/audio/${sha}.ogg`;
const routes = config.routes;
// هذا فحص عقد الإعدادات، وليس محاكاةً لشبكة Vercel أو إثباتاً للنشر.
function resolve(pathname, method) {
  for (const route of routes) {
    if (route.handle === 'filesystem') return null;
    const match = route.src && pathname.match(new RegExp(route.src));
    if (!match || (route.methods && !route.methods.includes(method))) continue;
    return { ...route, destination: route.dest && pathname.replace(new RegExp(route.src), route.dest) };
  }
  return null;
}
test('يبقى رابط الصوت نفسه ويُخدم من المصدر الثابت عبر CDN بلا دالة أو تحويل متصفح', () => {
  for (const method of ['GET', 'HEAD']) {
    const route = resolve(path, method);
    assert.equal(route.destination, `https://media.menbar.app/serving/${sha}.ogg`);
    assert.equal(route.status, undefined);
    assert.equal(route.headers.Location, undefined);
    assert.equal(route.headers['Access-Control-Allow-Origin'], '*');
    assert.equal(route.headers['x-vercel-enable-rewrite-caching'], '1');
    assert.deepEqual(route.transforms.map(t => [t.type, t.op, t.target.key]), [
      ['request.headers', 'delete', 'authorization'],
      ['request.headers', 'delete', 'cookie'],
    ]);
  }
});
test('تُحفظ سياسة المصدر ولا نفرض كاش سنة على أخطاء المصدر أو Range', () => {
  const route = resolve(path, 'GET');
  for (const header of ['Cache-Control', 'CDN-Cache-Control', 'Vercel-CDN-Cache-Control', 'Content-Length', 'Content-Range']) {
    assert.equal(route.headers[header], undefined);
  }
  for (const header of ['Content-Length', 'Content-Range', 'Accept-Ranges', 'ETag']) {
    assert.ok(route.headers['Access-Control-Expose-Headers'].includes(header));
  }
});
test('طلب CORS الاستباقي لا يمر إلى المصدر', () => {
  const route = resolve(path, 'OPTIONS');
  assert.equal(route.status, 204);
  assert.equal(route.dest, undefined);
  assert.equal(route.headers['Access-Control-Allow-Headers'], 'Range, If-None-Match');
});
test('لا يسمح المسار بكتابة أو حذف على المصدر', () => {
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
    const route = resolve(path, method);
    assert.equal(route.status, 405);
    assert.equal(route.dest, undefined);
  }
});
test('لا يقبل إلا بصمة SHA-256 صغيرة الحروف ولا يفتح بروكسي عشوائياً', () => {
  for (const invalid of [
    `/audio/${'a'.repeat(63)}.ogg`, `/audio/${'a'.repeat(65)}.ogg`,
    `/audio/${sha.toUpperCase()}.ogg`, `/audio/${sha}.mp3`,
    `/audio/${sha}.ogg/extra`, '/audio/https://example.com/a.ogg',
    '/audio/%2e%2e/private.ogg', '/audio/not-a-sha.ogg',
  ]) assert.equal(resolve(invalid, 'GET'), null, invalid);
});
test('لا يبقى مسار عام موصولاً إلى دالة بث الصوت القديمة', () => {
  assert.ok(!routes.some(r => r.dest === '/api/audio.js'));
  assert.ok(readFileSync(new URL('../api/audio.js', `file://${__filename}`), 'utf8').includes('module.exports'));
});
test('كل روابط المرآة في اللقطة الحالية تبقى صالحة بلا تحديث أندرويد', () => {
  const catalog = JSON.parse(readFileSync(new URL('../api/catalog-fallback.json', `file://${__filename}`), 'utf8'));
  let checked = 0;
  for (const lesson of catalog.lessons) {
    if (!lesson.audioMirrorUrl) continue;
    const mirror = new URL(lesson.audioMirrorUrl);
    assert.equal(mirror.hostname, 'minbar-adkassahk.vercel.app');
    const route = resolve(mirror.pathname, 'GET');
    assert.ok(route, lesson.id);
    assert.equal(route.destination, lesson.audioUrl);
    checked++;
  }
  assert.ok(checked >= 100);
});
test('لا تتغير مسارات الكتالوج والمصحف والبصمات والأصول المثبتة', () => {
  assert.equal(resolve('/api/catalog', 'GET').dest, '/api/catalog.js');
  assert.equal(resolve('/v1/catalog', 'GET').dest, '/api/proxy.js');
  assert.ok(resolve('/assets/app.js', 'GET').destination.includes('@72fc90a1bc170f72d353e55805b67abef4cee11c/'));
  assert.ok(routes.some(r => r.dest === '/api/quran.js'));
  assert.ok(readFileSync('.well-known/assetlinks.json', 'utf8').length > 0);
});
test('الوصول المباشر إلى الدالة القديمة لا يبث ملفاً ولا يتجاوز مسار CDN', async () => {
  const handler = require('../api/audio');
  const previousFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => { calls++; throw new Error('لا ينبغي الوصول إلى المصدر'); };
  try {
    for (const url of ['/api/audio', '/api/audio.js', `/api/audio?sha=${sha}`]) {
      const res = { statusCode: 200, end(body) { this.body = body; } };
      await handler({ url, method: 'GET', headers: {} }, res);
      assert.equal(res.statusCode, 400);
      assert.equal(res.body, 'bad sha');
    }
    assert.equal(calls, 0);
  } finally { global.fetch = previousFetch; }
});
